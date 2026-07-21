/**
 * Merge selector: combines synced history orders with pending (unsynced)
 * orders from useOrderStore for a complete view of today's orders.
 *
 * Dedupes by db_order_id so an order that was created offline and later
 * synced doesn't appear twice when its server-side broadcast arrives.
 *
 * Note: This uses useOrderStore.unsyncedOrderIds as the source for pending
 * orders (the existing offline tracking mechanism). A dedicated
 * usePendingSyncStore can be introduced later if needed.
 */

import { useMemo } from 'react';
import { useOrderStore } from './useOrderStore';
import { usePreviousOrdersStore } from './usePreviousOrdersStore';
import type { OrderProfile, PreviousOrder } from '@/lib/types';

export interface DisplayOrder {
  // Core fields for list rendering
  id: string;
  orderId: string;
  db_order_id?: string;
  display_number: string;
  order_status: string;
  order_type: string;
  total: number;
  customer_name: string;
  timestamp: string;
  paymentStatus: string;
  // Pending sync metadata
  _pending?: boolean;     // true if not yet synced to server
  _source: 'live' | 'history';
  // Full data reference (for tap-through)
  _orderProfile?: OrderProfile;
  _previousOrder?: PreviousOrder;
}

function liveOrderToDisplay(order: OrderProfile): DisplayOrder {
  return {
    id: order.db_order_id || order.id,
    orderId: order.id,
    db_order_id: order.db_order_id,
    display_number: order.display_number || order.order_number || '',
    order_status: order.order_status ?? 'draft',
    order_type: order.order_type ?? 'Dine In',
    total: order.total_amount || 0,
    customer_name: order.customer_name || 'Walk-In',
    timestamp: order.opened_at || new Date().toISOString(),
    paymentStatus: order.paid_status || 'Unpaid',
    _pending: !order.db_order_id,
    _source: 'live',
    _orderProfile: order,
  };
}

function historyOrderToDisplay(order: PreviousOrder): DisplayOrder {
  return {
    id: order.db_order_id || order.orderId,
    orderId: order.orderId,
    db_order_id: order.db_order_id,
    display_number: order.display_number || '',
    order_status: order.voided ? 'void' : order.refunded ? 'refunded' : 'completed',
    order_type: order.type || 'Dine In',
    total: order.total,
    customer_name: order.customer || 'Walk-In',
    timestamp: order.timestamp,
    paymentStatus: order.paymentStatus,
    _pending: false,
    _source: 'history',
    _previousOrder: order,
  };
}

/**
 * Hook that merges pending (unsynced) live orders with synced history
 * orders. Returns a unified DisplayOrder[] for the order list.
 *
 * Pending orders show a sync indicator in the UI. Once synced, they
 * transition to history seamlessly via the broadcast handler.
 */
export function usePreviousOrdersWithPending(): DisplayOrder[] {
  const unsyncedOrderIds = useOrderStore((s) => s.unsyncedOrderIds);
  const ordersById = useOrderStore((s) => s.ordersById);
  const previousOrders = usePreviousOrdersStore((s) => s.previousOrders);

  return useMemo(() => {
    const seen = new Set<string>();
    const merged: DisplayOrder[] = [];

    // Pending (unsynced) orders first — they're always "newest" from the
    // user's POV because they were just created on this device
    for (const localId of unsyncedOrderIds) {
      const order = ordersById[localId];
      if (!order) continue;
      const key = order.db_order_id || order.id;
      if (seen.has(key)) continue;
      seen.add(key);
      // Also mark the local id as seen
      if (order.db_order_id) seen.add(order.id);
      merged.push(liveOrderToDisplay(order));
    }

    // Then synced history orders, skipping any we've already shown
    for (const histOrder of previousOrders) {
      const key = histOrder.db_order_id || histOrder.orderId;
      if (seen.has(key)) continue;
      seen.add(key);
      if (histOrder.db_order_id) seen.add(histOrder.orderId);
      merged.push(historyOrderToDisplay(histOrder));
    }

    // Final sort by timestamp desc
    return merged.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [unsyncedOrderIds, ordersById, previousOrders]);
}
