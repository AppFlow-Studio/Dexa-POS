/**
 * Cache Service
 *
 * Manages clearing of transient/operational data while preserving
 * device identity and configuration.
 */

import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeClockStore } from "@/stores/useTimeClock";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Keys to CLEAR (transient/operational data)
const CLEARABLE_KEYS = [
  "order-store-storage",
  "dexa-pos-timeclock",
  "offline_operations_queue",
  "order_item_operations_queue",
  "order_items_cache",
  "offline_orders",
];

// Keys that are PRESERVED (never cleared):
// - 'store-settings-storage' (store settings)
// - 'dexa-employee-storage' (employee list)
// - 'dexa-pos-device-id' (device identifier)

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
 */
export async function clearCache(): Promise<CacheClearResult> {
  const clearedKeys: string[] = [];
  const errors: string[] = [];

  // 1. Clear AsyncStorage keys
  for (const key of CLEARABLE_KEYS) {
    try {
      await AsyncStorage.removeItem(key);
      clearedKeys.push(key);
    } catch (error) {
      errors.push(`Failed to clear ${key}: ${error}`);
    }
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
