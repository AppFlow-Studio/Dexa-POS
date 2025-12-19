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
