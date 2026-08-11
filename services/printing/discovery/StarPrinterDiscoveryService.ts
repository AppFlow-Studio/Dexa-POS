// services/printing/discovery/StarPrinterDiscoveryService.ts
// Background discovery service: periodically scans the LAN for Star printers
// and updates stored printer IPs when they change (DHCP recovery).
// Singleton pattern matching starPrinterHealthCheck.ts.

import {
  registerResumeTask,
  registerSuspendTask,
} from "@/lib/lifecycle/appLifecycleCoordinator";
import { isRecentlyNavigated } from "@/lib/rootNavigation";
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
/** Unregister fns for the lifecycle-coordinator tasks (was an AppState sub). */
let lifecycleUnregister: (() => void)[] = [];
let isScanning = false;

// ============================================================================
// CORE LOGIC
// ============================================================================

async function performDiscoveryRound(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    const store = usePrinterStore.getState();
    const starPrinters = store.printers.filter(
      (p) => p.printerType === "star_micronics" && p.isActive && p.networkAddress,
    );

    if (starPrinters.length === 0) return;

    // Skip the periodic LAN scan when every known Star printer with a stable
    // key (MAC or serial) is currently healthy at its stored IP. Discovery is
    // only useful for DHCP recovery; if nothing is broken, scanning adds
    // needless TCP traffic that can collide with the Star printer's small TCP
    // backlog and surface as "device busy" on a peer device.
    const candidates = starPrinters.filter((p) => {
      const mac = (p.metadata as Record<string, unknown> | null)?.macAddress;
      return !!mac || !!p.serialNumber;
    });
    const allHealthy =
      candidates.length > 0 && candidates.every((p) => p.isConnected);
    if (allHealthy) {
      return;
    }

    const discovered = await discoverStarPrinters(SCAN_TIMEOUT_MS);
    if (discovered.length === 0) return;

    for (const printer of starPrinters) {
      const macAddress = (printer.metadata as Record<string, unknown> | null)?.macAddress as string | undefined;
      if (!macAddress && !printer.serialNumber) continue;

      // MAC wins (LAN-interface identifier the SDK returns directly). Fall
      // back to serial_number for legacy rows that pre-date MAC capture.
      const match =
        (macAddress
          ? discovered.find(
              (d) =>
                d.macAddress &&
                d.macAddress.toLowerCase() === macAddress.toLowerCase(),
            )
          : undefined) ??
        (printer.serialNumber
          ? discovered.find(
              (d) =>
                d.serialNumber && d.serialNumber === printer.serialNumber,
            )
          : undefined);

      if (match && match.ipAddress !== printer.networkAddress) {
        console.log(
          `[StarDiscoveryService] IP change detected: ${printer.printerName} ${printer.networkAddress} → ${match.ipAddress}`,
        );

        // Update the printer config with the new IP
        await store.updatePrinterConfig(printer.id, {
          networkAddress: match.ipAddress,
        });

        if (!isRecentlyNavigated(1000)) {
          useToastStore.getState().show({
            title: "Printer IP Updated",
            message: `${printer.printerName} moved to ${match.ipAddress}.`,
            type: "success",
            duration: 5000,
          });
        }
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

/**
 * Resume half, run from the coordinator's `background` bucket. This one was
 * already the best-behaved site pre-migration — it restarts the interval
 * without firing an immediate scan — so bucketing it changes nothing except
 * removing its private AppState subscription.
 */
function handleResume(): void {
  if (!intervalId) {
    intervalId = setInterval(performDiscoveryRound, DISCOVERY_INTERVAL_MS);
    console.log("[StarDiscoveryService] Resumed on app active");
  }
}

function handleSuspend(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[StarDiscoveryService] Paused (app backgrounded)");
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startStarPrinterDiscoveryService(): void {
  if (intervalId || initialTimeoutId || lifecycleUnregister.length > 0) {
    stopStarPrinterDiscoveryService();
  }

  // Delay first scan to stagger with health check (which fires immediately on start)
  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    performDiscoveryRound();
    intervalId = setInterval(performDiscoveryRound, DISCOVERY_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  lifecycleUnregister = [
    registerResumeTask({
      id: "printing.star-discovery-resume",
      bucket: "background",
      run: handleResume,
    }),
    registerSuspendTask({
      id: "printing.star-discovery-suspend",
      run: handleSuspend,
    }),
  ];

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
  lifecycleUnregister.forEach((fn) => fn());
  lifecycleUnregister = [];
  isScanning = false;
  console.log("[StarDiscoveryService] Stopped");
}

export function isStarPrinterDiscoveryServiceRunning(): boolean {
  return intervalId !== null || initialTimeoutId !== null;
}
