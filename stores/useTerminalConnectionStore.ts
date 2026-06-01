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
 *
 * Only `lost` triggers the header pill, matching the pattern in
 * `feedback_dead_letter_inline_ux.md` (offline-only badge; no green badge noise).
 */

import { create } from 'zustand';

export type TerminalConnectionQuality = 'unknown' | 'ok' | 'degraded' | 'lost';

interface TerminalConnectionState {
  quality: TerminalConnectionQuality;
  lastUpdateAt: number;
  setQuality: (quality: TerminalConnectionQuality) => void;
  reset: () => void;
}

export const useTerminalConnectionStore = create<TerminalConnectionState>(
  (set) => ({
    quality: 'unknown',
    lastUpdateAt: 0,
    setQuality: (quality) =>
      set({ quality, lastUpdateAt: Date.now() }),
    reset: () => set({ quality: 'unknown', lastUpdateAt: 0 }),
  })
);
