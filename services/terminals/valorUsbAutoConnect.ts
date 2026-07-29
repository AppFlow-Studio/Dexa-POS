// services/terminals/valorUsbAutoConnect.ts
// Zero-touch USB auto-connect for Valor terminals — mirrors
// castlesUsbAutoConnect. Reuses the shared, vendor-agnostic castles-usb native
// attach (hotplug) event and filters by the Valor VID in JS.
//
// ⚠️ GATED (Wave 8): VALOR_USB_VENDOR_ID is a placeholder until Valor provides
// the terminal's real USB vendor ID, so the attach filter will not match a real
// device yet. The structure is complete so this "just works" once the VID is set.

import type { EventSubscription } from "expo-modules-core";
import { addAttachedListener } from "@/modules/castles-usb";
import { getSharedValorService } from "@/services/terminals/valor-service";
import { VALOR_USB_VENDOR_ID } from "@/services/terminals/valor-transport-usb";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { VALOR_CONNECT_TIMEOUT_MS } from "@/types/valor";

const ATTACH_DEBOUNCE_MS = 750;
const RETRY_DELAYS_MS = [2_000, 5_000];

let attachSub: EventSubscription | null = null;
let connectInFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIndex = 0;

/** Returns the terminal id iff the station's terminal is a USB Valor. */
function getUsbValorTerminalId(): string | null {
  const terminal = useStoreSettingsStore.getState().selectedStation?.payment_terminal;
  if (!terminal?.id) return null;
  if (terminal.terminal_type !== "valor") return null;
  if (terminal.connection_type !== "usb") return null;
  return terminal.id;
}

async function ensureUsbConnected(reason: string): Promise<boolean> {
  if (connectInFlight) return true;
  const terminalId = getUsbValorTerminalId();
  if (!terminalId) return true;

  const service = getSharedValorService();
  if (service.isSuspended() || service.isConnected()) return true;

  connectInFlight = true;
  try {
    await service.connect({
      connectionType: "usb",
      timeout: VALOR_CONNECT_TIMEOUT_MS,
      terminalId,
      coldConnect: true,
    });
    console.log(`[ValorUsbAutoConnect] Connected (${reason})`);
    return true;
  } catch (e) {
    console.log(
      `[ValorUsbAutoConnect] Connect failed (${reason}, non-fatal):`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  } finally {
    connectInFlight = false;
  }
}

async function runConnectWithRetry(reason: string): Promise<void> {
  retryTimer = null;
  const ok = await ensureUsbConnected(reason);
  if (ok) {
    retryIndex = 0;
    return;
  }
  if (retryIndex < RETRY_DELAYS_MS.length) {
    const delay = RETRY_DELAYS_MS[retryIndex++];
    retryTimer = setTimeout(() => void runConnectWithRetry(reason), delay);
  }
}

function scheduleConnect(reason: string, initialDelayMs: number): void {
  retryIndex = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void runConnectWithRetry(reason), initialDelayMs);
}

export function isValorUsbConnectInFlight(): boolean {
  return connectInFlight || retryTimer !== null;
}

export function startValorUsbAutoConnect(): void {
  if (attachSub) return;
  attachSub = addAttachedListener((event) => {
    if (event.vendorId !== VALOR_USB_VENDOR_ID) return;
    scheduleConnect("usb-attach", ATTACH_DEBOUNCE_MS);
  });
  scheduleConnect("startup", 0);
  console.log("[ValorUsbAutoConnect] Started");
}

export function stopValorUsbAutoConnect(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryIndex = 0;
  if (attachSub) {
    attachSub.remove();
    attachSub = null;
    console.log("[ValorUsbAutoConnect] Stopped");
  }
}
