// services/terminals/castlesUsbAutoConnect.ts
// Zero-touch USB auto-connect for Castles Saturn1000 pin pads.
//
// The USB transport, permission flow, and detach handling already exist
// (castles-transport-usb.ts + the native CastlesUsbModule). What was missing is
// the *trigger*: nothing connected the shared singleton when a USB terminal was
// plugged in mid-session or already attached at app/station load — staff had to
// open the manual setup wizard or wait for the next sale. This coordinator wires
// the native attach (hotplug) event AND a cold-boot startup pass to an automatic
// connect, with instant "Connecting…" feedback.
//
// Detach is already handled by CastlesUsbTransport, which fires the service's
// close path; the next attach re-triggers this coordinator.

import type { EventSubscription } from 'expo-modules-core';
import { addAttachedListener } from '@/modules/castles-usb';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore';
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore';

/** Castles Technology USB vendor ID */
const CASTLES_VENDOR_ID = 0x0ca6;

/** Hotplug: a single physical plug emits several attach broadcasts and the
 *  device needs a beat to enumerate before listDevices() sees it — so debounce. */
const ATTACH_DEBOUNCE_MS = 750;

/** Startup: the device is already enumerated, so connect with zero debounce. If
 *  the terminal app isn't ready yet (e.g. both the POS and the terminal just
 *  powered on together), retry on a bounded backoff instead of waiting for the
 *  next sale. */
const STARTUP_RETRY_DELAYS_MS = [3_000, 6_000, 12_000];

let attachSub: EventSubscription | null = null;
let connectInFlight = false;
let attachTimer: ReturnType<typeof setTimeout> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let startupRetryIndex = 0;

/** Returns the configured terminal id iff the station's terminal is USB Castles. */
function getUsbCastlesTerminalId(): string | null {
  const terminal =
    useStoreSettingsStore.getState().selectedStation?.payment_terminal;
  if (!terminal?.id) return null;
  if (terminal.terminal_type !== 'castles') return null;
  if (terminal.connection_type !== 'usb') return null;
  return terminal.id;
}

/** Instant "Connecting…" feedback the moment a plug/boot is detected — set
 *  synchronously, before the (debounced) connect work, so the Devices &
 *  Connections status row reacts immediately. Skipped when already connected or
 *  suspended (nothing to show). The service then overwrites with its own live
 *  phases ("Waking terminal…", "Verifying terminal…") and clears on settle. */
function showConnecting(): void {
  const service = getSharedCastlesService();
  if (service.isConnected() || service.isSuspended()) return;
  useTerminalConnectionStore.getState().setConnectActivity('Connecting to terminal…');
}

function clearActivity(): void {
  useTerminalConnectionStore.getState().setConnectActivity(null);
}

/**
 * @returns true if connected or there was nothing to do (benign skip); false if
 * a connect was attempted but failed — the startup caller uses this to retry.
 */
async function ensureUsbConnected(reason: string): Promise<boolean> {
  if (connectInFlight) return true;
  const terminalId = getUsbCastlesTerminalId();
  if (!terminalId) {
    clearActivity();
    return true;
  }

  const service = getSharedCastlesService();
  // Don't fight the AppState suspend (resume() owns that path), and there's
  // nothing to do if we're already connected.
  if (service.isSuspended() || service.isConnected()) {
    clearActivity();
    return true;
  }

  connectInFlight = true;
  try {
    await service.connect({
      connectionType: 'usb',
      timeout: 10_000,
      terminalId,
    });
    console.log(`[CastlesUsbAutoConnect] Connected (${reason})`);
    return true;
  } catch (e) {
    // Non-fatal: the on-demand sale path and the manual setup wizard can still
    // connect, and a later attach event (or startup retry) will try again.
    console.log(
      `[CastlesUsbAutoConnect] Connect failed (${reason}, non-fatal):`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  } finally {
    connectInFlight = false;
  }
}

/** Hotplug attach — debounced so the device can enumerate. */
function scheduleAttachConnect(): void {
  showConnecting();
  if (attachTimer) clearTimeout(attachTimer);
  attachTimer = setTimeout(() => {
    attachTimer = null;
    void ensureUsbConnected('usb-attach');
  }, ATTACH_DEBOUNCE_MS);
}

/** Startup — zero debounce, with a bounded retry for a not-yet-ready terminal. */
async function runStartupConnect(): Promise<void> {
  startupTimer = null;
  const ok = await ensureUsbConnected('startup');
  if (ok) {
    startupRetryIndex = 0;
    return;
  }
  if (startupRetryIndex < STARTUP_RETRY_DELAYS_MS.length) {
    const delay = STARTUP_RETRY_DELAYS_MS[startupRetryIndex++];
    console.log(`[CastlesUsbAutoConnect] Startup retry in ${delay}ms`);
    startupTimer = setTimeout(() => {
      showConnecting();
      void runStartupConnect();
    }, delay);
  }
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
    scheduleAttachConnect();
  });

  // Already-plugged-in / cold-boot path: instant feedback + zero-debounce
  // connect (the device is already enumerated), with a bounded retry so a
  // terminal that's still booting recovers without waiting for the next sale.
  startupRetryIndex = 0;
  showConnecting();
  startupTimer = setTimeout(() => void runStartupConnect(), 0);

  console.log('[CastlesUsbAutoConnect] Started');
}

/** Stop listening and cancel any pending connect. Idempotent. */
export function stopCastlesUsbAutoConnect(): void {
  if (attachTimer) {
    clearTimeout(attachTimer);
    attachTimer = null;
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  startupRetryIndex = 0;
  // Drop a pending "Connecting…" label if we're tearing down before it resolved.
  if (!connectInFlight) clearActivity();
  if (attachSub) {
    attachSub.remove();
    attachSub = null;
    console.log('[CastlesUsbAutoConnect] Stopped');
  }
}
