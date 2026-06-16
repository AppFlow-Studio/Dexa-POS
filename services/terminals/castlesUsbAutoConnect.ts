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
//
// Why a retry ladder: plugging the cable in *power-cycles* the terminal, and
// CastlesPay takes ~5-10s to reboot. During that window the USB serial port
// enumerates and the socket opens, but the terminal returns 0 bytes to our wake
// (return2Idle) / verify (getData) commands. A single connect attempt therefore
// (almost) always lands mid-boot and fails. So both the hotplug and the startup
// paths retry on a short bounded backoff that covers the boot window, and the
// connect runs in `coldConnect` mode so a boot-window empty buffer is treated as
// "not ready yet, retry" rather than a firmware wedge (which would pop the
// power-cycle modal and hand off to the slow 15s supervisor probe loop).

import type { EventSubscription } from 'expo-modules-core';
import { addAttachedListener } from '@/modules/castles-usb';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore';
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore';

/** Castles Technology USB vendor ID */
const CASTLES_VENDOR_ID = 0x0ca6;

/** Hotplug: a single physical plug emits several attach broadcasts and the
 *  device needs a beat to enumerate before listDevices() sees it — so debounce
 *  the *first* attempt by this much. Subsequent retries use RETRY_DELAYS_MS. */
const ATTACH_DEBOUNCE_MS = 750;

/** Bounded backoff covering the terminal's ~5-10s CastlesPay boot window with
 *  snappy early rungs, so the connect lands within a second or two of the app
 *  coming up instead of waiting for the next sale or a manual Test. Each connect
 *  attempt is a single light `coldConnect` pass (fast fail), so this ladder —
 *  not the service's inner retry loop — owns the recovery cadence. If it
 *  exhausts, the hook's 5s USB offline-poll keeps trying as a long-tail
 *  fallback. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 12_000];

let attachSub: EventSubscription | null = null;
let connectInFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIndex = 0;

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
 * a connect was attempted but failed — the caller's retry ladder uses this.
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
      // Boot-tolerant: a 0-byte reply while CastlesPay is still rebooting must
      // not be treated as a firmware wedge — this ladder retries instead.
      coldConnect: true,
    });
    console.log(`[CastlesUsbAutoConnect] Connected (${reason})`);
    return true;
  } catch (e) {
    // Non-fatal: the on-demand sale path and the manual setup wizard can still
    // connect, and the retry ladder (or a later attach event) will try again.
    console.log(
      `[CastlesUsbAutoConnect] Connect failed (${reason}, non-fatal):`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  } finally {
    connectInFlight = false;
  }
}

/** One attempt + bounded backoff retry for a not-yet-ready (booting) terminal.
 *  Shared by the hotplug and startup paths. */
async function runConnectWithRetry(reason: string): Promise<void> {
  retryTimer = null;
  const ok = await ensureUsbConnected(reason);
  if (ok) {
    retryIndex = 0;
    return;
  }
  if (retryIndex < RETRY_DELAYS_MS.length) {
    const delay = RETRY_DELAYS_MS[retryIndex++];
    console.log(`[CastlesUsbAutoConnect] Retry in ${delay}ms (${reason})`);
    retryTimer = setTimeout(() => {
      showConnecting();
      void runConnectWithRetry(reason);
    }, delay);
  } else {
    console.log(
      `[CastlesUsbAutoConnect] Retry ladder exhausted (${reason}); ` +
        `the USB offline-poll fallback will keep trying`,
    );
  }
}

/** Kick off a fresh connect ladder. `initialDelayMs` lets the hotplug path wait
 *  for USB enumeration before the first attempt while startup goes immediately.
 *  Resets the ladder so each physical plug/boot starts clean. */
function scheduleConnect(reason: string, initialDelayMs: number): void {
  showConnecting();
  retryIndex = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void runConnectWithRetry(reason), initialDelayMs);
}

/**
 * True while the coordinator is actively connecting or has a retry pending.
 * The hook's USB offline-poll checks this so it doesn't contend with the
 * coordinator (which is the primary, event-driven USB reconnect driver) and
 * stack on the shared command mutex.
 */
export function isCastlesUsbConnectInFlight(): boolean {
  return connectInFlight || retryTimer !== null;
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
    // Hotplug: debounce the first attempt for enumeration, then retry through
    // the terminal's reboot window.
    scheduleConnect('usb-attach', ATTACH_DEBOUNCE_MS);
  });

  // Already-plugged-in / cold-boot path: instant feedback + zero-debounce
  // first attempt (the device is already enumerated), with the bounded retry
  // ladder so a terminal that's still booting recovers without a manual Test.
  scheduleConnect('startup', 0);

  console.log('[CastlesUsbAutoConnect] Started');
}

/** Stop listening and cancel any pending connect. Idempotent. */
export function stopCastlesUsbAutoConnect(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryIndex = 0;
  // Drop a pending "Connecting…" label if we're tearing down before it resolved.
  if (!connectInFlight) clearActivity();
  if (attachSub) {
    attachSub.remove();
    attachSub = null;
    console.log('[CastlesUsbAutoConnect] Stopped');
  }
}
