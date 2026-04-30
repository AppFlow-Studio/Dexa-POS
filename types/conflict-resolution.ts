// types/conflict-resolution.ts
// DEXA POS Phase 6: Atomic Operations & Conflict Resolution Types

// ============================================================================
// CONFLICT TYPES
// ============================================================================

/**
 * Categories of conflicts that can occur between stations
 */
export type ConflictType =
  | 'item_change'      // Item quantity, modifiers, or price changed
  | 'item_added'       // Item was added by another station
  | 'item_removed'     // Item was removed by another station
  | 'payment'          // Payment was processed while order was being modified
  | 'discount'         // Discount was applied/removed
  | 'status_change'    // Order status changed
  | 'customer_info';   // Customer info was updated

/**
 * Resolution strategies for conflicts
 */
export type ConflictResolution =
  | 'keep_local'       // Discard server changes, push local (risky)
  | 'accept_server'    // Accept server changes, discard local (default)
  | 'merge'            // Merge non-conflicting changes (when possible)
  | 'manual';          // Require user intervention

/**
 * Severity levels for conflicts
 */
export type ConflictSeverity =
  | 'silent'           // Audit-only: remote edit on a locally-clean order; ring flashes, no toast
  | 'info'             // Minor change, auto-resolved
  | 'warning'          // Notable change, user notified via toast
  | 'critical';        // Payment-related, requires modal

// ============================================================================
// CONFLICT CHANGE TRACKING
// ============================================================================

/**
 * Represents a single change to an order field or item
 */
export interface ConflictChange {
  field: string;                // e.g., 'quantity', 'total_amount', 'status'
  previousValue: unknown;
  newValue: unknown;
  itemId?: string;              // For item-level changes
  itemName?: string;            // Display name for item changes
}

/**
 * Item-level conflict information
 */
export interface ItemConflict {
  dbOrderItemId: string;
  itemName: string;
  localState: {
    quantity: number;
    subtotal: number;
    modifiers?: unknown;
  } | null;                     // null if item doesn't exist locally
  serverState: {
    quantity: number;
    subtotal: number;
    modifiers?: unknown;
  } | null;                     // null if item doesn't exist on server
  changeType: 'added' | 'removed' | 'modified';
}

// ============================================================================
// CONFLICT INFO
// ============================================================================

/**
 * Complete information about a detected conflict
 */
export interface ConflictInfo {
  id: string;                   // Unique conflict ID (uuid)
  orderId: string;              // db_order_id
  orderNumber?: string;         // For display purposes

  // Version tracking
  localVersion: number;         // sync_version we had
  serverVersion: number;        // sync_version from server

  // Conflict details
  conflictType: ConflictType;
  severity: ConflictSeverity;

  // Change details
  localChanges: ConflictChange[];
  serverChanges: ConflictChange[];
  itemConflicts: ItemConflict[];

  // Source station info
  sourceStationId?: string;
  sourceStationName?: string;

  // Timestamps
  detectedAt: string;           // ISO timestamp
  resolvedAt?: string;          // ISO timestamp when resolved

  // Resolution
  resolution?: ConflictResolution;
  autoResolved: boolean;        // Was this auto-resolved via LWW?
}

// ============================================================================
// PAYMENT LOCK TYPES
// ============================================================================

/**
 * Payment lock state for an order
 */
export interface PaymentLock {
  orderId: string;
  stationId: string;
  stationName?: string;
  lockedAt: string;             // ISO timestamp
  expiresAt: string;            // ISO timestamp
}

/**
 * Result from lock_order_for_payment RPC
 */
export interface LockOrderResult {
  success: boolean;
  error?: 'ORDER_NOT_FOUND' | 'VERSION_MISMATCH' | 'ORDER_LOCKED_FOR_PAYMENT' | 'ORDER_LOCKED_BY_TRANSACTION';
  message?: string;
  lock_expires_at?: string;
  sync_version?: number;
  locked_by_station?: string;
  current_version?: number;
  expected_version?: number;
}

/**
 * Result from unlock_order_for_payment RPC
 */
export interface UnlockOrderResult {
  success: boolean;
  error?: 'NOT_LOCK_OWNER';
  message?: string;
}

/**
 * Result from is_order_locked RPC
 */
export interface IsOrderLockedResult {
  success: boolean;
  error?: 'ORDER_NOT_FOUND';
  is_locked?: boolean;
  locked_by_station?: string;
  lock_expires_at?: string;
  sync_version?: number;
}

// ============================================================================
// VERSION UPDATE TYPES
// ============================================================================

/**
 * Result from update_order_with_version RPC
 */
export interface VersionUpdateResult {
  success: boolean;
  error?: 'ORDER_NOT_FOUND' | 'VERSION_CONFLICT';
  message?: string;
  new_version?: number;
  previous_version?: number;
  current_version?: number;     // Only on conflict
  expected_version?: number;    // Only on conflict
}

// ============================================================================
// CONFLICT DETECTION OPTIONS
// ============================================================================

/**
 * Options for conflict detection
 */
export interface ConflictDetectionOptions {
  ignoreCustomerInfoChanges?: boolean;   // Don't flag customer info changes
  ignoreStatusChanges?: boolean;         // Don't flag status changes
  treatPaymentAsCritical?: boolean;      // Payment conflicts always critical (default: true)
}

// ============================================================================
// CONFLICT STORE STATE
// ============================================================================

/**
 * State shape for useConflictStore
 */
export interface ConflictStoreState {
  // Recent conflicts (auto-expire after 5 minutes)
  recentConflicts: ConflictInfo[];

  // Critical conflicts requiring user action
  paymentConflicts: ConflictInfo[];

  // Active payment locks (tracked locally)
  paymentLocks: Map<string, PaymentLock>;

  // Actions
  recordConflict: (conflict: ConflictInfo) => void;
  addPaymentConflict: (conflict: ConflictInfo) => void;
  resolvePaymentConflict: (orderId: string, resolution: ConflictResolution) => void;
  clearExpiredConflicts: () => void;
  getConflictHistory: (orderId: string) => ConflictInfo[];

  // Payment lock management
  setPaymentLock: (lock: PaymentLock) => void;
  clearPaymentLock: (orderId: string) => void;
  isOrderLockedLocally: (orderId: string) => boolean;
  getPaymentLock: (orderId: string) => PaymentLock | undefined;
}

// ============================================================================
// TOAST NOTIFICATION HELPERS
// ============================================================================

/**
 * Toast notification data for conflicts
 */
export interface ConflictToastData {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;            // ms, default 5000
  orderId?: string;
  conflictId?: string;
}

/**
 * Generate toast data from conflict info
 */
export function generateConflictToast(conflict: ConflictInfo): ConflictToastData {
  const orderLabel = conflict.orderNumber
    ? `Order #${conflict.orderNumber}`
    : `Order`;

  switch (conflict.conflictType) {
    case 'item_added':
      return {
        type: 'info',
        title: 'Items Added',
        message: `${conflict.sourceStationName || 'Another station'} added items to ${orderLabel}`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'item_removed':
      return {
        type: 'warning',
        title: 'Items Removed',
        message: `${conflict.sourceStationName || 'Another station'} removed items from ${orderLabel}`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'item_change':
      return {
        type: 'info',
        title: 'Order Updated',
        message: `${orderLabel} was modified by ${conflict.sourceStationName || 'another station'}`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'payment':
      return {
        type: 'error',
        title: 'Payment Conflict',
        message: `Payment was processed on ${orderLabel} by ${conflict.sourceStationName || 'another station'}`,
        duration: 10000,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'discount':
      return {
        type: 'warning',
        title: 'Discount Changed',
        message: `Discount on ${orderLabel} was modified by ${conflict.sourceStationName || 'another station'}`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'status_change':
      return {
        type: 'info',
        title: 'Status Changed',
        message: `${orderLabel} status was updated by ${conflict.sourceStationName || 'another station'}`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    case 'customer_info':
      return {
        type: 'info',
        title: 'Customer Info Updated',
        message: `Customer info on ${orderLabel} was updated`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };

    default:
      return {
        type: 'info',
        title: 'Order Synced',
        message: `${orderLabel} was updated`,
        orderId: conflict.orderId,
        conflictId: conflict.id,
      };
  }
}

// ============================================================================
// SESSION CONFLICT TYPES
// ============================================================================

/**
 * Categories of session-level conflicts
 */
export type SessionConflictType =
  | 'duplicate_session'        // Two different sessions for same table
  | 'lifecycle_divergence'     // Local completed, remote has new session
  | 'concurrent_modification'; // Same session, different states

/**
 * Complete information about a detected session conflict
 */
export interface SessionConflict {
  id: string;
  tableId: string;
  tableName?: string;
  conflictType: SessionConflictType;
  localSession: {
    id: string;
    status: string;
    orderId?: string;
    hasItems: boolean;
    hasPayments: boolean;
  };
  remoteSession: {
    id: string;
    status: string;
    orderId?: string;
  };
  severity: 'critical' | 'warning' | 'info';
  resolution: 'accept_remote' | 'create_separate' | 'prompt_user';
  detectedAt: string;
  autoResolved: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Determine if a conflict requires immediate user attention
 */
export function isConflictCritical(conflict: ConflictInfo): boolean {
  return conflict.severity === 'critical' || conflict.conflictType === 'payment';
}

/**
 * Generate a unique conflict ID
 */
export function generateConflictId(): string {
  return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a conflict has expired (> 5 minutes old)
 */
export function isConflictExpired(conflict: ConflictInfo, maxAgeMs: number = 5 * 60 * 1000): boolean {
  const detectedAt = new Date(conflict.detectedAt).getTime();
  return Date.now() - detectedAt > maxAgeMs;
}

/**
 * Check if a payment lock has expired
 */
export function isPaymentLockExpired(lock: PaymentLock): boolean {
  return new Date(lock.expiresAt).getTime() < Date.now();
}
