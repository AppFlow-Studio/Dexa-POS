// services/hardware/terminalHealthCheck.ts
// Background terminal health monitoring service (singleton pattern)

import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { SupabaseClient } from "@supabase/supabase-js";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { probeCastlesTerminal, getSharedCastlesService } from "@/services/terminals/castles-service";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { deferStoreUpdate } from "@/lib/deferredStoreUpdate";
import { isRecentlyNavigated } from "@/lib/rootNavigation";
import { usePaymentTerminalStore } from "@/stores/usePaymentTerminalStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import type { StationPaymentTerminal } from "@/types/station";

// ============================================================================
// SINGLETON STATE
// ============================================================================

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 90 * 1000; // 90 seconds
const FAILURE_TOAST_THRESHOLD = 3;

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<
  typeof AppState.addEventListener
> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
let wasConnected = true;
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

  // Don't fight the suspend — probing a closed/closing socket is wasted work.
  if (getSharedCastlesService().isSuspended()) return;

  // Skip if a payment is currently being processed
  const isProcessing = usePaymentTerminalStore.getState().isProcessingPayment;
  if (isProcessing) {
    console.log("[TerminalHealthCheck] Skipped (payment in progress)");
    return;
  }

  if (currentPaymentTerminal.terminal_type === "castles") {
    await performCastlesHealthCheck();
  } else {
    await performDejavooHealthCheck();
  }
}

async function performCastlesHealthCheck(): Promise<void> {
  const isUsb = currentPaymentTerminal?.connection_type === 'usb';

  if (isUsb) {
    // USB probe: just try to connect via USB transport
    const result = await probeCastlesTerminal({ connectionType: 'usb' });
    if (result.online) {
      handleSuccess();
    } else {
      handleFailure(result.error || "USB terminal unreachable");
    }
    return;
  }

  // TCP/WiFi probe
  const host = currentPaymentTerminal?.ip_address;
  if (!host) {
    handleFailure("Castles terminal IP address not configured");
    return;
  }

  const port = currentPaymentTerminal?.port ?? CASTLES_DEFAULT_PORT;
  const result = await probeCastlesTerminal({ connectionType: 'local_socket', host, port });

  if (result.online) {
    handleSuccess();
  } else {
    handleFailure(result.error || "Terminal unreachable");
  }
}

async function performDejavooHealthCheck(): Promise<void> {
  try {
    const dejavooAPI = new DejavooSpinAPI(currentSupabase!);
    const loaded = await dejavooAPI.loadTerminal(
      currentTerminalId!,
      currentPaymentTerminal!,
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
  const wasPreviouslyFailing = consecutiveFailures > 0;
  consecutiveFailures = 0;
  toastShownForCurrentFailureStreak = false;

  // Defer store updates to next frame — avoids interrupting in-progress renders
  if (currentTerminalId) {
    const tid = currentTerminalId;
    const ts = new Date().toISOString();
    deferStoreUpdate(() => {
      usePaymentTerminalStore.getState().updateTerminalStatus(tid, {
        isConnected: true,
        lastConnectionStatus: "Online",
        lastConnectionTest: ts,
        consecutiveFailures: 0,
        lastErrorMessage: null,
      });
      syncToStationStore(true);
    });
  }

  // Update database (async, no store impact)
  updateDatabaseHealth(true, "Online", null);

  // If terminal recovered from a failure streak, pre-warm CastlesService and show toast
  if (wasPreviouslyFailing) {
    if (!isRecentlyNavigated(1000)) {
      useToastStore.getState().show({
        title: "Terminal Back Online",
        message: `${currentPaymentTerminal?.terminal_name ?? "Payment terminal"} reconnected.`,
        type: "success",
        duration: 5000,
      });
    }

    // Pre-warm CastlesService singleton if applicable
    if (currentPaymentTerminal?.terminal_type === "castles" && currentTerminalId) {
      preWarmCastlesService();
    }
  }

  console.log("[TerminalHealthCheck] Terminal online");
}

function handleFailure(errorMessage: string): void {
  consecutiveFailures++;

  // Defer store updates to next frame — avoids interrupting in-progress renders
  if (currentTerminalId) {
    const tid = currentTerminalId;
    const ts = new Date().toISOString();
    const failures = consecutiveFailures;
    deferStoreUpdate(() => {
      usePaymentTerminalStore.getState().updateTerminalStatus(tid, {
        isConnected: false,
        lastConnectionStatus: "Offline",
        lastConnectionTest: ts,
        consecutiveFailures: failures,
        lastErrorMessage: errorMessage,
      });
      syncToStationStore(false);
    });
  }

  // Update database (async, no store impact)
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
    if (!isRecentlyNavigated(1000)) {
      useToastStore.getState().show({
        title: "Terminal Offline",
        message: `Payment terminal has been unreachable for ${consecutiveFailures} consecutive checks. Please verify the terminal connection.`,
        type: "warning",
        duration: 8000,
      });
    }
  }
}

/**
 * Sync the health check result to `selectedStation.payment_terminal` in
 * useStoreSettingsStore so the payment-systems UI reflects live status
 * without requiring a page reload.
 */
function syncToStationStore(isConnected: boolean): void {
  const storeSettings = useStoreSettingsStore.getState();
  const station = storeSettings.selectedStation;
  if (station?.payment_terminal?.id === currentTerminalId) {
    storeSettings.setSelectedStation({
      ...station,
      payment_terminal: {
        ...station.payment_terminal,
        is_connected: isConnected,
        last_connection_status: isConnected ? "Online" : "Offline",
        last_connection_test_at: new Date().toISOString(),
      },
    });
  }
}

/**
 * Pre-warm the shared CastlesService singleton after a terminal recovers
 * from offline so the next payment doesn't need a cold connect.
 */
async function preWarmCastlesService(): Promise<void> {
  if (!currentPaymentTerminal || !currentTerminalId) return;
  const service = getSharedCastlesService();
  if (service.isSuspended()) {
    return; // Don't fight the suspend; resume() will handle it.
  }
  const isUsb = currentPaymentTerminal.connection_type === 'usb';
  try {
    await service.connect({
      connectionType: isUsb ? 'usb' : 'local_socket',
      host: isUsb ? undefined : (currentPaymentTerminal.ip_address ?? undefined),
      port: isUsb ? undefined : (currentPaymentTerminal.port ?? CASTLES_DEFAULT_PORT),
      timeout: 10000,
      terminalId: currentTerminalId,
    });
    console.log("[TerminalHealthCheck] CastlesService pre-warmed after recovery");
  } catch {
    // Non-fatal — the payment flow will connect on demand
    console.log("[TerminalHealthCheck] CastlesService pre-warm failed (non-fatal)");
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
        (currentPaymentTerminal?.health_check_interval ?? 0) * 1000 ||
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
  // Avoid duplicate starts — also clean up orphaned listeners from backgrounding
  // (backgrounding nulls intervalId but leaves appStateSubscription/netInfoUnsubscribe alive)
  if (intervalId || appStateSubscription || netInfoUnsubscribe) {
    stopTerminalHealthCheck();
  }

  currentSupabase = supabase;
  currentTerminalId = terminalId;
  currentPaymentTerminal = paymentTerminal;
  consecutiveFailures = 0;
  toastShownForCurrentFailureStreak = false;

  // Determine interval from terminal config or use default
  const intervalMs =
    (paymentTerminal.health_check_interval ?? 0) * 1000 ||
    DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  // Send initial health check immediately
  performHealthCheck();

  // Start interval
  intervalId = setInterval(performHealthCheck, intervalMs);

  // Listen for app state changes
  appStateSubscription = AppState.addEventListener("change", handleAppState);

  // Listen for network connectivity changes — trigger immediate health check
  // when WiFi reconnects so terminals recover in seconds instead of waiting
  // for the next interval.
  wasConnected = true;
  netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const isNow = state.isConnected ?? false;
    if (!wasConnected && isNow) {
      console.log("[TerminalHealthCheck] Network reconnected, immediate check");
      performHealthCheck();
    }
    wasConnected = isNow;
  });

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

  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
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
