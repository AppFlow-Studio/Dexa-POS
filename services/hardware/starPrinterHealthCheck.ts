// services/hardware/starPrinterHealthCheck.ts
// Background Star Micronics printer health monitoring (singleton pattern)

import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { StarIO10InUseError } from "react-native-star-io10";
import { deferStoreUpdate } from "@/lib/deferredStoreUpdate";
import { isRecentlyNavigated } from "@/lib/rootNavigation";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { useToastStore } from "@/stores/useToastStore";
import { getStarPrinterMutex } from "@/services/printing/starPrinterMutex";
import { getLastStarSuccess } from "@/services/printing/starPrintActivity";
import {
  createStarPrinterInstance,
  disposeQuietly,
} from "@/services/printing/starPrinterFactory";
import {
  discoverStarPrinters,
} from "@/services/printing/discovery/StarPrinterDiscovery";
import type { PrinterConfig } from "@/types/printer";

// ============================================================================
// CONSTANTS
// ============================================================================

const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const STAGGER_DELAY_MS = 2000; // 2s between printers
const FAILURE_TOAST_THRESHOLD = 3;
const PROBE_TIMEOUT_MS = 5000;
// Skip the probe when a real SDK operation (print / status / drawer) on this
// printer succeeded within this window — the printer is demonstrably healthy
// and an extra `open()` risks colliding with a peer device on the printer's
// small TCP backlog.
const RECENT_SUCCESS_SKIP_MS = 60_000;

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
let netInfoUnsubscribe: (() => void) | null = null;
let wasConnected = true; // assume connected initially
let currentLocationId: string | null = null;
let isChecking = false;
const printerStates = new Map<string, PrinterHealthState>();

// DHCP recovery: track which printers have already attempted a recovery scan
// to avoid repeated scans during the same failure streak
const dhcpRecoveryAttempted = new Set<string>();

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

interface ProbeResult {
  online: boolean;
  error?: string;
  paperNearEmpty?: boolean;
  paperEmpty?: boolean;
  coverOpen?: boolean;
  cutterError?: boolean;
  paperJamError?: boolean;
  printHeadOverTemperature?: boolean;
  detectedPaperWidth?: number;
  drawerOpen?: boolean;
}

async function probePrinter(
  networkAddress: string,
): Promise<ProbeResult> {
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

      // Extract detailed status fields from the SDK
      const detail = (status as any).detail;
      const paperNearEmpty = !!(status as any).paperNearEmpty;
      const cutterError = !!detail?.cutterError;
      const paperJamError = !!detail?.paperJamError;
      const printHeadOverTemperature = !!detail?.printHeadOverTemperature;
      const detectedPaperWidth = detail?.detectedPaperWidth ?? undefined;
      const drawerOpen = !!(status as any).drawerOpenCloseSignal;

      if (status.hasError) {
        // Provide specific error messages based on detailed fault codes
        let msg = "Printer error";
        if (status.paperEmpty) msg = "Paper empty";
        else if (status.coverOpen) msg = "Cover open";
        else if (cutterError) msg = "Cutter error";
        else if (paperJamError) msg = "Paper jam";
        else if (printHeadOverTemperature) msg = "Print head overheating";

        return {
          online: false,
          error: msg,
          paperNearEmpty,
          paperEmpty: status.paperEmpty,
          coverOpen: status.coverOpen,
          cutterError,
          paperJamError,
          printHeadOverTemperature,
          detectedPaperWidth,
          drawerOpen,
        };
      }

      return {
        online: true,
        paperNearEmpty,
        detectedPaperWidth,
        drawerOpen,
      };
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

function handlePrinterOnline(printer: PrinterConfig, result?: ProbeResult): void {
  const state = getState(printer.id);
  const wasDown = state.consecutiveFailures >= FAILURE_TOAST_THRESHOLD && state.toastShownForStreak;

  state.consecutiveFailures = 0;
  state.toastShownForStreak = false;
  state.lastCheckAt = Date.now();

  // Reset DHCP recovery flag on successful check
  dhcpRecoveryAttempted.delete(printer.id);

  // Defer store update to next frame — avoids interrupting in-progress renders
  const pid = printer.id;
  deferStoreUpdate(() => {
    usePrinterStore.getState().syncPrinterStatus(pid, {
      isConnected: true,
      lastStatus: "Online",
      errorCount: 0,
    });
  });

  if (wasDown && isDefaultPrinter(printer) && !isRecentlyNavigated(1000)) {
    useToastStore.getState().show({
      title: "Printer Back Online",
      message: `${printer.printerName} is now online.`,
      type: "success",
      duration: 5000,
    });
  }

  // Warn about paper running low on default printers
  if (result?.paperNearEmpty && isDefaultPrinter(printer) && !isRecentlyNavigated(1000)) {
    useToastStore.getState().show({
      title: "Paper Running Low",
      message: `${printer.printerName} paper is running low. Replace soon.`,
      type: "warning",
      duration: 6000,
    });
  }

  console.log(`[StarPrinterHealthCheck] ${printer.printerName} online`);
}

function handlePrinterOffline(printer: PrinterConfig, errorMessage: string): void {
  const state = getState(printer.id);
  state.consecutiveFailures++;
  state.lastCheckAt = Date.now();

  // Defer store update to next frame — avoids interrupting in-progress renders
  const pid = printer.id;
  const failures = state.consecutiveFailures;
  deferStoreUpdate(() => {
    usePrinterStore.getState().syncPrinterStatus(pid, {
      isConnected: false,
      lastStatus: errorMessage,
      errorCount: failures,
    });
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

    if (!isRecentlyNavigated(1000)) {
      useToastStore.getState().show({
        title: "Printer Offline",
        message: `Default ${role} printer "${printer.printerName}" is unreachable. ${suggestion}`,
        type: "warning",
        duration: 8000,
      });
    }
  }

  // DHCP IP Auto-Recovery: after threshold failures, if printer has MAC address,
  // run a background scan to find the printer at its new IP.
  // Only attempt once per failure streak to avoid repeated scans.
  const macAddress = (printer.metadata as Record<string, unknown> | null)?.macAddress as string | undefined;
  if (
    state.consecutiveFailures >= FAILURE_TOAST_THRESHOLD &&
    macAddress &&
    !dhcpRecoveryAttempted.has(printer.id)
  ) {
    dhcpRecoveryAttempted.add(printer.id);
    attemptDhcpRecovery(printer, macAddress);
  }
}

/**
 * Attempts to find a printer that moved to a new IP via DHCP.
 * Runs a short background discovery scan, matches by MAC address,
 * and updates the printer config if found at a new IP.
 * Fire-and-forget — non-blocking.
 */
function attemptDhcpRecovery(printer: PrinterConfig, macAddress: string): void {
  console.log(
    `[StarPrinterHealthCheck] Attempting DHCP recovery for ${printer.printerName} (MAC: ${macAddress})`,
  );

  // Fire-and-forget — don't block health check
  discoverStarPrinters(5000)
    .then(async (discovered) => {
      const match = discovered.find(
        (d) => d.macAddress && d.macAddress.toLowerCase() === macAddress.toLowerCase(),
      );

      if (!match || match.ipAddress === printer.networkAddress) {
        console.log(
          `[StarPrinterHealthCheck] DHCP recovery: no new IP found for ${printer.printerName}`,
        );
        return;
      }

      console.log(
        `[StarPrinterHealthCheck] DHCP recovery: ${printer.printerName} moved ${printer.networkAddress} → ${match.ipAddress}`,
      );

      // Update the printer config with the new IP
      const store = usePrinterStore.getState();
      await store.updatePrinterConfig(printer.id, {
        networkAddress: match.ipAddress,
      });

      // Immediately verify at new IP
      const verifyResult = await probePrinter(match.ipAddress);
      if (verifyResult.online) {
        handlePrinterOnline(
          { ...printer, networkAddress: match.ipAddress },
          verifyResult,
        );

        useToastStore.getState().show({
          title: "Printer Reconnected",
          message: `${printer.printerName} moved to ${match.ipAddress}. Connection restored.`,
          type: "success",
          duration: 6000,
        });
      }
    })
    .catch((e) => {
      console.warn(
        `[StarPrinterHealthCheck] DHCP recovery scan failed for ${printer.printerName}:`,
        e,
      );
    });
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

      // Skip if a real SDK op succeeded very recently — the probe would just
      // duplicate work and risk a TCP-backlog collision against a peer device.
      const sinceLastOk = Date.now() - getLastStarSuccess(printer.networkAddress!);
      if (sinceLastOk < RECENT_SUCCESS_SKIP_MS) {
        const state = getState(printer.id);
        state.consecutiveFailures = 0;
        state.lastCheckAt = Date.now();
        continue;
      }

      const result = await probePrinter(printer.networkAddress!);

      if (result.online) {
        handlePrinterOnline(printer, result);
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
  // Avoid duplicate starts — also clean up orphaned listeners from backgrounding
  // (backgrounding nulls intervalId but leaves appStateSubscription/netInfoUnsubscribe alive)
  if (intervalId || appStateSubscription || netInfoUnsubscribe) {
    stopStarPrinterHealthCheck();
  }

  currentLocationId = locationId;
  printerStates.clear();
  dhcpRecoveryAttempted.clear();
  isChecking = false;
  wasConnected = true;

  // Initial check immediately
  performHealthCheckRound();

  // Start interval
  intervalId = setInterval(performHealthCheckRound, HEALTH_CHECK_INTERVAL_MS);

  // Listen for app state changes
  appStateSubscription = AppState.addEventListener("change", handleAppState);

  // Listen for network connectivity changes — trigger immediate health check
  // when WiFi reconnects so printers recover in seconds instead of waiting
  // for the 2-minute interval.
  netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const isNow = state.isConnected ?? false;
    if (!wasConnected && isNow) {
      console.log("[StarPrinterHealthCheck] Network reconnected, triggering immediate health check");
      performHealthCheckRound();
    }
    wasConnected = isNow;
  });

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

  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }

  currentLocationId = null;
  printerStates.clear();
  dhcpRecoveryAttempted.clear();
  isChecking = false;

  console.log("[StarPrinterHealthCheck] Stopped");
}

export function isStarPrinterHealthCheckRunning(): boolean {
  return intervalId !== null;
}
