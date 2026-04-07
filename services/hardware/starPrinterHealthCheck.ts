// services/hardware/starPrinterHealthCheck.ts
// Background Star Micronics printer health monitoring (singleton pattern)

import { AppState, AppStateStatus } from "react-native";
import { StarIO10InUseError } from "react-native-star-io10";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { useToastStore } from "@/stores/useToastStore";
import { getStarPrinterMutex } from "@/services/printing/starPrinterMutex";
import {
  createStarPrinterInstance,
  disposeQuietly,
} from "@/services/printing/starPrinterFactory";
import type { PrinterConfig } from "@/types/printer";

// ============================================================================
// CONSTANTS
// ============================================================================

const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const STAGGER_DELAY_MS = 2000; // 2s between printers
const FAILURE_TOAST_THRESHOLD = 3;
const PROBE_TIMEOUT_MS = 5000;

// ============================================================================
// SINGLETON STATE
// ============================================================================

interface PrinterHealthState {
  consecutiveFailures: number;
  toastShownForStreak: boolean;
  lastCheckAt: number;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<
  typeof AppState.addEventListener
> | null = null;
let currentLocationId: string | null = null;
let isChecking = false;
const printerStates = new Map<string, PrinterHealthState>();

// ============================================================================
// HELPERS
// ============================================================================

function getStarPrinters(): PrinterConfig[] {
  return usePrinterStore
    .getState()
    .printers.filter(
      (p) => p.printerType === "star_micronics" && p.isActive && p.networkAddress,
    );
}

function isPrinterBusy(printerId: string): boolean {
  return usePrintQueueStore
    .getState()
    .jobs.some((j) => j.printerId === printerId && j.status === "processing");
}

function getState(printerId: string): PrinterHealthState {
  let state = printerStates.get(printerId);
  if (!state) {
    state = { consecutiveFailures: 0, toastShownForStreak: false, lastCheckAt: 0 };
    printerStates.set(printerId, state);
  }
  return state;
}

function isDefaultPrinter(printer: PrinterConfig): boolean {
  return printer.isDefaultReceipt || printer.isDefaultKitchen;
}

function getDefaultRole(printer: PrinterConfig): string {
  if (printer.isDefaultReceipt && printer.isDefaultKitchen) return "receipt & kitchen";
  if (printer.isDefaultReceipt) return "receipt";
  if (printer.isDefaultKitchen) return "kitchen";
  return "";
}

function findAlternativePrinter(
  offlinePrinter: PrinterConfig,
  allPrinters: PrinterConfig[],
): PrinterConfig | null {
  return (
    allPrinters.find(
      (p) =>
        p.id !== offlinePrinter.id &&
        p.printerType === "star_micronics" &&
        p.isActive &&
        p.isConnected &&
        ((offlinePrinter.isDefaultReceipt && p.printerRole === "receipt") ||
          (offlinePrinter.isDefaultKitchen && p.printerRole === "kitchen") ||
          p.printerRole === offlinePrinter.printerRole),
    ) ?? null
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// PROBE (isolated from DriverFactory)
// ============================================================================

async function probePrinter(
  networkAddress: string,
): Promise<{ online: boolean; error?: string }> {
  const mutex = getStarPrinterMutex(networkAddress);

  // If a print job is in progress (mutex locked), skip the health check —
  // we know the printer is reachable since it's actively printing.
  if (mutex.isLocked()) {
    return { online: true };
  }

  return mutex.runExclusive(async () => {
    const probe = createStarPrinterInstance(networkAddress, "probe");

    try {
      await probe.open();
      const status = await probe.getStatus();
      await probe.close();

      if (status.hasError) {
        const msg = status.paperEmpty
          ? "Paper empty"
          : status.coverOpen
            ? "Cover open"
            : "Printer error";
        return { online: false, error: msg };
      }

      return { online: true };
    } catch (e: any) {
      // InUseError means the printer is reachable but held by another connection
      // (e.g. another POS station). Report as online — it's not offline.
      if (e instanceof StarIO10InUseError) {
        return { online: true };
      }
      try {
        await probe.close();
      } catch {
        // ignore close errors
      }
      return { online: false, error: e.message };
    } finally {
      await disposeQuietly(probe);
    }
  });
}

// ============================================================================
// STATUS HANDLERS
// ============================================================================

function handlePrinterOnline(printer: PrinterConfig): void {
  const state = getState(printer.id);
  const wasDown = state.consecutiveFailures >= FAILURE_TOAST_THRESHOLD && state.toastShownForStreak;

  state.consecutiveFailures = 0;
  state.toastShownForStreak = false;
  state.lastCheckAt = Date.now();

  // Update store + backend
  usePrinterStore.getState().syncPrinterStatus(printer.id, {
    isConnected: true,
    lastStatus: "Online",
    errorCount: 0,
  });

  if (wasDown && isDefaultPrinter(printer)) {
    useToastStore.getState().show({
      title: "Printer Back Online",
      message: `${printer.printerName} is now online.`,
      type: "success",
      duration: 5000,
    });
  }

  console.log(`[StarPrinterHealthCheck] ${printer.printerName} online`);
}

function handlePrinterOffline(printer: PrinterConfig, errorMessage: string): void {
  const state = getState(printer.id);
  state.consecutiveFailures++;
  state.lastCheckAt = Date.now();

  // Update store + backend
  usePrinterStore.getState().syncPrinterStatus(printer.id, {
    isConnected: false,
    lastStatus: errorMessage,
    errorCount: state.consecutiveFailures,
  });

  console.warn(
    `[StarPrinterHealthCheck] ${printer.printerName} failure #${state.consecutiveFailures}: ${errorMessage}`,
  );

  // Toast warning for default printers after threshold (once per streak)
  if (
    state.consecutiveFailures >= FAILURE_TOAST_THRESHOLD &&
    !state.toastShownForStreak &&
    isDefaultPrinter(printer)
  ) {
    state.toastShownForStreak = true;
    const role = getDefaultRole(printer);
    const allPrinters = getStarPrinters();
    const alt = findAlternativePrinter(printer, allPrinters);

    const suggestion = alt
      ? `Consider switching to "${alt.printerName}" as an alternative.`
      : "Please check the printer connection.";

    useToastStore.getState().show({
      title: "Printer Offline",
      message: `Default ${role} printer "${printer.printerName}" is unreachable. ${suggestion}`,
      type: "warning",
      duration: 8000,
    });
  }
}

// ============================================================================
// HEALTH CHECK TICK
// ============================================================================

async function performHealthCheckRound(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    const printers = getStarPrinters();

    if (printers.length === 0) {
      return;
    }

    // Clean up state for removed printers
    for (const id of printerStates.keys()) {
      if (!printers.some((p) => p.id === id)) {
        printerStates.delete(id);
      }
    }

    for (let i = 0; i < printers.length; i++) {
      const printer = printers[i];

      // Stagger between printers (skip delay for first)
      if (i > 0) {
        await sleep(STAGGER_DELAY_MS);
      }

      // Skip busy printers
      if (isPrinterBusy(printer.id)) {
        console.log(
          `[StarPrinterHealthCheck] Skipped ${printer.printerName} (busy)`,
        );
        continue;
      }

      const result = await probePrinter(printer.networkAddress!);

      if (result.online) {
        handlePrinterOnline(printer);
      } else {
        handlePrinterOffline(printer, result.error ?? "Unknown error");
      }
    }
  } finally {
    isChecking = false;
  }
}

// ============================================================================
// APP STATE HANDLING
// ============================================================================

function handleAppState(nextState: AppStateStatus): void {
  if (nextState === "active") {
    if (!intervalId && currentLocationId) {
      performHealthCheckRound();
      intervalId = setInterval(performHealthCheckRound, HEALTH_CHECK_INTERVAL_MS);
      console.log("[StarPrinterHealthCheck] Resumed on app active");
    }
  } else {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("[StarPrinterHealthCheck] Paused (app backgrounded)");
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startStarPrinterHealthCheck(locationId: string): void {
  // Avoid duplicate starts
  if (intervalId) {
    stopStarPrinterHealthCheck();
  }

  currentLocationId = locationId;
  printerStates.clear();
  isChecking = false;

  // Initial check immediately
  performHealthCheckRound();

  // Start interval
  intervalId = setInterval(performHealthCheckRound, HEALTH_CHECK_INTERVAL_MS);

  // Listen for app state changes
  appStateSubscription = AppState.addEventListener("change", handleAppState);

  console.log(
    `[StarPrinterHealthCheck] Started for location ${locationId} (every ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`,
  );
}

export function stopStarPrinterHealthCheck(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  currentLocationId = null;
  printerStates.clear();
  isChecking = false;

  console.log("[StarPrinterHealthCheck] Stopped");
}

export function isStarPrinterHealthCheckRunning(): boolean {
  return intervalId !== null;
}
