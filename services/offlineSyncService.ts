/**
 * Offline Sync Service
 *
 * Manages operation queueing when offline and auto-sync when back online.
 * Uses AsyncStorage for persistence and NetInfo for network monitoring.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
// @ts-ignore - NetInfo types not recognized but package is installed
import NetInfo from "@react-native-community/netinfo";
// @ts-ignore
import type { NetInfoState } from "@react-native-community/netinfo";

// ============================================================================
// TYPES
// ============================================================================

export type OperationType =
  | "create_order"
  | "add_item"
  | "update_item_quantity"
  | "update_item"
  | "replace_modifiers"
  | "remove_item"
  | "void_item"
  | "update_order_status"
  | "process_cash_payment";

export interface OfflineOperation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  localOrderId: string;
  localItemId?: string;
  timestamp: string;
  retryCount: number;
  status: "pending" | "processing" | "failed" | "discarded";
}

export interface SyncResult {
  success: boolean;
  operationId: string;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = "offline_operations_queue";
const MAX_RETRY_ATTEMPTS = 5;
const DEBOUNCE_MS = 3000;

// ============================================================================
// STATE
// ============================================================================

let isOnline = true;
let pendingOperations: OfflineOperation[] = [];
let syncInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeNetInfo: (() => void) | null = null;

// Callbacks for store integration
let onStatusChange: ((isOnline: boolean) => void) | null = null;
let onQueueChange: ((count: number) => void) | null = null;
let executeOperation: ((op: OfflineOperation) => Promise<boolean>) | null =
  null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the offline sync service.
 * Call this once at app startup.
 */
export async function initOfflineSyncService(config: {
  onStatusChange: (isOnline: boolean) => void;
  onQueueChange: (count: number) => void;
  executeOperation: (op: OfflineOperation) => Promise<boolean>;
}): Promise<void> {
  onStatusChange = config.onStatusChange;
  onQueueChange = config.onQueueChange;
  executeOperation = config.executeOperation;

  // Load persisted queue
  await loadQueueFromStorage();

  // Start network listener
  startNetworkListener();

  // Check initial state
  const state = await NetInfo.fetch();
  handleNetworkChange(state);

  console.log(
    "[OfflineSync] Initialized with",
    pendingOperations.length,
    "pending operations"
  );
}

/**
 * Cleanup when service is no longer needed.
 */
export function destroyOfflineSyncService(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ============================================================================
// NETWORK MONITORING
// ============================================================================

function startNetworkListener(): void {
  unsubscribeNetInfo = NetInfo.addEventListener(handleNetworkChange);
}

function handleNetworkChange(state: NetInfoState): void {
  const wasOnline = isOnline;
  isOnline = state.isConnected === true && state.isInternetReachable !== false;

  if (wasOnline !== isOnline) {
    console.log(
      "[OfflineSync] Network status changed:",
      isOnline ? "ONLINE" : "OFFLINE"
    );
    onStatusChange?.(isOnline);

    // If came back online, debounce and sync
    if (isOnline && pendingOperations.length > 0) {
      scheduleSync();
    }
  }
}

function scheduleSync(): void {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Debounce 3 seconds before syncing
  debounceTimer = setTimeout(() => {
    processQueue();
  }, DEBOUNCE_MS);

  console.log("[OfflineSync] Sync scheduled in", DEBOUNCE_MS, "ms");
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Add an operation to the offline queue.
 */
export async function queueOperation(
  op: Omit<OfflineOperation, "id" | "timestamp" | "retryCount" | "status">
): Promise<string> {
  const operation: OfflineOperation = {
    ...op,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  pendingOperations.push(operation);
  await saveQueueToStorage();
  onQueueChange?.(
    pendingOperations.filter((o) => o.status === "pending").length
  );

  console.log("[OfflineSync] Queued operation:", operation.type, operation.id);

  // If online, schedule immediate sync
  if (isOnline) {
    scheduleSync();
  }

  return operation.id;
}

/**
 * Remove an operation from the queue (after success or permanent failure).
 */
export async function removeOperation(operationId: string): Promise<void> {
  pendingOperations = pendingOperations.filter((op) => op.id !== operationId);
  await saveQueueToStorage();
  onQueueChange?.(
    pendingOperations.filter((o) => o.status === "pending").length
  );
}

/**
 * Mark an operation as discarded (conflict resolution).
 */
export async function discardOperation(operationId: string): Promise<void> {
  pendingOperations = pendingOperations.map((op) =>
    op.id === operationId ? { ...op, status: "discarded" as const } : op
  );
  await saveQueueToStorage();
  onQueueChange?.(
    pendingOperations.filter((o) => o.status === "pending").length
  );
}

/**
 * Get count of pending operations.
 */
export function getPendingCount(): number {
  return pendingOperations.filter((op) => op.status === "pending").length;
}

/**
 * Get current online status.
 */
export function getIsOnline(): boolean {
  return isOnline;
}

/**
 * Force sync now (for manual retry button).
 */
export async function syncNow(): Promise<void> {
  if (isOnline) {
    await processQueue();
  }
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process all pending operations in order.
 */
async function processQueue(): Promise<void> {
  if (syncInProgress) {
    console.log("[OfflineSync] Sync already in progress, skipping");
    return;
  }

  if (!isOnline) {
    console.log("[OfflineSync] Offline, skipping sync");
    return;
  }

  if (!executeOperation) {
    console.error("[OfflineSync] No executeOperation handler registered");
    return;
  }

  const pending = pendingOperations.filter((op) => op.status === "pending");
  if (pending.length === 0) {
    console.log("[OfflineSync] No pending operations");
    return;
  }

  syncInProgress = true;
  console.log("[OfflineSync] Processing", pending.length, "operations");

  for (const operation of pending) {
    // Check if still online before each operation
    if (!isOnline) {
      console.log("[OfflineSync] Went offline during sync, stopping");
      break;
    }

    // Mark as processing
    operation.status = "processing";
    await saveQueueToStorage();

    try {
      const success = await executeOperation(operation);

      if (success) {
        console.log("[OfflineSync] Operation succeeded:", operation.id);
        await removeOperation(operation.id);
      } else {
        // Increment retry count
        operation.retryCount++;

        if (operation.retryCount >= MAX_RETRY_ATTEMPTS) {
          // Max retries reached - discard (conflict resolution = silent discard)
          console.log(
            "[OfflineSync] Max retries reached, discarding:",
            operation.id
          );
          await discardOperation(operation.id);
        } else {
          // Reset to pending for next retry
          operation.status = "pending";
          await saveQueueToStorage();
          console.log(
            "[OfflineSync] Operation failed, will retry:",
            operation.id,
            "attempt",
            operation.retryCount
          );
        }
      }
    } catch (error) {
      console.error(
        "[OfflineSync] Error executing operation:",
        operation.id,
        error
      );
      operation.retryCount++;

      if (operation.retryCount >= MAX_RETRY_ATTEMPTS) {
        await discardOperation(operation.id);
      } else {
        operation.status = "pending";
        await saveQueueToStorage();
      }
    }
  }

  syncInProgress = false;
  onQueueChange?.(
    pendingOperations.filter((o) => o.status === "pending").length
  );
  console.log("[OfflineSync] Sync complete");
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadQueueFromStorage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      pendingOperations = JSON.parse(stored);
      // Reset any "processing" status to "pending" (in case app crashed during sync)
      pendingOperations = pendingOperations.map((op) =>
        op.status === "processing" ? { ...op, status: "pending" as const } : op
      );
      console.log(
        "[OfflineSync] Loaded",
        pendingOperations.length,
        "operations from storage"
      );
    }
  } catch (error) {
    console.error("[OfflineSync] Failed to load queue from storage:", error);
    pendingOperations = [];
  }
}

async function saveQueueToStorage(): Promise<void> {
  try {
    // Only persist non-discarded operations
    const toSave = pendingOperations.filter((op) => op.status !== "discarded");
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error("[OfflineSync] Failed to save queue to storage:", error);
  }
}

// ============================================================================
// ORDER RECONCILIATION
// ============================================================================

export interface ReconciliationResult {
  success: boolean;
  itemsAdded: number;
  itemsRemoved: number;
  itemsUpdated: number;
  errors: string[];
}

/**
 * Reconcile local order state with backend after network recovery.
 * Backend is source of truth - local state is updated to match backend.
 *
 * @param supabase - Supabase client instance
 * @param localOrderId - Local order ID from useOrderStore
 * @param dbOrderId - Backend order UUID
 * @param getLocalOrder - Function to get local order state
 * @param updateLocalOrder - Function to update local order with backend state
 */
export async function reconcileOrderWithBackend(
  supabase: any,
  localOrderId: string,
  dbOrderId: string,
  getLocalOrder: () => any,
  updateLocalOrder: (updates: any) => void
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    success: false,
    itemsAdded: 0,
    itemsRemoved: 0,
    itemsUpdated: 0,
    errors: [],
  };

  if (!supabase || !dbOrderId) {
    result.errors.push("Missing Supabase client or order ID");
    return result;
  }

  try {
    console.log("[Reconciliation] Starting reconciliation for order:", dbOrderId);

    // Fetch backend order state
    const { data, error } = await supabase.rpc("get_order_details", {
      p_order_id: dbOrderId,
    });

    if (error) {
      result.errors.push(`Failed to fetch backend order: ${error.message}`);
      return result;
    }

    if (!data) {
      result.errors.push("No order data returned from backend");
      return result;
    }

    const localOrder = getLocalOrder();
    if (!localOrder) {
      result.errors.push("Local order not found");
      return result;
    }

    // Build a map of backend items by their ID
    const backendItemsMap = new Map<string, any>();
    (data.items || []).forEach((item: any) => {
      backendItemsMap.set(item.id, item);
    });

    // Build a map of local items by their db_order_item_id
    const localItemsMap = new Map<string, any>();
    (localOrder.items || []).forEach((item: any) => {
      if (item.db_order_item_id) {
        localItemsMap.set(item.db_order_item_id, item);
      }
    });

    // Detect differences
    const itemsToAdd: any[] = [];
    const itemsToUpdate: any[] = [];
    const itemIdsToRemove = new Set<string>();

    // Check backend items against local
    backendItemsMap.forEach((backendItem, backendItemId) => {
      const localItem = localItemsMap.get(backendItemId);
      if (!localItem) {
        // Item in backend but not local - add it
        itemsToAdd.push(backendItem);
        result.itemsAdded++;
      } else {
        // Item exists in both - check for updates
        if (
          backendItem.quantity !== localItem.quantity ||
          backendItem.kitchen_status !== localItem.kitchen_status
        ) {
          itemsToUpdate.push({
            localId: localItem.id,
            updates: {
              quantity: backendItem.quantity,
              kitchen_status: backendItem.kitchen_status,
              item_status: backendItem.item_status,
            },
          });
          result.itemsUpdated++;
        }
      }
    });

    // Check local items that are not in backend (should be removed)
    localItemsMap.forEach((localItem, dbItemId) => {
      if (!backendItemsMap.has(dbItemId)) {
        // Item in local but not backend - mark for removal
        itemIdsToRemove.add(localItem.id);
        result.itemsRemoved++;
      }
    });

    // Apply reconciliation updates
    const reconciledItems = localOrder.items
      .filter((item: any) => !itemIdsToRemove.has(item.id))
      .map((item: any) => {
        const update = itemsToUpdate.find((u) => u.localId === item.id);
        if (update) {
          return { ...item, ...update.updates, sync_status: "synced" as const };
        }
        // Mark existing items as synced
        return item.db_order_item_id
          ? { ...item, sync_status: "synced" as const }
          : item;
      });

    // Add new items from backend
    itemsToAdd.forEach((backendItem) => {
      reconciledItems.push({
        id: `sync_${backendItem.id}`,
        db_order_item_id: backendItem.id,
        menuItemId: backendItem.menu_item_id,
        name: backendItem.item_name,
        quantity: backendItem.quantity,
        price: backendItem.unit_price,
        originalPrice: backendItem.unit_price,
        kitchen_status: backendItem.kitchen_status,
        item_status: backendItem.item_status,
        sync_status: "synced" as const,
        customizations: {
          notes: backendItem.special_instructions,
          modifiers: [], // Would need more data to populate
        },
      });
    });

    // Update local order with reconciled state
    updateLocalOrder({
      items: reconciledItems,
      total_amount: data.total_amount,
      total_tax: data.tax_amount,
      order_status: data.status,
    });

    result.success = true;
    console.log("[Reconciliation] Complete:", result);

    return result;
  } catch (err: any) {
    result.errors.push(`Reconciliation error: ${err?.message || "Unknown"}`);
    console.error("[Reconciliation] Error:", err);
    return result;
  }
}

/**
 * Trigger reconciliation for all orders with failed sync status.
 */
export async function reconcileFailedOrders(
  supabase: any,
  getOrdersWithFailedSyncs: () => Array<{ localId: string; dbId: string }>,
  getLocalOrder: (id: string) => any,
  updateLocalOrder: (id: string, updates: any) => void
): Promise<void> {
  const failedOrders = getOrdersWithFailedSyncs();

  if (failedOrders.length === 0) {
    console.log("[Reconciliation] No orders with failed syncs");
    return;
  }

  console.log(
    `[Reconciliation] Reconciling ${failedOrders.length} orders with failed syncs`
  );

  for (const order of failedOrders) {
    await reconcileOrderWithBackend(
      supabase,
      order.localId,
      order.dbId,
      () => getLocalOrder(order.localId),
      (updates) => updateLocalOrder(order.localId, updates)
    );
  }
}
