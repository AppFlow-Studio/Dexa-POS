// services/printing/discovery/StarPrinterDiscoveryService.ts
// Background discovery service: periodically scans the LAN for Star printers
// and updates stored printer IPs when they change (DHCP recovery).
// Singleton pattern matching starPrinterHealthCheck.ts.

import { AppState, AppStateStatus } from "react-native";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { discoverStarPrinters } from "./StarPrinterDiscovery";
import { useToastStore } from "@/stores/useToastStore";

// ============================================================================
// CONSTANTS
// ============================================================================

const DISCOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Offset from health check start to avoid mutex contention
const INITIAL_DELAY_MS = 60 * 1000; // 1 minute after start
const SCAN_TIMEOUT_MS = 5000; // Short scan — just enough to find active printers

// ============================================================================
// SINGLETON STATE
// ============================================================================

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let isScanning = false;

// ============================================================================
// CORE LOGIC
// ============================================================================

async function performDiscoveryRound(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    const discovered = await discoverStarPrinters(SCAN_TIMEOUT_MS);
    if (discovered.length === 0) return;

    const store = usePrinterStore.getState();
    const starPrinters = store.printers.filter(
      (p) => p.printerType === "star_micronics" && p.isActive && p.networkAddress,
    );

    if (starPrinters.length === 0) return;

    for (const printer of starPrinters) {
      const macAddress = (printer.metadata as Record<string, unknown> | null)?.macAddress as string | undefined;
      if (!macAddress) continue;

      // Find this printer in discovered results by MAC
      const match = discovered.find(
        (d) => d.macAddress && d.macAddress.toLowerCase() === macAddress.toLowerCase(),
      );

      if (match && match.ipAddress !== printer.networkAddress) {
        console.log(
          `[StarDiscoveryService] IP change detected: ${printer.printerName} ${printer.networkAddress} → ${match.ipAddress}`,
        );

        // Update the printer config with the new IP
        await store.updatePrinterConfig(printer.id, {
          networkAddress: match.ipAddress,
        });

        useToastStore.getState().show({
          title: "Printer IP Updated",
          message: `${printer.printerName} moved to ${match.ipAddress}.`,
          type: "success",
          duration: 5000,
        });
      }
    }
  } catch (e) {
    console.warn("[StarDiscoveryService] Background scan failed:", e);
  } finally {
    isScanning = false;
  }
}

// ============================================================================
// APP STATE HANDLING
// ============================================================================

function handleAppState(nextState: AppStateStatus): void {
  if (nextState === "active") {
    if (!intervalId) {
      intervalId = setInterval(performDiscoveryRound, DISCOVERY_INTERVAL_MS);
      console.log("[StarDiscoveryService] Resumed on app active");
    }
  } else {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("[StarDiscoveryService] Paused (app backgrounded)");
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startStarPrinterDiscoveryService(): void {
  if (intervalId || initialTimeoutId) {
    stopStarPrinterDiscoveryService();
  }

  // Delay first scan to stagger with health check (which fires immediately on start)
  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    performDiscoveryRound();
    intervalId = setInterval(performDiscoveryRound, DISCOVERY_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  appStateSubscription = AppState.addEventListener("change", handleAppState);

  console.log(
    `[StarDiscoveryService] Started (every ${DISCOVERY_INTERVAL_MS / 1000}s, initial delay ${INITIAL_DELAY_MS / 1000}s)`,
  );
}

export function stopStarPrinterDiscoveryService(): void {
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  isScanning = false;
  console.log("[StarDiscoveryService] Stopped");
}

export function isStarPrinterDiscoveryServiceRunning(): boolean {
  return intervalId !== null || initialTimeoutId !== null;
}
