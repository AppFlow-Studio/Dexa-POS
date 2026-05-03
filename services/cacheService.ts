/**
 * Cache Service
 *
 * Manages clearing of transient/operational data while preserving
 * device identity and configuration.
 * Uses MMKV for blazing-fast synchronous storage operations.
 */

import { queryClient } from "@/contexts/TanstackProvider";
import {
  clearCacheData,
  flushAllPendingWrites,
  secureStorage,
  storage,
  syncStorage,
} from "@/lib/storage";
import { todayOrdersCache } from "@/stores/todayOrdersCache";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useLoyaltyStore } from "@/stores/useLoyaltyStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentTerminalStore } from "@/stores/usePaymentTerminalStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { usePtoStore } from "@/stores/usePtoStore";
import { useRefundFraudGuardStore } from "@/stores/useRefundFraudGuardStore";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useTipDistributionStore } from "@/stores/useTipDistributionStore";

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

const APP_SECURE_SESSION_KEYS = [
  "clerk_was_signed_in",
  "dexa-employee-storage",
] as const;

const SESSION_STORES = [
  useCashDrawerStore,
  useCFDClientStore,
  useEmployeeStore,
  useFloorPlanStore,
  useKDSStore,
  useLocationConfigStore,
  useLoyaltyStore,
  useOrderStore,
  usePaymentTerminalStore,
  usePrintQueueStore,
  usePrinterStore,
  usePtoStore,
  useRefundFraudGuardStore,
  useScheduleTemplateStore,
  useSettingsStore,
  useStoreSettingsStore,
  useTableSessionStore,
  useTimeclockStore,
  useTipDistributionStore,
] as const;

function resetStore(store: {
  setState?: Function;
  getInitialState?: Function;
}): void {
  try {
    if (!store?.setState || !store?.getInitialState) return;
    store.setState(store.getInitialState(), true);
  } catch (error) {
    console.error("[resetClientSession] Failed to reset store:", error);
  }
}

/**
 * Hard-reset all app-owned client state while preserving Clerk's secure keys
 * and device identity. This is the canonical reset path for identity changes.
 */
export async function resetClientSession(): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();

  // Flush pending debounced writes so old state cannot land after the wipe.
  flushAllPendingWrites();

  storage.clearAll();
  syncStorage.clearAll();

  for (const key of APP_SECURE_SESSION_KEYS) {
    secureStorage.remove(key);
  }

  for (const store of SESSION_STORES) {
    resetStore(store);
  }
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
    // Reset unified timeclock store (clears device state, sessions, and UI state)
    useTimeclockStore.getState().clearState();
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

  console.log(
    "[clearStationData] Cleared orders, active session, and query cache (kept employees, preserved unsynced)",
  );
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

  // Clear today's orders MMKV cache for this location
  const locationId = orderState.currentLocationId;
  if (locationId) {
    todayOrdersCache.clearLocation(locationId);
  }

  console.log(
    "[clearLocationData] Cleared orders, employees, query cache, and order cache (preserved unsynced)",
  );
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
