// services/terminals/castlesUsbAutoConnect.ts
// Zero-touch USB auto-connect for Castles Saturn1000 pin pads.
//
// The USB transport, permission flow, and detach handling already exist
// (castles-transport-usb.ts + the native CastlesUsbModule). What was missing is
// the *trigger*: nothing connected the shared singleton when a USB terminal was
// plugged in mid-session or already attached at app/station load — staff had to
// open the manual setup wizard or wait for the next sale. This coordinator wires
// the native attach (hotplug) event to an automatic connect.
//
// Detach is already handled by CastlesUsbTransport, which fires the service's
// close path; the next attach re-triggers this coordinator.

import type { EventSubscription } from 'expo-modules-core';
import { addAttachedListener } from '@/modules/castles-usb';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore';

/** Castles Technology USB vendor ID */
const CASTLES_VENDOR_ID = 0x0ca6;

/** Debounce: one physical plug emits several attach broadcasts, and the device
 *  needs a beat to enumerate before the transport's listDevices() sees it. */
const ATTACH_DEBOUNCE_MS = 750;

let attachSub: EventSubscription | null = null;
let connectInFlight = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Returns the configured terminal id iff the station's terminal is USB Castles. */
function getUsbCastlesTerminalId(): string | null {
  const terminal =
    useStoreSettingsStore.getState().selectedStation?.payment_terminal;
  if (!terminal?.id) return null;
  if (terminal.terminal_type !== 'castles') return null;
  if (terminal.connection_type !== 'usb') return null;
  return terminal.id;
}

async function ensureUsbConnected(reason: string): Promise<void> {
  if (connectInFlight) return;
  const terminalId = getUsbCastlesTerminalId();
  if (!terminalId) return;

  const service = getSharedCastlesService();
  // Don't fight the AppState suspend (app backgrounded) — resume() owns that
  // path. And there's nothing to do if we're already connected.
  if (service.isSuspended()) return;
  if (service.isConnected()) return;

  connectInFlight = true;
  try {
    await service.connect({
      connectionType: 'usb',
      timeout: 10_000,
      terminalId,
    });
    console.log(`[CastlesUsbAutoConnect] Connected (${reason})`);
  } catch (e) {
    // Non-fatal: the on-demand sale path and the manual setup wizard can still
    // connect, and a later attach event will retry.
    console.log(
      `[CastlesUsbAutoConnect] Connect failed (${reason}, non-fatal):`,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    connectInFlight = false;
  }
}

function scheduleConnect(reason: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void ensureUsbConnected(reason);
  }, ATTACH_DEBOUNCE_MS);
}

/**
 * Start listening for Castles USB hotplug events and auto-connecting the shared
 * singleton. Idempotent. Safe to call only when the station's terminal is a USB
 * Castles (the handlers also re-check, so a stale call is a harmless no-op).
 */
export function startCastlesUsbAutoConnect(): void {
  if (attachSub) return; // already running

  attachSub = addAttachedListener((event) => {
    if (event.vendorId !== CASTLES_VENDOR_ID) return;
    scheduleConnect('usb-attach');
  });

  // Cover the "already plugged in when the app/station loads" case — the
  // foreground-resume pre-warm in PosSyncProvider only fires on app foreground.
  scheduleConnect('startup');

  console.log('[CastlesUsbAutoConnect] Started');
}

/** Stop listening and cancel any pending connect. Idempotent. */
export function stopCastlesUsbAutoConnect(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (attachSub) {
    attachSub.remove();
    attachSub = null;
    console.log('[CastlesUsbAutoConnect] Stopped');
  }
}
