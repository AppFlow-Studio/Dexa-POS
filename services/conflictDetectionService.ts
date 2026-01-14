// services/conflictDetectionService.ts
// DEXA POS Phase 6: Conflict Detection Service
// Detects and categorizes conflicts between local and server order states

import { OrderProfile, CartItem } from '@/lib/types';
import {
  ConflictInfo,
  ConflictType,
  ConflictSeverity,
  ConflictChange,
  ItemConflict,
  ConflictDetectionOptions,
  generateConflictId,
} from '@/types/conflict-resolution';

// ============================================================================
// MAIN CONFLICT DETECTION
// ============================================================================

/**
 * Detects if there's a conflict between local order state and incoming server state.
 * Returns null if no conflict, or ConflictInfo if conflict detected.
 */
export function detectConflict(
  localOrder: OrderProfile,
  serverOrder: Partial<OrderProfile> & { sync_version?: number },
  options: ConflictDetectionOptions = {}
): ConflictInfo | null {
  const localVersion = getOrderVersion(localOrder);
  const serverVersion = serverOrder.sync_version ?? 0;
 console.log("localVersion [detectConflict] localVersion", localVersion);
 console.log("serverVersion [detectConflict] serverVersion", serverVersion);
  // No conflict if versions match or server is older
  if (serverVersion <= localVersion) {
    return null;
  }

  // Detect what changed
  const localChanges = detectLocalChanges(localOrder);
  const serverChanges = detectServerChanges(localOrder, serverOrder);
  const itemConflicts = detectItemConflicts(localOrder.items, serverOrder.items || []);

  // If no meaningful changes, no conflict
  if (
    localChanges.length === 0 &&
    serverChanges.length === 0 &&
    itemConflicts.length === 0
  ) {
    return null;
  }

  // Categorize the conflict
  const conflictType = categorizeConflict(serverChanges, itemConflicts, options);
  const severity = determineSeverity(conflictType, options);

  // Build conflict info
  const conflict: ConflictInfo = {
    id: generateConflictId(),
    orderId: localOrder.db_order_id || localOrder.id,
    orderNumber: localOrder.order_number || localOrder.display_number,
    localVersion,
    serverVersion,
    conflictType,
    severity,
    localChanges,
    serverChanges,
    itemConflicts,
    sourceStationId: serverOrder.station_id || undefined,
    sourceStationName: serverOrder._sourceStationName || undefined,
    detectedAt: new Date().toISOString(),
    autoResolved: severity !== 'critical',
  };

  return conflict;
}

// ============================================================================
// VERSION HELPERS
// ============================================================================

/**
 * Get the sync_version from an order, with fallback
 */
export function getOrderVersion(order: OrderProfile & { sync_version?: number }): number {
  return (order as any).sync_version ?? 0;
}

/**
 * Check if local order has pending changes that haven't been synced
 */
export function hasLocalPendingChanges(order: OrderProfile): boolean {
  // Check if any items have pending sync status
  if (order.items?.some(item => (item as any).sync_status === 'pending')) {
    return true;
  }

  // Check order-level sync status
  if (order.sync_status === 'pending') {
    return true;
  }

  // Check for unsent items (new items not yet synced)
  if (order.items?.some(item => !item.db_order_item_id)) {
    return true;
  }

  return false;
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Detect pending local changes (not yet synced to server)
 */
function detectLocalChanges(localOrder: OrderProfile): ConflictChange[] {
  const changes: ConflictChange[] = [];

  // Detect unsaved items
  localOrder.items?.forEach(item => {
    if (!item.db_order_item_id) {
      changes.push({
        field: 'item_added',
        previousValue: null,
        newValue: { name: item.name, quantity: item.quantity },
        itemId: item.id,
        itemName: item.name,
      });
    }
  });

  return changes;
}

/**
 * Detect changes between local and server order state
 */
function detectServerChanges(
  localOrder: OrderProfile,
  serverOrder: Partial<OrderProfile>
): ConflictChange[] {
  const changes: ConflictChange[] = [];

  // Check total amount changes
  if (
    serverOrder.total_amount !== undefined &&
    localOrder.total_amount !== serverOrder.total_amount
  ) {
    changes.push({
      field: 'total_amount',
      previousValue: localOrder.total_amount,
      newValue: serverOrder.total_amount,
    });
  }

  // Check paid amount changes (indicates payment processed)
  if (
    serverOrder.amount_paid !== undefined &&
    localOrder.amount_paid !== serverOrder.amount_paid
  ) {
    changes.push({
      field: 'amount_paid',
      previousValue: localOrder.amount_paid,
      newValue: serverOrder.amount_paid,
    });
  }

  // Check status changes
  if (
    serverOrder.order_status !== undefined &&
    localOrder.order_status !== serverOrder.order_status
  ) {
    changes.push({
      field: 'order_status',
      previousValue: localOrder.order_status,
      newValue: serverOrder.order_status,
    });
  }

  // Check paid status changes
  if (
    serverOrder.paid_status !== undefined &&
    localOrder.paid_status !== serverOrder.paid_status
  ) {
    changes.push({
      field: 'paid_status',
      previousValue: localOrder.paid_status,
      newValue: serverOrder.paid_status,
    });
  }

  // Check discount changes
  if (
    serverOrder.total_discount !== undefined &&
    localOrder.total_discount !== serverOrder.total_discount
  ) {
    changes.push({
      field: 'total_discount',
      previousValue: localOrder.total_discount,
      newValue: serverOrder.total_discount,
    });
  }

  // Check customer info changes
  if (
    serverOrder.customer_name !== undefined &&
    localOrder.customer_name !== serverOrder.customer_name
  ) {
    changes.push({
      field: 'customer_name',
      previousValue: localOrder.customer_name,
      newValue: serverOrder.customer_name,
    });
  }

  return changes;
}

/**
 * Detect item-level conflicts between local and server item arrays
 */
function detectItemConflicts(
  localItems: CartItem[],
  serverItems: CartItem[]
): ItemConflict[] {
  const conflicts: ItemConflict[] = [];

  // Build maps for quick lookup
  const localByDbId = new Map<string, CartItem>();
  const serverByDbId = new Map<string, CartItem>();

  localItems?.forEach(item => {
    if (item.db_order_item_id) {
      localByDbId.set(item.db_order_item_id, item);
    }
  });

  serverItems?.forEach(item => {
    if (item.db_order_item_id) {
      serverByDbId.set(item.db_order_item_id, item);
    }
  });

  // Find items added on server (not in local)
  serverByDbId.forEach((serverItem, dbId) => {
    if (!localByDbId.has(dbId)) {
      conflicts.push({
        dbOrderItemId: dbId,
        itemName: serverItem.name,
        localState: null,
        serverState: {
          quantity: serverItem.quantity,
          subtotal: serverItem.price * serverItem.quantity,
          modifiers: serverItem.customizations?.modifiers,
        },
        changeType: 'added',
      });
    }
  });

  // Find items removed from server (in local but not server)
  localByDbId.forEach((localItem, dbId) => {
    if (!serverByDbId.has(dbId)) {
      // Item was removed on server (or voided)
      conflicts.push({
        dbOrderItemId: dbId,
        itemName: localItem.name,
        localState: {
          quantity: localItem.quantity,
          subtotal: localItem.price * localItem.quantity,
          modifiers: localItem.customizations?.modifiers,
        },
        serverState: null,
        changeType: 'removed',
      });
    }
  });

  // Find modified items
  localByDbId.forEach((localItem, dbId) => {
    const serverItem = serverByDbId.get(dbId);
    if (serverItem) {
      const hasQuantityChange = localItem.quantity !== serverItem.quantity;
      const hasPriceChange = localItem.price !== serverItem.price;
      const hasModifierChange = !areModifiersEqual(
        localItem.customizations?.modifiers,
        serverItem.customizations?.modifiers
      );

      if (hasQuantityChange || hasPriceChange || hasModifierChange) {
        conflicts.push({
          dbOrderItemId: dbId,
          itemName: localItem.name,
          localState: {
            quantity: localItem.quantity,
            subtotal: localItem.price * localItem.quantity,
            modifiers: localItem.customizations?.modifiers,
          },
          serverState: {
            quantity: serverItem.quantity,
            subtotal: serverItem.price * serverItem.quantity,
            modifiers: serverItem.customizations?.modifiers,
          },
          changeType: 'modified',
        });
      }
    }
  });

  return conflicts;
}

/**
 * Compare modifier arrays for equality
 */
function areModifiersEqual(
  local: CartItem['customizations']['modifiers'],
  server: CartItem['customizations']['modifiers']
): boolean {
  if (!local && !server) return true;
  if (!local || !server) return false;
  if (local.length !== server.length) return false;

  // Simple JSON comparison for now
  return JSON.stringify(local) === JSON.stringify(server);
}

// ============================================================================
// CONFLICT CATEGORIZATION
// ============================================================================

/**
 * Determine the type of conflict based on changes detected
 */
function categorizeConflict(
  serverChanges: ConflictChange[],
  itemConflicts: ItemConflict[],
  options: ConflictDetectionOptions
): ConflictType {
  // Check for payment-related changes first (highest priority)
  const paymentFields = ['amount_paid', 'paid_status', 'balance_due'];
  if (serverChanges.some(c => paymentFields.includes(c.field))) {
    return 'payment';
  }

  // Check for discount changes
  if (serverChanges.some(c => c.field === 'total_discount' || c.field === 'discount_amount')) {
    return 'discount';
  }

  // Check for status changes
  if (serverChanges.some(c => c.field === 'order_status')) {
    if (options.ignoreStatusChanges) {
      // Fall through to check other changes
    } else {
      return 'status_change';
    }
  }

  // Check for customer info changes
  if (serverChanges.some(c => ['customer_name', 'customer_phone'].includes(c.field))) {
    if (options.ignoreCustomerInfoChanges) {
      // Fall through
    } else {
      return 'customer_info';
    }
  }

  // Item-level conflicts
  if (itemConflicts.length > 0) {
    const hasAdded = itemConflicts.some(c => c.changeType === 'added');
    const hasRemoved = itemConflicts.some(c => c.changeType === 'removed');
    const hasModified = itemConflicts.some(c => c.changeType === 'modified');

    if (hasRemoved) return 'item_removed';
    if (hasAdded && !hasModified) return 'item_added';
    return 'item_change';
  }

  // Default to generic item change
  return 'item_change';
}

/**
 * Determine severity based on conflict type
 */
function determineSeverity(
  conflictType: ConflictType,
  options: ConflictDetectionOptions
): ConflictSeverity {
  switch (conflictType) {
    case 'payment':
      return options.treatPaymentAsCritical !== false ? 'critical' : 'warning';

    case 'item_removed':
    case 'discount':
      return 'warning';

    case 'item_added':
    case 'item_change':
    case 'status_change':
    case 'customer_info':
      return 'info';

    default:
      return 'info';
  }
}

// ============================================================================
// MERGE HELPERS
// ============================================================================

/**
 * Check if two order states can be safely merged (non-overlapping changes)
 */
export function canMergeChanges(
  localOrder: OrderProfile,
  serverOrder: Partial<OrderProfile>
): boolean {
  const itemConflicts = detectItemConflicts(localOrder.items, serverOrder.items || []);

  // Can merge if no items conflict (only additions from both sides)
  const hasOverlappingChanges = itemConflicts.some(c => c.changeType === 'modified');

  return !hasOverlappingChanges;
}

/**
 * Merge non-conflicting changes from server into local order
 * Returns merged order or null if merge not possible
 */
export function mergeOrders(
  localOrder: OrderProfile,
  serverOrder: Partial<OrderProfile>
): OrderProfile | null {
  if (!canMergeChanges(localOrder, serverOrder)) {
    return null;
  }

  // Start with server state as base
  const merged = { ...localOrder };

  // Apply server totals
  if (serverOrder.total_amount !== undefined) {
    merged.total_amount = serverOrder.total_amount;
  }
  if (serverOrder.amount_paid !== undefined) {
    merged.amount_paid = serverOrder.amount_paid;
  }
  if (serverOrder.amount_due !== undefined) {
    merged.amount_due = serverOrder.amount_due;
  }
  if (serverOrder.total_discount !== undefined) {
    merged.total_discount = serverOrder.total_discount;
  }

  // Merge items: Keep local additions, add server additions
  const mergedItems: CartItem[] = [];
  const serverItemsByDbId = new Map<string, CartItem>();

  (serverOrder.items || []).forEach(item => {
    if (item.db_order_item_id) {
      serverItemsByDbId.set(item.db_order_item_id, item);
    }
  });

  // Add all local items, updating from server where synced
  localOrder.items?.forEach(item => {
    if (item.db_order_item_id && serverItemsByDbId.has(item.db_order_item_id)) {
      // Server version wins for synced items
      mergedItems.push(serverItemsByDbId.get(item.db_order_item_id)!);
      serverItemsByDbId.delete(item.db_order_item_id);
    } else {
      // Keep local item (new or unsynced)
      mergedItems.push(item);
    }
  });

  // Add remaining server items (new items from server)
  serverItemsByDbId.forEach(item => {
    mergedItems.push(item);
  });

  merged.items = mergedItems;

  // Update sync_version to server's
  (merged as any).sync_version = (serverOrder as any).sync_version;

  return merged;
}

// ============================================================================
// QUICK CHECKS
// ============================================================================

/**
 * Quick check if incoming server data represents a newer version
 */
export function isNewerVersion(
  localOrder: OrderProfile,
  serverVersion: number
): boolean {
  const localVersion = getOrderVersion(localOrder);
  return serverVersion > localVersion;
}

/**
 * Quick check if a payment was processed since last sync
 */
export function wasPaymentProcessed(
  localOrder: OrderProfile,
  serverOrder: Partial<OrderProfile>
): boolean {
  const localPaid = localOrder.amount_paid ?? 0;
  const serverPaid = serverOrder.amount_paid ?? 0;
  return serverPaid > localPaid;
}

/**
 * Check if order is currently locked for payment
 */
export function isLockedForPayment(
  order: OrderProfile & { payment_lock_station_id?: string; payment_lock_expires_at?: string },
  currentStationId?: string
): boolean {
  if (!order.payment_lock_station_id || !order.payment_lock_expires_at) {
    return false;
  }

  // Check if lock has expired
  if (new Date(order.payment_lock_expires_at) < new Date()) {
    return false;
  }

  // Lock exists and not expired - check if it's our lock
  if (currentStationId && order.payment_lock_station_id === currentStationId) {
    return false; // Our own lock doesn't block us
  }

  return true;
}
