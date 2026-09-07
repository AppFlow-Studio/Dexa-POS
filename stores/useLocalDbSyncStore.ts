/**
 * Local DB delta-sync cycle status — the ONLY thing that tells the UI "the
 * mirror is still being built on first launch".
 *
 * Freshness (sync_state.last_success_at) is NOT enough: the delta stamps it
 * after the FIRST page commits, so the mirror can be "fresh" while pages 2..N
 * of a 4,600-order cold sync are still downloading. This store's `isSyncing`
 * + `hasCompletedCycle` is the difference between a truthful
 * "Syncing order history…" banner and a silent partial list — which is
 * invisible in release builds where the dev-only shadow logs don't exist.
 */
import { create } from "zustand";

export interface LocalDbSyncProgress {
  /** Which entity is being built — the banner names it. */
  entity: string;
  /** Rows received so far in this cold sync. */
  received: number;
  /**
   * Rows the delta expects to walk, or null when the descriptor could not
   * count. Null means "show a spinner", never "show 0%" — an unknown
   * denominator must not be rendered as no progress.
   */
  total: number | null;
}

interface LocalDbSyncState {
  /** True while a delta-sync cycle is actively running. */
  isSyncing: boolean;
  /** True once at least one full delta cycle has completed. */
  hasCompletedCycle: boolean;
  /** ISO timestamp of the last completed cycle, or null before the first. */
  lastCycleAt: string | null;
  /** Cold-sync progress. Null in steady state and once the first cycle lands. */
  progress: LocalDbSyncProgress | null;
  setSyncing: (syncing: boolean) => void;
  setProgress: (progress: LocalDbSyncProgress | null) => void;
  markCycleComplete: () => void;
}

export const useLocalDbSyncStore = create<LocalDbSyncState>((set) => ({
  isSyncing: false,
  hasCompletedCycle: false,
  lastCycleAt: null,
  progress: null,
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setProgress: (progress) => set({ progress }),
  markCycleComplete: () =>
    set({
      hasCompletedCycle: true,
      lastCycleAt: new Date().toISOString(),
      // The cold sync is over, so the bar has nothing left to describe.
      // Clearing here rather than in the UI means no screen can be left
      // rendering a stale 87% after the mirror is complete.
      progress: null,
    }),
}));

/**
 * `received / total` as a 0–100 integer, or null when there is nothing honest
 * to show.
 *
 * One helper so every surface rounds and clamps identically — two screens
 * disagreeing about whether the sync is at 99% or 100% is the kind of detail
 * that makes a progress bar look broken.
 */
export function syncProgressPercent(
  progress: LocalDbSyncProgress | null,
): number | null {
  if (!progress || progress.total === null || progress.total <= 0) return null;
  const pct = (progress.received / progress.total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
