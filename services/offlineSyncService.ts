/**
 * Offline Sync Service
 *
 * Manages operation queueing when offline and auto-sync when back online.
 * Uses MMKV for blazing-fast synchronous persistence and NetInfo for network monitoring.
 *
 * Enhanced with:
 * - Priority-based processing (orders before items before payments)
 * - Dependency tracking between operations
 * - Operation collapsing for same-entity updates
 * - Full context capture for reliable replay
 */

import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import {
  isValidUUID,
  resolveToBackendId,
  isSynced,
} from "@/lib/offlineIdRegistry";
import { isLocalOrder } from "@/utils/orderIdHelpers";
import { v4 as uuidv4 } from "uuid";
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
  | "apply_discount"
  | "void_discount"         // Void/remove a discount via RPC
  // Kitchen operations
  | "send_to_kitchen"       // Updates order status + item statuses
  // Payment operations (unified + legacy)
  | "process_payment"       // Unified payment via process_payment_v2
  | "process_cash_payment"  // Legacy - routes to process_payment handler
  | "process_card_payment"  // Legacy - routes to process_payment handler
  // Floor plan operations
  | "seat_guests"
  | "update_session_status"
  | "link_order_to_session"  // Bidirectional order-session linking
  // Check status operations
  | "close_check"           // Close check (lock from edits)
  | "reopen_check"          // Reopen closed check
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
  link_order_to_session: 1,  // Relationship operation, high priority

  // Item operations after order exists
  add_item: 2,
  apply_discount: 2,
  void_discount: 2,         // Same priority as apply_discount
  update_item: 3,
  update_item_quantity: 3,
  replace_modifiers: 3,
  remove_item: 3,
  void_item: 3,

  // Coursing and kitchen after items
  fire_course: 4,
  update_order_status: 4,
  send_to_kitchen: 4,       // Kitchen send after items synced
  
  // Check status operations (after items/payments)
  close_check: 4,           // Close check
  reopen_check: 4,          // Reopen check

  // Payments last (after everything else synced)
  process_payment: 5,       // Unified payment via process_payment_v2
  process_cash_payment: 5,  // Legacy support
  process_card_payment: 5,  // Legacy support
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
  // Phase 6: Operation bundling for atomic execution
  bundleId?: string;           // Groups related operations for atomic execution
  bundleSequence?: number;     // Order within bundle (0-indexed)
  rollbackOnBundleFailure?: boolean; // Whether to rollback if bundle fails
  expectedVersion?: number;    // For optimistic locking checks
  idempotencyKey?: string;      // UUID for server-side dedup, auto-generated if not provided
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
const DEAD_LETTER_STORAGE_KEY = "offline_dead_letter_queue";
const MAX_RETRY_ATTEMPTS = 5;
const DEBOUNCE_MS = 3000;
const MAX_QUEUE_SIZE = 500;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PAYMENT_TYPES: OperationType[] = [
  "process_payment",
  "process_cash_payment",
  "process_card_payment",
];

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify an error as transient (retry-safe) or permanent (should dead-letter).
 *
 * Transient: network timeouts, 5xx, 408, 429
 * Permanent: 400, 401, 403, 404, 409, 422 (validation/auth errors)
 */
export function isTransientError(error: any): boolean {
  if (!error) return true; // No error info → assume transient
  const status =
    error.status ?? error.code ?? error.statusCode ?? error.httpStatus;
  if (typeof status === "number") {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false; // 4xx are permanent
  }
  const msg = (error.message ?? error.msg ?? "").toLowerCase();
  if (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("fetch failed")
  ) {
    return true;
  }
  return true; // Default: assume transient so we retry
}

// ============================================================================
// AUTO-RETRY CONFIGURATION (Exponential Backoff)
// ============================================================================
const RETRY_CONFIG = {
  baseDelayMs: 2000,      // Initial retry delay: 2 seconds
  maxDelayMs: 60000,      // Maximum delay: 1 minute
  multiplier: 2,          // Double the delay each retry
  jitterMs: 1000,         // Random jitter up to 1 second
};

/**
 * Calculate exponential backoff delay with jitter
 * Formula: min(maxDelay, baseDelay * multiplier^retryCount) + random(0, jitter)
 */
function calculateBackoffDelay(retryCount: number): number {
  const delay = Math.min(
    RETRY_CONFIG.maxDelayMs,
    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.multiplier, retryCount)
  );
  const jitter = Math.random() * RETRY_CONFIG.jitterMs;
  return Math.round(delay + jitter);
}

// Track scheduled retry timers for cleanup
let autoRetryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// ============================================================================
// STATE
// ============================================================================

let isOnline = true;
let pendingOperations: OfflineOperation[] = [];
let deadLetterQueue: OfflineOperation[] = [];
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
  // Clear all auto-retry timers
  for (const timer of autoRetryTimers.values()) {
    clearTimeout(timer);
  }
  autoRetryTimers.clear();
}

/**
 * Schedule an automatic retry for a specific operation with exponential backoff.
 */
function scheduleAutoRetry(operation: OfflineOperation): void {
  // Clear any existing timer for this operation
  const existingTimer = autoRetryTimers.get(operation.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = calculateBackoffDelay(operation.retryCount);
  console.log(`[OfflineSync] Scheduling auto-retry for ${operation.type} (${operation.id}) in ${delay}ms (attempt ${operation.retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);

  const timer = setTimeout(async () => {
    autoRetryTimers.delete(operation.id);

    // Check if still online and operation still exists
    if (!isOnline) {
      console.log(`[OfflineSync] Auto-retry cancelled: offline`);
      return;
    }

    const op = pendingOperations.find(o => o.id === operation.id);
    if (!op || op.status === "discarded" || op.status === "failed") {
      console.log(`[OfflineSync] Auto-retry cancelled: operation no longer pending`);
      return;
    }

    console.log(`[OfflineSync] Auto-retrying: ${operation.type} (${operation.id})`);

    // Trigger queue processing
    processQueue();
  }, delay);

  autoRetryTimers.set(operation.id, timer);
}

/**
 * Schedule auto-retry for all pending operations after coming back online.
 */
function scheduleAllAutoRetries(): void {
  const pendingOps = pendingOperations.filter(
    op => op.status === "pending" && op.retryCount > 0
  );

  for (const op of pendingOps) {
    scheduleAutoRetry(op);
  }

  if (pendingOps.length > 0) {
    console.log(`[OfflineSync] Scheduled auto-retry for ${pendingOps.length} operations`);
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
      // Schedule immediate sync for operations that haven't failed yet
      scheduleSync();

      // Also schedule auto-retries for operations that have failed before
      // This uses exponential backoff based on their retry count
      scheduleAllAutoRetries();
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
  // Phase 5: All visible orders can have operations queued
  // Local orders (order_xxx) need CREATE_ORDER first
  // Backend orders (UUIDs) already exist and can accept item operations directly

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
    idempotencyKey: op.idempotencyKey || uuidv4(),
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

// ============================================================================
// Phase 6: OPERATION BUNDLING
// ============================================================================

/**
 * Bundle options for atomic operation execution.
 */
export interface BundleOptions {
  rollbackOnFailure?: boolean;  // If true, mark all ops as failed if any fail
  expectedVersion?: number;     // Version check before executing bundle
}

/**
 * Queue multiple operations as an atomic bundle.
 * All operations in the bundle will be executed in sequence.
 * If any operation fails and rollbackOnFailure is true, remaining ops are marked failed.
 *
 * @param operations Array of operations to bundle (executed in order)
 * @param options Bundle execution options
 * @returns Array of operation IDs in bundle order
 */
export async function queueOperationBundle(
  operations: Array<Omit<OfflineOperation, "id" | "timestamp" | "retryCount" | "status" | "priority">>,
  options: BundleOptions = {}
): Promise<string[]> {
  if (operations.length === 0) {
    return [];
  }

  const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const operationIds: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const priority = OPERATION_PRIORITY[op.type] ?? 99;
    const entityKey = generateEntityKey(op);

    const operation: OfflineOperation = {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: "pending",
      priority,
      entityKey,
      idempotencyKey: op.idempotencyKey || uuidv4(),
      // Bundle-specific fields
      bundleId,
      bundleSequence: i,
      rollbackOnBundleFailure: options.rollbackOnFailure ?? true,
      expectedVersion: i === 0 ? options.expectedVersion : undefined, // Only first op checks version
      // Chain dependency within bundle
      dependsOn: i > 0 ? operationIds[i - 1] : op.dependsOn,
    };

    pendingOperations.push(operation);
    operationIds.push(operation.id);

    console.log(
      "[OfflineSync] Bundled operation:",
      operation.type,
      operation.id,
      `(bundle: ${bundleId}, seq: ${i})`
    );
  }

  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  // If online, schedule immediate sync
  if (isOnline) {
    scheduleSync();
  }

  return operationIds;
}

/**
 * Get all operations in a bundle.
 */
export function getBundleOperations(bundleId: string): OfflineOperation[] {
  return pendingOperations
    .filter((op) => op.bundleId === bundleId)
    .sort((a, b) => (a.bundleSequence ?? 0) - (b.bundleSequence ?? 0));
}

/**
 * Mark all remaining operations in a bundle as failed.
 * Called when a bundle operation fails and rollbackOnBundleFailure is true.
 */
export async function failBundle(bundleId: string, failedOpId: string): Promise<void> {
  pendingOperations = pendingOperations.map((op) => {
    if (op.bundleId === bundleId && op.id !== failedOpId && op.status === "pending") {
      return { ...op, status: "discarded" as const };
    }
    return op;
  });

  await saveQueueToStorage();
  console.log("[OfflineSync] Bundle failed, discarded remaining ops:", bundleId);
}

/**
 * Check if all operations in a bundle have completed successfully.
 */
export function isBundleComplete(bundleId: string): boolean {
  const bundleOps = getBundleOperations(bundleId);
  if (bundleOps.length === 0) return true;

  return bundleOps.every((op) => op.status !== "pending" && op.status !== "processing");
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
      (op.type === "process_payment" || op.type === "process_cash_payment" || op.type === "process_card_payment") &&
      (op.status === "pending" || op.status === "blocked" || op.status === "processing")
  ).length;
}

/**
 * Get failed payment operations.
 */
export function getFailedPayments(): OfflineOperation[] {
  return pendingOperations.filter(
    (op) =>
      (op.type === "process_payment" || op.type === "process_cash_payment" || op.type === "process_card_payment") &&
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
 * Check if there's a pending create_order operation for a given order.
 * Used to block items/payments until order is created.
 */
export function hasPendingOrderCreation(localOrderId: string): boolean {
  return pendingOperations.some(
    (op) =>
      op.localOrderId === localOrderId &&
      op.type === "create_order" &&
      (op.status === "pending" || op.status === "processing" || op.status === "blocked")
  );
}

/**
 * Get the create_order operation ID for a given order, if it exists.
 */
export function getOrderCreationOperationId(localOrderId: string): string | null {
  const op = pendingOperations.find(
    (op) =>
      op.localOrderId === localOrderId &&
      op.type === "create_order" &&
      (op.status === "pending" || op.status === "processing" || op.status === "blocked")
  );
  return op?.id || null;
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
 * Check if auto-retry is in progress (for UI indicator).
 */
export function isAutoRetryInProgress(): boolean {
  return autoRetryTimers.size > 0;
}

/**
 * Get count of operations scheduled for auto-retry.
 */
export function getAutoRetryCount(): number {
  return autoRetryTimers.size;
}

/**
 * Force sync now (for manual retry button).
 */
export async function syncNow(): Promise<void> {
  if (isOnline) {
    await processQueue();
  }
}

/**
 * Get a detailed status of the queue for debugging.
 */
export function getQueueStatus(): {
  total: number;
  pending: number;
  blocked: number;
  processing: number;
  failed: number;
  byType: Record<string, number>;
  byOrder: Record<string, { types: string[]; hasCreateOrder: boolean }>;
} {
  const allOps = pendingOperations.filter((op) => op.status !== "discarded");
  const byType: Record<string, number> = {};
  const byOrder: Record<string, { types: string[]; hasCreateOrder: boolean }> = {};

  for (const op of allOps) {
    byType[op.type] = (byType[op.type] || 0) + 1;

    if (op.localOrderId) {
      if (!byOrder[op.localOrderId]) {
        byOrder[op.localOrderId] = { types: [], hasCreateOrder: false };
      }
      byOrder[op.localOrderId].types.push(`${op.type}(${op.status})`);
      if (op.type === "create_order") {
        byOrder[op.localOrderId].hasCreateOrder = true;
      }
    }
  }

  return {
    total: allOps.length,
    pending: allOps.filter((op) => op.status === "pending").length,
    blocked: allOps.filter((op) => op.status === "blocked").length,
    processing: allOps.filter((op) => op.status === "processing").length,
    failed: allOps.filter((op) => op.status === "failed").length,
    byType,
    byOrder,
  };
}

/**
 * Log the current queue status to console (for debugging).
 */
export function logQueueStatus(): void {
  const status = getQueueStatus();
  console.log("[OfflineSync] ====== QUEUE STATUS ======");
  console.log(`[OfflineSync] Total: ${status.total}`);
  console.log(`[OfflineSync]   Pending: ${status.pending}`);
  console.log(`[OfflineSync]   Blocked: ${status.blocked}`);
  console.log(`[OfflineSync]   Processing: ${status.processing}`);
  console.log(`[OfflineSync]   Failed: ${status.failed}`);
  console.log("[OfflineSync] By type:", JSON.stringify(status.byType));
  console.log("[OfflineSync] By order:");
  for (const [orderId, info] of Object.entries(status.byOrder)) {
    console.log(`[OfflineSync]   ${orderId}:`);
    console.log(`[OfflineSync]     hasCreateOrder: ${info.hasCreateOrder}`);
    console.log(`[OfflineSync]     operations: ${info.types.join(", ")}`);
  }
}

// ============================================================================
// DEAD LETTER QUEUE MANAGEMENT
// ============================================================================

function moveToDeadLetter(operation: OfflineOperation): void {
  deadLetterQueue.push({
    ...operation,
    status: "failed" as const,
  });
  saveDeadLetterToStorage();
}

function loadDeadLetterFromStorage(): void {
  try {
    const stored = getSyncJSON<OfflineOperation[]>(DEAD_LETTER_STORAGE_KEY);
    if (stored) {
      deadLetterQueue = stored;
    }
  } catch (error) {
    console.error("[OfflineSync] Failed to load dead letter queue:", error);
    deadLetterQueue = [];
  }
}

function saveDeadLetterToStorage(): void {
  try {
    setSyncJSON(DEAD_LETTER_STORAGE_KEY, deadLetterQueue);
  } catch (error) {
    console.error("[OfflineSync] Failed to save dead letter queue:", error);
  }
}

/**
 * Get all dead-lettered operations for operator inspection.
 */
export function getDeadLetterOperations(): OfflineOperation[] {
  return [...deadLetterQueue];
}

/**
 * Get count of dead-lettered operations.
 */
export function getDeadLetterCount(): number {
  return deadLetterQueue.length;
}

/**
 * Retry a dead-lettered operation by moving it back to the pending queue.
 */
export async function retryDeadLetterOperation(operationId: string): Promise<void> {
  const idx = deadLetterQueue.findIndex((op) => op.id === operationId);
  if (idx === -1) return;

  const op = deadLetterQueue[idx];
  deadLetterQueue.splice(idx, 1);
  saveDeadLetterToStorage();

  op.status = "pending";
  op.retryCount = 0;
  pendingOperations.push(op);
  await saveQueueToStorage();
  onQueueChange?.(getActivePendingCount());

  if (isOnline) scheduleSync();
}

/**
 * Permanently discard a dead-lettered operation.
 */
export function discardDeadLetterOperation(operationId: string): void {
  deadLetterQueue = deadLetterQueue.filter((op) => op.id !== operationId);
  saveDeadLetterToStorage();
}

/**
 * Prune expired operations from the pending queue.
 * Non-payment ops older than OPERATION_TTL_MS are discarded.
 * Payment ops are moved to dead letter for manual review.
 */
export async function pruneExpiredOperations(): Promise<number> {
  const cutoff = Date.now() - OPERATION_TTL_MS;
  let pruned = 0;

  pendingOperations = pendingOperations.filter((op) => {
    if (op.status === "discarded") return false;
    const opTime = new Date(op.timestamp).getTime();
    if (opTime >= cutoff) return true;

    pruned++;
    if (PAYMENT_TYPES.includes(op.type)) {
      moveToDeadLetter(op);
      console.log(`[OfflineSync] Expired payment op moved to dead letter: ${op.id}`);
    } else {
      console.log(`[OfflineSync] Expired op discarded: ${op.type} (${op.id})`);
    }
    return false;
  });

  if (pruned > 0) {
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());
  }
  return pruned;
}

/**
 * Enforce queue size limit. Drops oldest non-critical operations when exceeded.
 */
async function enforceQueueSizeLimit(): Promise<void> {
  const active = pendingOperations.filter(
    (op) => op.status !== "discarded" && op.status !== "failed"
  );
  if (active.length <= MAX_QUEUE_SIZE) return;

  const excess = active.length - MAX_QUEUE_SIZE;
  const nonCriticalTypes: OperationType[] = [
    "update_order_status",
    "fire_course",
    "update_session_status",
  ];

  let dropped = 0;
  pendingOperations = pendingOperations.map((op) => {
    if (
      dropped < excess &&
      op.status === "pending" &&
      nonCriticalTypes.includes(op.type)
    ) {
      dropped++;
      return { ...op, status: "discarded" as const };
    }
    return op;
  });

  if (dropped > 0) {
    console.warn(`[OfflineSync] Queue size limit exceeded, dropped ${dropped} non-critical ops`);
    await saveQueueToStorage();
    onQueueChange?.(getActivePendingCount());
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
 * 
 * IMPLICIT DEPENDENCIES:
 * - add_item, process_payment, process_cash_payment, process_card_payment
 *   all implicitly depend on create_order for the same localOrderId.
 * - These operations will be blocked until create_order completes.
 */
function areDependenciesSatisfied(op: OfflineOperation): boolean {
  // EXPLICIT dependency check
  if (op.dependsOn) {
    const dependency = pendingOperations.find((o) => o.id === op.dependsOn);

    // If dependency doesn't exist in queue, it's either completed or never existed
    if (!dependency) {
      // Check if it was removed (completed) - continue
    } else if (
      dependency.status === "pending" ||
      dependency.status === "processing" ||
      dependency.status === "blocked"
    ) {
      return false;
    }
  }

  // IMPLICIT dependency: items and payments must wait for order creation
  const typesRequiringOrder = [
    "add_item",
    "apply_discount",
    "process_payment",
    "process_cash_payment",
    "process_card_payment",
    "update_order_status",
    "fire_course",
  ];

  if (typesRequiringOrder.includes(op.type) && op.localOrderId) {
    // Check if there's a pending create_order for this order
    const orderCreationPending = pendingOperations.some(
      (o) =>
        o.localOrderId === op.localOrderId &&
        o.type === "create_order" &&
        (o.status === "pending" || o.status === "processing" || o.status === "blocked")
    );

    if (orderCreationPending) {
      console.log(
        `[OfflineSync] ${op.type} blocked - waiting for create_order of ${op.localOrderId}`
      );
      return false;
    }
  }

  // ================================================================
  // NEW (Phase 3.3): RELATIONSHIP dependency checking
  // ================================================================
  // Check if referenced entities have been synced (have backend UUIDs)

  // link_order_to_session needs both order AND session to be synced
  if (op.type === "link_order_to_session") {
    const { orderId, sessionId } = op.params;

    // Check if order has been synced (has backend UUID)
    const orderReady = isValidUUID(orderId) || isSynced(orderId);
    if (!orderReady) {
      console.log(
        `[OfflineSync] link_order_to_session blocked - order ${orderId} not synced yet`
      );
      return false;
    }

    // Check if session has been synced (has backend UUID)
    const sessionReady = isValidUUID(sessionId) || isSynced(sessionId);
    if (!sessionReady) {
      console.log(
        `[OfflineSync] link_order_to_session blocked - session ${sessionId} not synced yet`
      );
      return false;
    }
  }

  // Item operations need parent order synced (additional check beyond create_order)
  if (
    (op.type === "add_item" ||
      op.type === "update_item" ||
      op.type === "update_item_quantity" ||
      op.type === "replace_modifiers" ||
      op.type === "remove_item" ||
      op.type === "void_item") &&
    op.localOrderId
  ) {
    // If localOrderId is still local (not a UUID), check if it's been synced
    if (!isValidUUID(op.localOrderId)) {
      const orderSynced = isSynced(op.localOrderId);
      if (!orderSynced) {
        console.log(
          `[OfflineSync] ${op.type} blocked - parent order ${op.localOrderId} not synced yet`
        );
        return false;
      }
    }
  }

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
 * Handle a failed operation: classify the error and decide between
 * retry (transient), dead-letter (permanent or max retries), or discard.
 */
async function handleOperationFailure(
  operation: OfflineOperation,
  error: any,
): Promise<void> {
  const permanent = error && !isTransientError(error);

  if (permanent || operation.retryCount >= MAX_RETRY_ATTEMPTS) {
    const reason = permanent ? "permanent error" : "max retries";
    console.log(
      `[OfflineSync] ✗ DEAD-LETTERED (${reason}): ${operation.type} (${operation.id})`
    );
    // Remove from active queue and move to dead letter
    pendingOperations = pendingOperations.filter((op) => op.id !== operation.id);
    moveToDeadLetter(operation);
    await saveQueueToStorage();
    onOperationFailed?.(operation);
  } else {
    operation.status = "pending";
    await saveQueueToStorage();
    console.log(
      `[OfflineSync] ⟳ RETRY: ${operation.type} (${operation.id}) - attempt ${operation.retryCount}/${MAX_RETRY_ATTEMPTS}`
    );
    scheduleAutoRetry(operation);
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

  // ========================================================================
  // COMPREHENSIVE QUEUE STATUS LOGGING
  // ========================================================================
  const allOps = pendingOperations.filter(
    (op) => op.status !== "discarded" && op.status !== "failed"
  );
  const byType: Record<string, number> = {};
  const byOrder: Record<string, string[]> = {};

  for (const op of allOps) {
    byType[op.type] = (byType[op.type] || 0) + 1;
    if (!byOrder[op.localOrderId]) {
      byOrder[op.localOrderId] = [];
    }
    byOrder[op.localOrderId].push(`${op.type}(${op.status})`);
  }

  console.log("[OfflineSync] ====== QUEUE STATUS ======");
  console.log("[OfflineSync] Total operations:", allOps.length);
  console.log("[OfflineSync] By type:", JSON.stringify(byType));
  console.log("[OfflineSync] By order:", JSON.stringify(byOrder));

  // Update blocked status before processing
  await updateBlockedOperations();

  const readyOps = getReadyOperations();
  const blocked = pendingOperations.filter((op) => op.status === "blocked");
  const pending = pendingOperations.filter((op) => op.status === "pending");

  console.log("[OfflineSync] Ready:", readyOps.length, "| Blocked:", blocked.length, "| Pending:", pending.length);

  if (readyOps.length === 0) {
    if (blocked.length > 0) {
      console.log("[OfflineSync] Blocked operations:");
      for (const op of blocked.slice(0, 5)) {
        console.log(`  - ${op.type} (${op.id}) for order ${op.localOrderId}`);
      }
    } else {
      console.log("[OfflineSync] No pending operations");
    }
    return;
  }

  syncInProgress = true;
  console.log("[OfflineSync] ====== PROCESSING ======");
  console.log("[OfflineSync] Processing", readyOps.length, "operations (by priority)");

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
      console.log(`[OfflineSync] Executing: ${operation.type} (${operation.id})`);
      console.log(`[OfflineSync]   Order: ${operation.localOrderId || 'N/A'}`);
      console.log(`[OfflineSync]   Item: ${operation.localItemId || 'N/A'}`);

      const success = await executeOperation(operation);

      if (success) {
        console.log(`[OfflineSync] ✓ SUCCESS: ${operation.type} (${operation.id})`);
        await removeOperation(operation.id);
        successCount++;

        // After completing an operation, unblock dependent operations
        await updateBlockedOperations();
      } else {
        operation.retryCount++;
        failCount++;
        handleOperationFailure(operation, null);
      }
    } catch (error) {
      console.error(
        "[OfflineSync] Error executing operation:",
        operation.id,
        error
      );
      operation.retryCount++;
      failCount++;
      handleOperationFailure(operation, error);
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
    // Synchronous read from MMKV
    const stored = getSyncJSON<OfflineOperation[]>(STORAGE_KEY);
    if (stored) {
      pendingOperations = stored;
      // Reset any "processing" status to "pending" (in case app crashed during sync)
      // Also backfill idempotencyKey for operations loaded from storage pre-upgrade
      pendingOperations = pendingOperations.map((op) => ({
        ...op,
        status: op.status === "processing" ? ("pending" as const) : op.status,
        idempotencyKey: op.idempotencyKey || uuidv4(),
      }));
      console.log(
        "[OfflineSync] Loaded",
        pendingOperations.length,
        "operations from storage"
      );
    }

    // Load dead letter queue
    loadDeadLetterFromStorage();
    if (deadLetterQueue.length > 0) {
      console.log(
        "[OfflineSync] Dead letter queue:",
        deadLetterQueue.length,
        "operations"
      );
    }

    // Prune expired operations on load
    await pruneExpiredOperations();
    await enforceQueueSizeLimit();
  } catch (error) {
    console.error("[OfflineSync] Failed to load queue from storage:", error);
    pendingOperations = [];
  }
}

async function saveQueueToStorage(): Promise<void> {
  try {
    // Only persist non-discarded operations
    // Synchronous write to MMKV
    const toSave = pendingOperations.filter((op) => op.status !== "discarded");
    setSyncJSON(STORAGE_KEY, toSave);
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

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 6: Version-based reconciliation
    // ═══════════════════════════════════════════════════════════════════════
    const localVersion = (localOrder as any).sync_version ?? 0;
    const serverVersion = data.sync_version ?? 0;

    // Check for pending local changes
    const hasPendingLocalChanges =
      localOrder.sync_status === "pending" ||
      localOrder.items?.some((item: any) => item.sync_status === "pending");

    // Track version mismatch for reporting
    if (serverVersion > localVersion) {
      console.log(
        "[Reconciliation] Version mismatch - local:",
        localVersion,
        "server:",
        serverVersion
      );

      if (hasPendingLocalChanges) {
        // Check if we can merge (non-overlapping changes)
        const localPendingItems = localOrder.items?.filter(
          (item: any) => item.sync_status === "pending" || !item.db_order_item_id
        ) || [];

        const serverItemIds = new Set(
          (data.items || []).map((item: any) => item.id)
        );

        // Local pending items that don't exist on server can be pushed
        const nonConflictingLocalItems = localPendingItems.filter(
          (item: any) => !item.db_order_item_id || !serverItemIds.has(item.db_order_item_id)
        );

        if (nonConflictingLocalItems.length > 0) {
          console.log(
            "[Reconciliation] Merge possible - pushing",
            nonConflictingLocalItems.length,
            "non-conflicting local items"
          );
          // These will be synced in the next queue processing
        }
      }
    } else if (serverVersion < localVersion && !hasPendingLocalChanges) {
      console.log(
        "[Reconciliation] Local version newer - skipping server merge"
      );
      // Local is newer and synced - no need to pull from server
      result.success = true;
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
        menuItemId: backendItem.menu_item_id || "",
        // For open items, use open_item_name; otherwise use item_name
        name: backendItem.is_open_item ? (backendItem.open_item_name || "Open Item") : (backendItem.item_name || "Unknown Item"),
        quantity: backendItem.quantity || 1,
        // For open items, use open_item_price; otherwise use unit_price
        price: backendItem.is_open_item ? (backendItem.open_item_price || 0) : (backendItem.unit_price || 0),
        unitPrice: backendItem.is_open_item ? (backendItem.open_item_price || 0) : (backendItem.unit_price || 0),
        cashPrice: backendItem.cash_price || backendItem.cash_unit_price || (backendItem.is_open_item ? backendItem.open_item_price : backendItem.unit_price) || 0,
        originalPrice: backendItem.cash_price || (backendItem.is_open_item ? backendItem.open_item_price : backendItem.unit_price) || 0,
        paidQuantity: backendItem.paid_quantity || 0,
        // Open item support
        is_open_item: backendItem.is_open_item || false,
        open_item_name: backendItem.open_item_name || undefined,
        open_item_price: backendItem.open_item_price || undefined,
        kitchen_status: backendItem.kitchen_status,
        item_status: backendItem.item_status,
        courseNumber: backendItem.course_number || 1,
        category_name: backendItem.category_name || "Uncategorized",
        is_voided: backendItem.is_voided || false,
        sync_status: "synced" as const,
        customizations: {
          notes: backendItem.special_instructions || undefined,
          modifiers: [], // Would need more data to populate
        },
        // Financial fields
        subtotal: backendItem.subtotal || ((backendItem.is_open_item ? backendItem.open_item_price : backendItem.unit_price) * backendItem.quantity) || 0,
        cashSubtotal: backendItem.cash_subtotal || (backendItem.cash_price * backendItem.quantity) || 0,
        taxRate: backendItem.tax_rate || 0,
        taxAmount: backendItem.tax_amount || 0,
        cashTaxAmount: backendItem.cash_tax_amount || 0,
        // Discount distribution fields
        discount_amount: backendItem.discount_amount ?? 0,
        discount_cash_amount: backendItem.discount_cash_amount ?? backendItem.discount_amount ?? 0,
      });
    });

    // Update local order with reconciled state
    // Phase 6: Include sync_version in reconciled state
    updateLocalOrder({
      items: reconciledItems,
      total_amount: data.total_amount,
      total_tax: data.tax_amount,
      order_status: data.status,
      sync_version: serverVersion, // Phase 6: Update local version to match server
      amount_paid: data.amount_paid,
      amount_due: data.amount_due,
      cash_amount_due: data.cash_amount_due,
    });

    result.success = true;
    console.log("[Reconciliation] Complete:", result, "- sync_version updated to:", serverVersion);

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
