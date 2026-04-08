/**
 * useNetworkStatus Hook
 *
 * Provides network status and sync controls for UI components.
 * Uses useSyncExternalStore to subscribe directly to the offlineSyncService
 * module-level `isOnline` state, bypassing the Zustand store indirection.
 */

import { useSyncExternalStore } from "react";
import { syncNow, setForceOffline, getForceOffline, getIsOnline, subscribeOnlineStatus } from "@/services/offlineSyncService";
import { useOrderStore } from "@/stores/useOrderStore";

export interface NetworkStatus {
  isOnline: boolean;
  pendingSyncCount: number;
  syncNow: () => Promise<void>;
}

/**
 * Hook to access network status and pending sync count.
 * Subscribes directly to offlineSyncService for isOnline (reliable),
 * and to the Zustand store for pendingSyncCount.
 */
export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getIsOnline, getIsOnline);
  const pendingSyncCount = useOrderStore((state) => state.pendingSyncCount);
  return {
    isOnline,
    pendingSyncCount,
    syncNow,
  };
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
