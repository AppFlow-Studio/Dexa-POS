/**
 * Cache Service
 *
 * Manages clearing of transient/operational data while preserving
 * device identity and configuration.
 * Uses MMKV for blazing-fast synchronous storage operations.
 */

import { clearCacheData } from "@/lib/storage";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeClockStore } from "@/stores/useTimeClock";
import { useTimeclockStore } from "@/stores/useTimeclockStore";

export interface CacheClearResult {
  success: boolean;
  clearedKeys: string[];
  errors: string[];
}

export interface CacheStats {
  orderCount: number;
  pendingSyncCount: number;
  hasCachedData: boolean;
}

/**
 * Clear all transient cache and operational data.
 * Preserves device ID, store settings, and employee data.
 * Now synchronous thanks to MMKV!
 */
export function clearCache(): CacheClearResult {
  const clearedKeys: string[] = [];
  const errors: string[] = [];

  // 1. Clear MMKV storage keys (synchronous)
  try {
    const mmkvResult = clearCacheData();
    clearedKeys.push(...mmkvResult.clearedKeys);
    errors.push(...mmkvResult.errors);
  } catch (error) {
    errors.push(`Failed to clear MMKV storage: ${error}`);
  }

  // 2. Reset Zustand stores (in-memory state)
  try {
    // Reset order store to initial state
    useOrderStore.setState({
      ordersById: {},
      ordersByDbId: {},
      orderIds: [],
      activeOrderId: null,
      orders: [],
      isOnline: true,
      pendingSyncCount: 0,
    });
    clearedKeys.push("orderStore (memory)");
  } catch (error) {
    errors.push(`Failed to reset order store: ${error}`);
  }

  try {
    // Reset time clock store
    useTimeClockStore.getState().clearState();
    clearedKeys.push("timeClockStore (memory)");
  } catch (error) {
    errors.push(`Failed to reset time clock store: ${error}`);
  }

  try {
    // Reset timeclock store sessions (but keep history)
    useTimeclockStore.setState({
      activeEmployeeId: null,
      sessions: {},
      isClockInWallOpen: false,
    });
    clearedKeys.push("timeclockStore (memory)");
  } catch (error) {
    errors.push(`Failed to reset timeclock store: ${error}`);
  }

  return {
    success: errors.length === 0,
    clearedKeys,
    errors,
  };
}

/**
 * Get cache statistics for display in settings.
 */
export function getCacheStats(): CacheStats {
  const orderStore = useOrderStore.getState();

  return {
    orderCount: orderStore.orderIds?.length || 0,
    pendingSyncCount: orderStore.pendingSyncCount || 0,
    hasCachedData:
      (orderStore.orderIds?.length || 0) > 0 ||
      (orderStore.pendingSyncCount || 0) > 0,
  };
}
