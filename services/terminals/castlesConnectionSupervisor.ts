/**
 * Castles Connection Supervisor
 *
 * Holds the "is the terminal in an app-layer wedge?" state and drives the
 * background probe loop that auto-recovers the moment the terminal becomes
 * responsive again (after staff power-cycles, or after the terminal's own
 * session timeout fires).
 *
 * Why this exists:
 * - CastlesPay can enter a state where its TCP listener accepts connections
 *   but the app itself never reads from the socket. We see this as: TCP
 *   connect succeeds, writes resolve, but every response times out with a
 *   0-byte buffer. No POS-side action recovers from this — only a terminal
 *   power-cycle (or WiFi-toggle, which forces CastlesPay's listener to
 *   re-bind) fixes it.
 * - The wedge has a unique fingerprint, so we can detect it cheaply on the
 *   FIRST failed attempt (~3s with the new 3s handshake timeout) instead of
 *   burning all 3 connect retries (~46s).
 * - Once detected, we stop hammering the dead address and switch to a slow
 *   background probe (every 15s). When the probe gets a real response back,
 *   the wedge is over — the store flips back to healthy and any subscribed
 *   UI (TerminalWedgedModal) auto-dismisses.
 *
 * Lifecycle:
 *   notifyEmptyBuffer(config) → wedged + probe loop running
 *   probe success            → healthy + loop stopped + Sentry event
 *   triggerImmediateProbe()  → fires a probe right now (Try Now button)
 *   notifySuccess()          → if currently wedged, clears it (defensive —
 *                              probe loop is the primary path)
 *
 * The supervisor reads/writes useTerminalConnectionStore so consumers
 * subscribe via standard Zustand selectors, not a separate event bus.
 */

import * as Sentry from '@sentry/react-native';
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore';
import { probeCastlesTerminal } from './castles-service';
import type { CastlesTransportConfig } from './castles-transport.types';

/**
 * Probe cadence while wedged. 15s balances "responsive recovery detection"
 * against "don't flood the LAN when something is clearly broken".
 */
const WEDGE_PROBE_INTERVAL_MS = 15_000;

/**
 * Per-probe timeout. The wedge symptom is "no bytes ever come back" so any
 * value above ~2s just makes recovery detection slower.
 */
const PROBE_TIMEOUT_MS = 2_500;

class CastlesConnectionSupervisor {
  private _wedged = false;
  private _lastConfig: CastlesTransportConfig | null = null;
  private _probeTimer: ReturnType<typeof setInterval> | null = null;
  /** Set while a probe is in flight to prevent overlapping probes. */
  private _probeInFlight = false;

  isWedged(): boolean {
    return this._wedged;
  }

  /**
   * Called by CastlesService when the empty-buffer wedge signature is
   * detected (response timed out, buffer.length === 0). Marks wedged in the
   * store, captures a Sentry event for observability, and starts the slow
   * probe loop. Idempotent — repeated calls reset the captured config to
   * the latest values but don't restart the loop.
   */
  notifyEmptyBuffer(config: CastlesTransportConfig): void {
    this._lastConfig = config;
    if (this._wedged) return; // already wedged + probing, nothing to do

    this._wedged = true;
    useTerminalConnectionStore.getState().markWedged();

    try {
      Sentry.captureMessage('Castles terminal wedged (empty-buffer)', {
        level: 'warning',
        tags: {
          terminal_host: config.host ?? 'usb',
          terminal_port: String(config.port ?? ''),
          source: 'castles_wedge_detected',
        },
      });
    } catch {
      /* Sentry failures are non-fatal */
    }

    console.warn(
      '[CastlesSupervisor] Terminal wedged — starting background probe loop',
    );
    this._startProbeLoop();
  }

  /**
   * Called by CastlesService when ANY command succeeds. Defensive recovery
   * path — if we're somehow wedged but the terminal is actually responding,
   * clear immediately. The probe loop is the primary recovery path.
   */
  notifySuccess(): void {
    if (!this._wedged) return;
    this._clearWedge('command-success');
  }

  /**
   * Fire a probe right now (skipping the 15s interval). Used by the modal's
   * "Try Now" button after staff power-cycles the terminal. Safe to call
   * when not wedged — it's a no-op in that case.
   */
  async triggerImmediateProbe(): Promise<void> {
    if (!this._wedged) return;
    await this._runProbe();
  }

  /** Manual reset (e.g., on station switch / app suspend). */
  reset(): void {
    this._wedged = false;
    this._lastConfig = null;
    this._stopProbeLoop();
  }

  // ── internals ──

  private _startProbeLoop(): void {
    this._stopProbeLoop();
    this._probeTimer = setInterval(() => {
      void this._runProbe();
    }, WEDGE_PROBE_INTERVAL_MS);
  }

  private _stopProbeLoop(): void {
    if (this._probeTimer) {
      clearInterval(this._probeTimer);
      this._probeTimer = null;
    }
    this._probeInFlight = false;
  }

  private async _runProbe(): Promise<void> {
    if (!this._wedged || !this._lastConfig) return;
    if (this._probeInFlight) return;
    this._probeInFlight = true;

    try {
      const result = await probeCastlesTerminal(
        this._lastConfig,
        PROBE_TIMEOUT_MS,
      );
      if (result.online) {
        this._clearWedge('probe-success');
      }
      // If still offline / unresponsive, stay wedged and wait for the next tick.
    } catch (err) {
      // probeCastlesTerminal already swallows errors, but belt-and-suspenders.
      console.warn('[CastlesSupervisor] Probe threw unexpectedly:', err);
    } finally {
      this._probeInFlight = false;
    }
  }

  private _clearWedge(reason: 'probe-success' | 'command-success'): void {
    this._wedged = false;
    this._stopProbeLoop();
    useTerminalConnectionStore.getState().clearWedge();

    try {
      Sentry.captureMessage('Castles terminal recovered from wedge', {
        level: 'info',
        tags: {
          terminal_host: this._lastConfig?.host ?? 'usb',
          recovery: reason,
          source: 'castles_wedge_recovered',
        },
      });
    } catch {
      /* non-fatal */
    }

    console.log(
      `[CastlesSupervisor] Terminal recovered (${reason}) — probe loop stopped`,
    );
  }
}

// ── singleton ──

let _instance: CastlesConnectionSupervisor | null = null;

export function getCastlesConnectionSupervisor(): CastlesConnectionSupervisor {
  if (!_instance) {
    _instance = new CastlesConnectionSupervisor();
  }
  return _instance;
}

// Error thrown by CastlesService.connect() when the supervisor short-circuits.
// Consumers (testConnection, processCastlesSale, etc.) can check `instanceof`
// to render the wedge modal instead of a cryptic timeout string.
export class CastlesWedgedError extends Error {
  readonly isCastlesWedgedError = true as const;
  constructor (message = 'Castles terminal is wedged (app-layer freeze). Power-cycle required.') {
    super(message);
    this.name = 'CastlesWedgedError';
  }
}

/**
 * Thrown by CastlesService._sendAndReceive when the response timer fires
 * with buffer.length === 0. This is the wedge signature — distinct from a
 * generic timeout (partial buffer = network/firmware glitch, full buffer =
 * parse error). The connect retry loop catches this specific subclass to
 * short-circuit and notify the supervisor.
 */
export class CastlesEmptyResponseError extends Error {
  readonly isCastlesEmptyResponseError = true as const;
  constructor (timeoutMs: number) {
    super(
      `Empty response after ${timeoutMs}ms (0 bytes received). Likely an ` +
        `app-layer wedge on the terminal — power-cycle required.`,
    );
    this.name = 'CastlesEmptyResponseError';
  }
}
