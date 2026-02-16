// services/hardware/terminalHealthCheck.ts
// Background terminal health monitoring service (singleton pattern)

import { AppState, AppStateStatus } from "react-native";
import { SupabaseClient } from "@supabase/supabase-js";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { usePaymentTerminalStore } from "@/stores/usePaymentTerminalStore";
import { useToastStore } from "@/stores/useToastStore";
import type { StationPaymentTerminal } from "@/types/station";

// ============================================================================
// SINGLETON STATE
// ============================================================================

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_TOAST_THRESHOLD = 3;

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<
  typeof AppState.addEventListener
> | null = null;
let currentSupabase: SupabaseClient | null = null;
let currentTerminalId: string | null = null;
let currentPaymentTerminal: StationPaymentTerminal | null = null;
let consecutiveFailures = 0;
let toastShownForCurrentFailureStreak = false;

// ============================================================================
// HEALTH CHECK TICK
// ============================================================================

async function performHealthCheck(): Promise<void> {
  if (!currentSupabase || !currentTerminalId || !currentPaymentTerminal) return;

  // Skip if a payment is currently being processed
  const isProcessing = usePaymentTerminalStore.getState().isProcessingPayment;
  if (isProcessing) {
    console.log("[TerminalHealthCheck] Skipped (payment in progress)");
    return;
  }

  try {
    const dejavooAPI = new DejavooSpinAPI(currentSupabase);
    const loaded = await dejavooAPI.loadTerminal(
      currentTerminalId,
      currentPaymentTerminal,
    );

    if (!loaded) {
      handleFailure("Failed to load terminal credentials");
      return;
    }

    const statusResult = await dejavooAPI.checkStatus();

    if (statusResult.success && statusResult.status === "Online") {
      handleSuccess();
    } else {
      handleFailure(
        statusResult.error || `Terminal status: ${statusResult.status}`,
      );
    }
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Health check failed";
    handleFailure(errorMsg);
  }
}

function handleSuccess(): void {
  consecutiveFailures = 0;
  toastShownForCurrentFailureStreak = false;

  // Update store with healthy status
  if (currentTerminalId) {
    usePaymentTerminalStore.getState().updateTerminalStatus(currentTerminalId, {
      isConnected: true,
      lastConnectionStatus: "Online",
      lastConnectionTest: new Date().toISOString(),
      consecutiveFailures: 0,
      lastErrorMessage: null,
    });
  }

  // Update database
  updateDatabaseHealth(true, "Online", null);

  console.log("[TerminalHealthCheck] Terminal online");
}

function handleFailure(errorMessage: string): void {
  consecutiveFailures++;

  // Update store with failure status
  if (currentTerminalId) {
    usePaymentTerminalStore.getState().updateTerminalStatus(currentTerminalId, {
      isConnected: false,
      lastConnectionStatus: "Offline",
      lastConnectionTest: new Date().toISOString(),
      consecutiveFailures,
      lastErrorMessage: errorMessage,
    });
  }

  // Update database
  updateDatabaseHealth(false, "Offline", errorMessage);

  console.warn(
    `[TerminalHealthCheck] Failure #${consecutiveFailures}: ${errorMessage}`,
  );

  // Show toast warning after threshold consecutive failures (once per streak)
  if (
    consecutiveFailures >= FAILURE_TOAST_THRESHOLD &&
    !toastShownForCurrentFailureStreak
  ) {
    toastShownForCurrentFailureStreak = true;
    useToastStore.getState().show({
      title: "Terminal Offline",
      message: `Payment terminal has been unreachable for ${consecutiveFailures} consecutive checks. Please verify the terminal connection.`,
      type: "warning",
      duration: 8000,
    });
  }
}

async function updateDatabaseHealth(
  isConnected: boolean,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  if (!currentSupabase || !currentTerminalId) return;

  try {
    const { error } = await currentSupabase.rpc("update_terminal_health", {
      p_terminal_id: currentTerminalId,
      p_is_connected: isConnected,
      p_status: status,
      p_consecutive_failures: consecutiveFailures,
      p_last_error_message: errorMessage,
    });

    if (error) {
      console.warn("[TerminalHealthCheck] RPC error:", error.message);
    }
  } catch (e) {
    console.warn("[TerminalHealthCheck] Failed to update database:", e);
  }
}

// ============================================================================
// APP STATE HANDLING
// ============================================================================

function handleAppState(nextState: AppStateStatus): void {
  if (nextState === "active") {
    // Resume: send immediate check and restart interval
    if (!intervalId && currentTerminalId) {
      performHealthCheck();
      const intervalMs =
        (currentPaymentTerminal?.health_check_interval ?? 300) * 1000 ||
        DEFAULT_HEALTH_CHECK_INTERVAL_MS;
      intervalId = setInterval(performHealthCheck, intervalMs);
      console.log("[TerminalHealthCheck] Resumed on app active");
    }
  } else {
    // Background/inactive: pause interval to save battery
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("[TerminalHealthCheck] Paused (app backgrounded)");
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startTerminalHealthCheck(
  supabase: SupabaseClient,
  terminalId: string,
  paymentTerminal: StationPaymentTerminal,
): void {
  // Avoid duplicate starts
  if (intervalId) {
    stopTerminalHealthCheck();
  }

  currentSupabase = supabase;
  currentTerminalId = terminalId;
  currentPaymentTerminal = paymentTerminal;
  consecutiveFailures = 0;
  toastShownForCurrentFailureStreak = false;

  // Determine interval from terminal config or use default
  const intervalMs =
    (paymentTerminal.health_check_interval ?? 300) * 1000 ||
    DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  // Send initial health check immediately
  performHealthCheck();

  // Start interval
  intervalId = setInterval(performHealthCheck, intervalMs);

  // Listen for app state changes
  appStateSubscription = AppState.addEventListener("change", handleAppState);

  console.log(
    `[TerminalHealthCheck] Started for terminal ${terminalId} (every ${intervalMs / 1000}s)`,
  );
}

export function stopTerminalHealthCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  currentSupabase = null;
  currentTerminalId = null;
  currentPaymentTerminal = null;
  consecutiveFailures = 0;
  toastShownForCurrentFailureStreak = false;

  console.log("[TerminalHealthCheck] Stopped");
}

export function isTerminalHealthCheckRunning(): boolean {
  return intervalId !== null;
}
