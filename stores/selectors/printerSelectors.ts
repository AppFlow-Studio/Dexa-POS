import type { DiscoveredStarPrinter } from "@/services/printing/discovery/StarPrinterDiscovery";
import { usePrinterStore } from "@/stores/usePrinterStore";
import {
  PrinterConfig,
  PrinterReachability,
  PRINTER_STATUS_IN_USE,
} from "@/types/printer";

// 2.5× the 2-min background probe interval. Beyond this the cached state is
// no longer trustworthy (app was backgrounded, network was down, etc.) and the
// badge falls back to "unknown" rather than showing a stale color.
export const REACHABILITY_STALE_MS = 5 * 60 * 1000;

export function getPrinterReachability(
  p: PrinterConfig,
  now: number = Date.now(),
): PrinterReachability {
  // Built-in printers are driver-managed; treat as connectable while active.
  if (p.connectionType === "builtin") {
    return p.isActive ? "connectable" : "offline";
  }

  // Bluetooth SPP is exclusive — if we hold the connection no peer can.
  // So we cannot distinguish in_use over BT; fall back to binary state.
  if (p.connectionType === "bluetooth") {
    return p.isConnected ? "connectable" : "offline";
  }

  const ageMs = p.lastStatusAt
    ? now - new Date(p.lastStatusAt).getTime()
    : Infinity;
  if (ageMs > REACHABILITY_STALE_MS) return "unknown";

  if (p.lastStatus === PRINTER_STATUS_IN_USE) return "in_use";
  return p.isConnected ? "connectable" : "offline";
}

export function useReachability(printerId: string): PrinterReachability {
  return usePrinterStore((s) => {
    const p = s.printers.find((pr) => pr.id === printerId);
    return p ? getPrinterReachability(p) : "unknown";
  });
}

// Discovery/saved dedup. Match on MAC first (the LAN-interface identifier the
// Star SDK returns directly), then serial_number, then fall back to IP only
// for legacy rows where both stable keys are missing. IP-only match WILL break
// after a DHCP move — that's the whole reason we prefer MAC/serial.
export function isAlreadySaved(
  discovered: DiscoveredStarPrinter,
  saved: PrinterConfig[],
): boolean {
  return saved.some((p) => {
    if (p.printerType !== "star_micronics") return false;

    const savedMac = (
      (p.metadata as Record<string, unknown> | null | undefined)?.macAddress as
        | string
        | undefined
    )?.toLowerCase();
    if (
      discovered.macAddress &&
      savedMac &&
      discovered.macAddress.toLowerCase() === savedMac
    ) {
      return true;
    }

    if (
      discovered.serialNumber &&
      p.serialNumber &&
      discovered.serialNumber === p.serialNumber
    ) {
      return true;
    }

    // Last-resort IP match — only when both stable keys are missing.
    if (!savedMac && !p.serialNumber && p.networkAddress === discovered.ipAddress) {
      return true;
    }

    return false;
  });
}

export function selectAvailableDiscovered(
  discovered: DiscoveredStarPrinter[],
  saved: PrinterConfig[],
): DiscoveredStarPrinter[] {
  return discovered.filter((dp) => !isAlreadySaved(dp, saved));
}
