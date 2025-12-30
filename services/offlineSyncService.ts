/**
 * Offline Sync Service
 *
 * Manages operation queueing when offline and auto-sync when back online.
 * Uses AsyncStorage for persistence and NetInfo for network monitoring.
 *
 * Enhanced with:
 * - Priority-based processing (orders before items before payments)
 * - Dependency tracking between operations
 * - Operation collapsing for same-entity updates
 * - Full context capture for reliable replay
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
  | "process_cash_payment"
  | "process_card_payment"
  // Floor plan operations
  | "seat_guests"
  | "update_session_status"
  // Coursing operations
  | "fire_course";

/**
 * Priority levels for operation processing.
 * Lower number = higher priority (processed first).
 */
export const OPERATION_PRIORITY: Record<OperationType, number> = {
  // Order creation must happen first
  create_order: 1,
  seat_guests: 1,
  update_session_status: 1,

  // Item operations after order exists
  add_item: 2,
  update_item: 3,
  update_item_quantity: 3,
  replace_modifiers: 3,
  remove_item: 3,
  void_item: 3,

  // Coursing after items
  fire_course: 4,
  update_order_status: 4,

  // Payments last (after everything else synced)
  process_cash_payment: 5,
  process_card_payment: 5,
};

export interface OfflineOperation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  localOrderId: string;
  localItemId?: string;
  timestamp: string;
  retryCount: number;
  status: "pending" | "processing" | "failed" | "discarded" | "blocked";
  // Enhanced fields for dependency tracking
  priority: number;
  dependsOn?: string; // ID of operation this depends on (must complete first)
  entityKey?: string; // Unique key for collapsing (e.g., "item:localItemId")
  contextSnapshot?: Record<string, any>; // Full context at time of queueing
}

export interface SyncResult {
  success: boolean;
  operationId: string;
  error?: string;
  backendId?: string; // Backend ID returned from successful operation
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
let onOperationFailed: ((op: OfflineOperation) => void) | null = null;
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
  onOperationFailed?: (op: OfflineOperation) => void;
  executeOperation: (op: OfflineOperation) => Promise<boolean>;
}): Promise<void> {
  onStatusChange = config.onStatusChange;
  onQueueChange = config.onQueueChange;
  onOperationFailed = config.onOperationFailed ?? null;
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
 * Generate an entity key for operation collapsing.
 */
function generateEntityKey(op: Partial<OfflineOperation>): string | undefined {
  switch (op.type) {
    case "create_order":
      return `order:${op.localOrderId}`;
    case "add_item":
    case "update_item":
    case "update_item_quantity":
    case "replace_modifiers":
    case "void_item":
    case "remove_item":
      return op.localItemId ? `item:${op.localItemId}` : undefined;
    case "update_order_status":
      return `order_status:${op.localOrderId}`;
    case "process_cash_payment":
    case "process_card_payment":
      // Each payment is unique, don't collapse
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Check if an operation can be collapsed into an existing one.
 * Returns the operation to collapse into, or null if no collapsing possible.
 */
function findCollapseTarget(
  entityKey: string,
  newType: OperationType
): OfflineOperation | null {
  // Only collapse updates, not creates or deletes
  const collapsibleTypes: OperationType[] = [
    "update_item",
    "update_item_quantity",
    "replace_modifiers",
    "update_order_status",
  ];

  if (!collapsibleTypes.includes(newType)) {
    return null;
  }

  // Find the most recent pending operation with the same entity key
  const candidates = pendingOperations
    .filter(
      (op) =>
        op.entityKey === entityKey &&
        op.status === "pending" &&
        collapsibleTypes.includes(op.type)
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return candidates[0] || null;
}

/**
 * Add an operation to the offline queue.
 * Supports priority ordering, dependency tracking, and operation collapsing.
 */
export async function queueOperation(
  op: Omit<OfflineOperation, "id" | "timestamp" | "retryCount" | "status" | "priority">
): Promise<string> {
  const priority = OPERATION_PRIORITY[op.type] ?? 99;
  const entityKey = generateEntityKey(op);

  // Check for operation collapsing
  if (entityKey) {
    const collapseTarget = findCollapseTarget(entityKey, op.type);
    if (collapseTarget) {
      // Merge params into existing operation
      collapseTarget.params = { ...collapseTarget.params, ...op.params };
      collapseTarget.timestamp = new Date().toISOString();
      if (op.contextSnapshot) {
        collapseTarget.contextSnapshot = {
          ...collapseTarget.contextSnapshot,
          ...op.contextSnapshot,
        };
      }
      await saveQueueToStorage();
      console.log(
        "[OfflineSync] Collapsed operation into:",
        collapseTarget.id,
        collapseTarget.type
      );
      return collapseTarget.id;
    }
  }

  const operation: OfflineOperation = {
    ...op,
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    priority,
    entityKey,
  };

  pendingOperations.push(operation);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  console.log(
    "[OfflineSync] Queued operation:",
    operation.type,
    operation.id,
    `(priority: ${priority})`
  );

  // If online, schedule immediate sync
  if (isOnline) {
    scheduleSync();
  }

  return operation.id;
}

/**
 * Queue an operation with explicit dependency on another operation.
 */
export async function queueDependentOperation(
  op: Omit<OfflineOperation, "id" | "timestamp" | "retryCount" | "status" | "priority">,
  dependsOnOperationId: string
): Promise<string> {
  const opWithDep = { ...op, dependsOn: dependsOnOperationId };
  return queueOperation(opWithDep);
}

/**
 * Get count of active pending operations (excluding blocked).
 */
function getActivePendingCount(): number {
  return pendingOperations.filter(
    (op) => op.status === "pending" || op.status === "blocked"
  ).length;
}

/**
 * Remove an operation from the queue (after success or permanent failure).
 */
export async function removeOperation(operationId: string): Promise<void> {
  pendingOperations = pendingOperations.filter((op) => op.id !== operationId);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
}

/**
 * Mark an operation as discarded (conflict resolution).
 */
export async function discardOperation(operationId: string): Promise<void> {
  pendingOperations = pendingOperations.map((op) =>
    op.id === operationId ? { ...op, status: "discarded" as const } : op
  );
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
}

/**
 * Retry a failed operation.
 */
export async function retryFailedOperation(operationId: string): Promise<void> {
  const op = pendingOperations.find((o) => o.id === operationId);
  if (op && op.status === "failed") {
    op.status = "pending";
    op.retryCount = 0;
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());

    if (isOnline) {
      scheduleSync();
    }
  }
}

/**
 * Get count of pending operations.
 */
export function getPendingCount(): number {
  return pendingOperations.filter((op) => op.status === "pending").length;
}

/**
 * Get count of failed operations.
 */
export function getFailedCount(): number {
  return pendingOperations.filter((op) => op.status === "failed").length;
}

/**
 * Get all failed operations (for UI display).
 */
export function getFailedOperations(): OfflineOperation[] {
  return pendingOperations.filter((op) => op.status === "failed");
}

/**
 * Get pending payment operations count.
 */
export function getPendingPaymentsCount(): number {
  return pendingOperations.filter(
    (op) =>
      (op.type === "process_cash_payment" || op.type === "process_card_payment") &&
      (op.status === "pending" || op.status === "blocked" || op.status === "processing")
  ).length;
}

/**
 * Get failed payment operations.
 */
export function getFailedPayments(): OfflineOperation[] {
  return pendingOperations.filter(
    (op) =>
      (op.type === "process_cash_payment" || op.type === "process_card_payment") &&
      op.status === "failed"
  );
}

/**
 * Get all operations for a specific order.
 */
export function getOperationsForOrder(localOrderId: string): OfflineOperation[] {
  return pendingOperations.filter((op) => op.localOrderId === localOrderId);
}

/**
 * Cancel all operations for an order (e.g., when order is voided).
 */
export async function cancelOrderOperations(localOrderId: string): Promise<void> {
  const opsToCancel = pendingOperations.filter(
    (op) => op.localOrderId === localOrderId && op.status !== "discarded"
  );

  for (const op of opsToCancel) {
    op.status = "discarded";
  }

  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());
  console.log(
    `[OfflineSync] Cancelled ${opsToCancel.length} operations for order:`,
    localOrderId
  );
}

/**
 * Update operation params (e.g., after ID resolution).
 */
export async function updateOperationParams(
  operationId: string,
  params: Record<string, any>
): Promise<void> {
  const op = pendingOperations.find((o) => o.id === operationId);
  if (op) {
    op.params = { ...op.params, ...params };
    await saveQueueToStorage();
  }
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
 * Sort operations by priority and timestamp for processing order.
 */
function sortOperationsByPriority(ops: OfflineOperation[]): OfflineOperation[] {
  return [...ops].sort((a, b) => {
    // First by priority (lower = higher priority)
    const priorityDiff = (a.priority ?? 99) - (b.priority ?? 99);
    if (priorityDiff !== 0) return priorityDiff;

    // Then by timestamp (older first)
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

/**
 * Check if an operation's dependencies are satisfied.
 */
function areDependenciesSatisfied(op: OfflineOperation): boolean {
  if (!op.dependsOn) return true;

  // Check if the dependent operation exists and is completed
  const dependency = pendingOperations.find((o) => o.id === op.dependsOn);

  // If dependency doesn't exist in queue, it's either completed or never existed
  if (!dependency) return true;

  // If dependency is still pending/processing/blocked, we can't proceed
  if (
    dependency.status === "pending" ||
    dependency.status === "processing" ||
    dependency.status === "blocked"
  ) {
    return false;
  }

  // Dependency is completed (removed) or discarded
  return true;
}

/**
 * Get all operations that are ready to process (pending + dependencies satisfied).
 */
function getReadyOperations(): OfflineOperation[] {
  const pending = pendingOperations.filter((op) => op.status === "pending");
  const ready = pending.filter((op) => areDependenciesSatisfied(op));
  return sortOperationsByPriority(ready);
}

/**
 * Mark operations as blocked if their dependencies aren't satisfied.
 */
async function updateBlockedOperations(): Promise<void> {
  let changed = false;

  for (const op of pendingOperations) {
    if (op.status === "pending" && !areDependenciesSatisfied(op)) {
      op.status = "blocked";
      changed = true;
    } else if (op.status === "blocked" && areDependenciesSatisfied(op)) {
      op.status = "pending";
      changed = true;
    }
  }

  if (changed) {
    await saveQueueToStorage();
  }
}

/**
 * Process all pending operations in priority order with dependency tracking.
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

  // Update blocked status before processing
  await updateBlockedOperations();

  const readyOps = getReadyOperations();
  if (readyOps.length === 0) {
    const blocked = pendingOperations.filter((op) => op.status === "blocked");
    if (blocked.length > 0) {
      console.log(
        "[OfflineSync] No ready operations,",
        blocked.length,
        "blocked by dependencies"
      );
    } else {
      console.log("[OfflineSync] No pending operations");
    }
    return;
  }

  syncInProgress = true;
  console.log(
    "[OfflineSync] Processing",
    readyOps.length,
    "operations (by priority)"
  );

  let successCount = 0;
  let failCount = 0;

  for (const operation of readyOps) {
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
        console.log(
          "[OfflineSync] Operation succeeded:",
          operation.type,
          operation.id
        );
        await removeOperation(operation.id);
        successCount++;

        // After completing an operation, unblock dependent operations
        await updateBlockedOperations();
      } else {
        // Increment retry count
        operation.retryCount++;
        failCount++;

        if (operation.retryCount >= MAX_RETRY_ATTEMPTS) {
          // Max retries reached - mark as failed for manual intervention
          console.log(
            "[OfflineSync] Max retries reached, marking failed:",
            operation.id
          );
          operation.status = "failed";
          await saveQueueToStorage();

          // Notify about failed operation (especially for payments)
          onOperationFailed?.(operation);
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
      failCount++;

      if (operation.retryCount >= MAX_RETRY_ATTEMPTS) {
        operation.status = "failed";
        await saveQueueToStorage();
        onOperationFailed?.(operation);
      } else {
        operation.status = "pending";
        await saveQueueToStorage();
      }
    }
  }

  syncInProgress = false;
  onQueueChange?.(getActivePendingCount());
  console.log(
    `[OfflineSync] Sync complete: ${successCount} succeeded, ${failCount} failed`
  );

  // If we had failures but there are still ready operations, try again
  const stillReady = getReadyOperations();
  if (stillReady.length > 0 && isOnline) {
    console.log(
      "[OfflineSync] Still have ready operations, scheduling retry..."
    );
    scheduleSync();
  }
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
