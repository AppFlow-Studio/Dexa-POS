/**
 * Terminal Connection Store
 *
 * Surfaces the shared Castles singleton's connection quality so the header
 * can render an "offline-only" pill (mirroring NetworkStatusBadge) when the
 * payment terminal becomes unreachable while idle. The point is to flag
 * the failure BEFORE a customer is standing at the counter waiting to swipe.
 *
 * - `unknown`: no heartbeat has run yet (boot, or no terminal configured)
 * - `ok`: most recent heartbeat succeeded
 * - `degraded`: one consecutive heartbeat miss — silently noted, no UI
 * - `lost`: 2+ consecutive misses, or a sale errored with a connection error
 * - `wedged`: CastlesPay app-layer freeze detected (TCP up, writes ack, all
 *   responses time out with 0-byte buffer). Only a terminal power-cycle
 *   recovers; surfaced via TerminalWedgedModal in the payment views. The
 *   connection supervisor drives this state and auto-clears it the moment
 *   a background probe gets a real response back.
 *
 * `lost` triggers the header pill (NetworkStatusBadge pattern). `wedged`
 * triggers a modal in the payment views. Precedence is wedged > lost; the
 * watchdog skips writes while wedged so the supervisor's state isn't
 * overwritten by parallel pings.
 */

import { create } from 'zustand';

export type TerminalConnectionQuality =
  | 'unknown'
  | 'ok'
  | 'degraded'
  | 'lost'
  | 'wedged';

interface TerminalConnectionState {
  quality: TerminalConnectionQuality;
  lastUpdateAt: number;
  /** Timestamp when the current wedge was first detected, null when not wedged. */
  wedgedSince: number | null;
  setQuality: (quality: TerminalConnectionQuality) => void;
  /** Mark wedged and stamp wedgedSince. Idempotent — repeated calls don't reset the timestamp. */
  markWedged: () => void;
  /** Clear wedge state back to healthy (called by supervisor on probe success). */
  clearWedge: () => void;
  reset: () => void;
}

export const useTerminalConnectionStore = create<TerminalConnectionState>(
  (set, get) => ({
    quality: 'unknown',
    lastUpdateAt: 0,
    wedgedSince: null,
    setQuality: (quality) => {
      // Don't let watchdog/sale-path writes overwrite a wedged state — only
      // the supervisor's clearWedge() can transition out of wedged.
      if (get().quality === 'wedged' && quality !== 'wedged') return;
      set({ quality, lastUpdateAt: Date.now() });
    },
    markWedged: () => {
      const now = Date.now();
      set((state) => ({
        quality: 'wedged',
        lastUpdateAt: now,
        wedgedSince: state.wedgedSince ?? now,
      }));
    },
    clearWedge: () =>
      set({ quality: 'ok', lastUpdateAt: Date.now(), wedgedSince: null }),
    reset: () =>
      set({ quality: 'unknown', lastUpdateAt: 0, wedgedSince: null }),
  })
);
