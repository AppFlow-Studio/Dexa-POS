// hooks/useOrdersRealtime.ts
// Real-time updates for order management

import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { useRealtimeChannel } from './useRealtimechannel';
import type {
  OrderPayload,
  PaymentPayload,
  RealtimeEventType,
  UseOrdersRealtimeOptions,
} from '@/types/real-time';

// Modifier data in broadcast payload (Phase 2.5: Order Item Sync with Modifiers)
export interface BroadcastModifierData {
  modifier_group_id: string | null;
  modifier_item_id: string | null;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity: number;
}

// Order items in broadcast payload (Phase 2: Remote Order Management)
export interface BroadcastOrderItemData {
  id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  cash_price: number;
  subtotal: number;
  cash_subtotal: number;
  tax_amount: number;
  cash_tax_amount: number;
  discount_amount: number;
  item_status: string;
  kitchen_status: string | null;
  paid_quantity: number;
  course_number: number | null;
  is_voided: boolean;
  is_open_item: boolean;
  open_item_name: string | null;
  open_item_price: number | null;
  special_instructions: string | null;
  category_name: string | null;

  // Modifiers (Phase 2.5: Order Item Sync with Modifiers)
  modifiers?: BroadcastModifierData[];
}

export interface BroadcastOrderData {
  // Identifiers
  id: string;
  order_number: string;
  display_number: string;
  external_id: string | null;

  // Relationships
  merchant_id: string;
  location_id: string;
  customer_id: string | null;
  created_by_staff_id: string | null;
  created_by_user_id: string | null;
  assigned_server_id: string | null;

  // Station tracking (Phase 2: Remote Order Management)
  station_id: string | null;
  station_name: string | null;  
  // Order info
  order_type: 'dine_in' | 'takeout' | 'delivery';
  status: 'draft' | 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded' | 'void';
  table_number: string | null;
  seat_number: string | null;
  
  // Legacy/Generic totals (backward compatibility)
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  
  // Card pricing (default - what credit card customers pay)
  card_subtotal: number;
  card_tax_amount: number;
  card_total: number;
  
  // Cash pricing (4% discount)
  cash_subtotal: number;
  cash_tax_amount: number;
  cash_total: number;
  cash_discount_applied: boolean;
  cash_discount_amount: number;
  
  // Effective pricing (what's actually being charged based on payment method)
  effective_subtotal: number;
  effective_tax_amount: number;
  effective_total: number;
  payment_pricing_mode: 'card' | 'cash' | null;
  
  // Payment status
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded' | 'unpaid';
  amount_paid: number;
  amount_due: number;          // Card price remaining
  cash_amount_due: number;     // Cash price remaining
  check_status: 'Opened' | 'Closed' | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  sent_to_kitchen_at: string | null;
  started_preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  voided_at: string | null;
  
  // Void info
  voided_by: string | null;
  void_reason: string | null;
  cancellation_reason: string | null;
  
  // Sync info
  sync_version: number;
  is_offline: boolean;

  // Order items (Phase 2: Remote Order Management)
  order_items?: BroadcastOrderItemData[];
}

export interface OrderBroadcastPayload {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: string;
  data: {
    order: BroadcastOrderData;
  };
}

// Query keys for cache invalidation
export const ordersQueryKeys = {
  list: (locationId: string) => ['orders', locationId] as const,
  detail: (orderId: string) => ['order', orderId] as const,
  stats: (locationId: string) => ['order-stats', locationId] as const,
  payments: (orderId: string) => ['order-payments', orderId] as const,
  openOrders: (locationId: string) => ['open-orders', locationId] as const,
  kitchenQueue: (locationId: string) => ['kitchen-queue', locationId] as const,
} as const;

/**
 * Hook for real-time order updates
 *
 * Subscribes to: `location:{locationId}:orders`
 *
 * Events handled:
 * - ORDER_INSERT: New order created
 * - ORDER_UPDATE: Order status/amount changed
 * - ORDER_DELETE: Order deleted/voided
 * - PAYMENT_INSERT: Payment added
 * - PAYMENT_UPDATE: Payment status changed
 */
export function useOrdersRealtime({
  locationId,
  enabled = true,
  onOrderChange,
  onPaymentChange,
}: UseOrdersRealtimeOptions) {
  const queryClient = useQueryClient();

  const events: RealtimeEventType[] = useMemo(
    () => [
      'ORDER_INSERT',
      'ORDER_UPDATE',
      'ORDER_DELETE',
      'PAYMENT_INSERT',
      'PAYMENT_UPDATE',
    ],
    []
  );

  // ====================================================================
  // DEBOUNCED INVALIDATION FUNCTIONS (Phase 1.2: Reduce cache thrashing)
  // ====================================================================

  // Debounced 300ms: Lists and aggregates (batch multiple updates)
  const debouncedInvalidateList = useMemo(
    () =>
      debounce((locationId: string) => {
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.list(locationId) });
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.openOrders(locationId) });
      }, 300),
    [queryClient]
  );

  // Debounced 300ms: Kitchen queue
  const debouncedInvalidateKitchen = useMemo(
    () =>
      debounce((locationId: string) => {
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.kitchenQueue(locationId) });
      }, 300),
    [queryClient]
  );

  // Debounced 500ms: Stats (less time-sensitive)
  const debouncedInvalidateStats = useMemo(
    () =>
      debounce((locationId: string) => {
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.stats(locationId) });
      }, 500),
    [queryClient]
  );

  // IMMEDIATE: Single order detail (critical for UI responsiveness)
  const invalidateOrderDetail = useCallback(
    (orderId: string) => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.payments(orderId) });
    },
    [queryClient]
  );

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedInvalidateList.cancel();
      debouncedInvalidateKitchen.cancel();
      debouncedInvalidateStats.cancel();
    };
  }, [debouncedInvalidateList, debouncedInvalidateKitchen, debouncedInvalidateStats]);

  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      console.log(`[OrdersRealtime] Event: ${event}`, payload);

      // Handle order events
      if (event.startsWith('ORDER_')) {
        const orderPayload = payload as OrderPayload;

        // IMMEDIATE: Specific order (< 50ms perceived latency)
        if (orderPayload.order?.id) {
          invalidateOrderDetail(orderPayload.order.id);
        }

        // DEBOUNCED: Lists and aggregates (300ms batch window)
        debouncedInvalidateList(locationId);

        // CONDITIONAL + DEBOUNCED: Kitchen queue
        if (
          orderPayload.order?.status === 'sent' ||
          orderPayload.order?.status === 'preparing' ||
          orderPayload.order?.status === 'ready'
        ) {
          debouncedInvalidateKitchen(locationId);
        }

        // CONDITIONAL + DEBOUNCED: Stats
        if (
          orderPayload.order?.status === 'completed' ||
          orderPayload.previous_status === 'completed'
        ) {
          debouncedInvalidateStats(locationId);
        }

        onOrderChange?.(orderPayload);
      }

      // Handle payment events
      if (event.startsWith('PAYMENT_')) {
        const paymentPayload = payload as PaymentPayload;

        // IMMEDIATE: Order detail + payments
        if (paymentPayload.order?.id) {
          invalidateOrderDetail(paymentPayload.order.id);
        }

        // DEBOUNCED: Orders list
        debouncedInvalidateList(locationId);

        // CONDITIONAL + DEBOUNCED: Stats
        if (paymentPayload.payment?.status === 'completed') {
          debouncedInvalidateStats(locationId);
        }

        onPaymentChange?.(paymentPayload);
      }
    },
    [
      locationId,
      invalidateOrderDetail,
      debouncedInvalidateList,
      debouncedInvalidateKitchen,
      debouncedInvalidateStats,
      onOrderChange,
      onPaymentChange,
    ]
  );

  const { status, reconnect, disconnect } = useRealtimeChannel<unknown>({
    topic: `location:${locationId}:orders`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId,
  });

  return {
    connectionStatus: status,
    reconnect,
    disconnect,
    isConnected: status.state === 'SUBSCRIBED',
    isReconnecting: status.reconnectAttempts > 0 && status.state !== 'SUBSCRIBED',
  };
}

/**
 * Hook for kitchen display system real-time updates
 * Focused on order status transitions for kitchen workflow
 */
export function useKitchenRealtime({
  locationId,
  enabled = true,
  onOrderStatusChange,
}: {
  locationId: string;
  enabled?: boolean;
  onOrderStatusChange?: (payload: OrderPayload) => void;
}) {
  const queryClient = useQueryClient();

  const events: RealtimeEventType[] = useMemo(
    () => ['ORDER_INSERT', 'ORDER_UPDATE'],
    []
  );

  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      const orderPayload = payload as OrderPayload;

      // Only care about orders in kitchen-relevant statuses
      const kitchenStatuses = ['sent', 'preparing', 'ready'];
      if (
        !kitchenStatuses.includes(orderPayload.order?.status) &&
        !kitchenStatuses.includes(orderPayload.previous_status || '')
      ) {
        return;
      }

      console.log(`[KitchenRealtime] Event: ${event}`, orderPayload);

      // Invalidate kitchen queue
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.kitchenQueue(locationId),
      });

      onOrderStatusChange?.(orderPayload);
    },
    [locationId, queryClient, onOrderStatusChange]
  );

  // Subscribe to location kitchen channel
  const { status, reconnect } = useRealtimeChannel<unknown>({
    topic: `location:${locationId}:kitchen`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId,
  });

  return {
    connectionStatus: status,
    reconnect,
    isConnected: status.state === 'SUBSCRIBED',
  };
}