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

interface LocalDbSyncState {
  /** True while a delta-sync cycle is actively running. */
  isSyncing: boolean;
  /** True once at least one full delta cycle has completed. */
  hasCompletedCycle: boolean;
  /** ISO timestamp of the last completed cycle, or null before the first. */
  lastCycleAt: string | null;
  setSyncing: (syncing: boolean) => void;
  markCycleComplete: () => void;
}

export const useLocalDbSyncStore = create<LocalDbSyncState>((set) => ({
  isSyncing: false,
  hasCompletedCycle: false,
  lastCycleAt: null,
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  markCycleComplete: () =>
    set({ hasCompletedCycle: true, lastCycleAt: new Date().toISOString() }),
}));
