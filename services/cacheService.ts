/**
 * Cache Service
 *
 * Manages clearing of transient/operational data while preserving
 * device identity and configuration.
 * Uses MMKV for blazing-fast synchronous storage operations.
 */

import { queryClient } from "@/contexts/TanstackProvider";
import { clearCacheData } from "@/lib/storage";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
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
      orderIds: [],
      activeOrderId: null,
      orders: [],
      isOnline: true,
      pendingSyncCount: 0,
      workingSetOrderIds: [],
      unsyncedOrderIds: [],
      currentLocationId: null,
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
 * Clear station-specific operational data when switching stations
 * within the same location. Keeps the employees array intact since
 * employees are location-scoped, not station-scoped.
 */
export function clearStationData(): void {
  const orderState = useOrderStore.getState();

  // Preserve unsynced orders across station switch
  const preserved: Record<string, any> = {};
  const preservedIds: string[] = [];
  for (const id of orderState.unsyncedOrderIds) {
    if (orderState.ordersById[id]) {
      preserved[id] = orderState.ordersById[id];
      preservedIds.push(id);
    }
  }

  useOrderStore.setState({
    ordersById: preserved,
    orderIds: preservedIds,
    activeOrderId: null,
    workingSetOrderIds: [],
    unsyncedOrderIds: preservedIds,
  });

  // Clear active employee session but KEEP the employees array
  useEmployeeStore.setState({
    activeEmployeeId: null,
    loggedInEmployee: null,
  });

  queryClient.clear();

  console.log("[clearStationData] Cleared orders, active session, and query cache (kept employees, preserved unsynced)");
}

/**
 * Clear location-specific data when switching stores/stations.
 * Clears orders, employees, and React Query cache so stale data
 * from the previous location does not persist in memory or on disk.
 */
export function clearLocationData(): void {
  const orderState = useOrderStore.getState();

  // Preserve unsynced orders across location switch
  const preserved: Record<string, any> = {};
  const preservedIds: string[] = [];
  for (const id of orderState.unsyncedOrderIds) {
    if (orderState.ordersById[id]) {
      preserved[id] = orderState.ordersById[id];
      preservedIds.push(id);
    }
  }

  useOrderStore.setState({
    ordersById: preserved,
    orderIds: preservedIds,
    activeOrderId: null,
    workingSetOrderIds: [],
    unsyncedOrderIds: preservedIds,
    currentLocationId: null,
  });

  useEmployeeStore.setState({
    employees: [],
    activeEmployeeId: null,
    loggedInEmployee: null,
  });

  queryClient.clear();

  console.log("[clearLocationData] Cleared orders, employees, and query cache (preserved unsynced)");
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
