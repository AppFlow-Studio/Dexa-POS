/**
 * useNetworkStatus Hook
 *
 * Provides network status and sync controls for UI components.
 */

import { syncNow } from "@/services/offlineSyncService";
import { useOrderStore } from "@/stores/useOrderStore";

export interface NetworkStatus {
  isOnline: boolean;
  pendingSyncCount: number;
  syncNow: () => Promise<void>;
}

/**
 * Hook to access network status and pending sync count.
 * Subscribes to store updates for reactive UI.
 */
export function useNetworkStatus(): NetworkStatus {
  // Get from store (reactive)
  const isOnline = useOrderStore((state) => state.isOnline);
  const pendingSyncCount = useOrderStore((state) => state.pendingSyncCount);

  return {
    isOnline,
    pendingSyncCount,
    syncNow,
  };
}

/**
 * Hook to check if card payments should be disabled.
 * Returns true when offline (only cash allowed).
 */
export function useCardPaymentDisabled(): boolean {
  const { isOnline } = useNetworkStatus();
  return !isOnline;
}
