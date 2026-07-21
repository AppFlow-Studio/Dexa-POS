/**
 * useNetworkStatus Hook
 *
 * Provides network status and sync controls for UI components.
 * Uses useSyncExternalStore to subscribe directly to the offlineSyncService
 * module-level `isOnline` state, bypassing the Zustand store indirection.
 */

import { useSyncExternalStore } from "react";
import { syncNow, setForceOffline, getForceOffline, getIsOnline, getRawIsOnline, subscribeOnlineStatus } from "@/services/offlineSyncService";
import { useConnectionQuality } from "@/hooks/useConnectionQuality";
import type { Quality } from "@/lib/network/connectionQuality";
import { useOrderStore } from "@/stores/useOrderStore";

export interface NetworkStatus {
  /**
   * Effective online status: false when NetInfo is offline OR connection-quality
   * is `slow`/`probing`. Use this for ROUTING decisions (queue vs send live).
   */
  isOnline: boolean;
  /**
   * Raw NetInfo online status — true even during slow-mode. Use this for UI
   * affordances like the offline badge: slow-mode should silently queue in the
   * background, not display an "Offline" indicator that scares operators.
   */
  rawIsOnline: boolean;
  pendingSyncCount: number;
  /** Connection quality state machine value: fast | degraded | slow | probing. */
  quality: Quality;
  syncNow: () => Promise<void>;
}

/**
 * Hook to access network status and pending sync count.
 * Subscribes directly to offlineSyncService for isOnline (reliable),
 * and to the Zustand store for pendingSyncCount.
 *
 * Also surfaces `quality` from the connection-quality state machine. UI that
 * displays an offline indicator should consult `rawIsOnline` (not `isOnline`)
 * so slow-mode operates silently in the background.
 */
export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getIsOnline, getIsOnline);
  const rawIsOnline = useSyncExternalStore(subscribeOnlineStatus, getRawIsOnline, getRawIsOnline);
  const quality = useConnectionQuality();
  const pendingSyncCount = useOrderStore((state) => state.pendingSyncCount);
  return {
    isOnline,
    rawIsOnline,
    pendingSyncCount,
    quality,
    syncNow,
  };
}

/**
 * Row-level network hint without subscribing to the global pending-sync count.
 */
export function useIsNetworkDegraded(): boolean {
  const rawIsOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getRawIsOnline,
    getRawIsOnline,
  );
  const quality = useConnectionQuality();
  return !rawIsOnline || quality === "slow" || quality === "probing";
}

/**
 * DEV-only hook: provides force-offline toggle for testing.
 * Returns current force state and a toggle function.
 */
export function useForceOfflineToggle() {
  if (!__DEV__) return { forceOffline: false, toggleForceOffline: () => {} };

  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getIsOnline, getIsOnline);
  // Re-derive on every render so UI stays in sync with the module flag
  const forceOffline = getForceOffline();

  const toggleForceOffline = () => {
    setForceOffline(!getForceOffline());
  };

  return { forceOffline, toggleForceOffline };
}

/**
 * Hook to check if card payments should be disabled.
 * Returns true when offline (only cash allowed).
 */
export function useCardPaymentDisabled(): boolean {
  const { isOnline } = useNetworkStatus();
  return !isOnline;
}
