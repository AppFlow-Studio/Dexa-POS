// hooks/useOrdersRealtime.ts
// Real-time updates for order management

import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import type {
  OrderPayload,
  RealtimeEventType,
  UseOrdersRealtimeOptions
} from '@/types/real-time'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useRealtimeChannel } from './useRealtimechannel'

// Modifier data in broadcast payload (Phase 2.5: Order Item Sync with Modifiers)
export interface BroadcastModifierData {
  modifier_group_id: string | null
  modifier_item_id: string | null
  modifier_group_name: string
  modifier_name: string
  price_modifier: number
  quantity: number
  is_no?: boolean
}

// Order items in broadcast payload (Phase 2: Remote Order Management)
export interface BroadcastOrderItemData {
  id: string
  menu_item_id: string | null
  item_name: string
  quantity: number
  unit_price: number
  cash_price: number
  subtotal: number
  cash_subtotal: number
  tax_amount: number
  cash_tax_amount: number
  discount_amount: number
  item_status: string
  kitchen_status: string | null
  paid_quantity: number
  refunded_quantity?: number
  refunded_amount?: number
  course_number: number | null
  seat_number?: number | null
  is_voided: boolean
  is_open_item: boolean
  open_item_name: string | null
  open_item_price: number | null
  special_instructions: string | null
  category_name: string | null
  category_id?: string | null
  base_card_price: number
  base_cash_price: number
  prep_station?: string | null
  rush?: boolean
  is_prioritized?: boolean
  fire_time?: string | null
  // Modifiers (Phase 2.5: Order Item Sync with Modifiers)
  modifiers?: BroadcastModifierData[]
}

// Order payments in broadcast payload
export interface BroadcastOrderPaymentData {
  // Core identifiers
  id: string
  order_id: string

  // Payment basics (normalized with non-null defaults)
  payment_method: 'cash' | 'card'
  amount: number
  tip_amount: number
  total_amount: number
  status:
    | 'pending'
    | 'authorized'
    | 'captured'
    | 'failed'
    | 'voided'
    | 'refunded'

  // Portions
  subtotal_portion: number
  tax_portion: number
  discount_portion?: number

  // Void timestamp
  voided_at?: string | null

  // Cash fields
  amount_tendered: number | null
  change_given: number
  is_cash_priced: boolean
  original_amount: number | null

  // Split tracking
  split_portion_index: number | null
  split_count: number | null

  // Item coverage (just UUIDs - quantities derived from order_items.paid_quantity)
  covers_items: string[]

  // Card/Terminal (simplified)
  card_type: string | null
  card_last_four: string | null
  transaction_id: string | null
  terminal_type: string | null
  reference_id: string | null

  // Card transaction detail fields
  authorization_code: string | null
  auth_code: string | null
  rrn: string | null
  batch_number: string | null
  dejavoo_batch_number: string | null
  dejavoo_invoice_number: string | null
  entry_mode: string | null
  result_code: string | null

  // Void tracking
  is_voided: boolean
  void_reason: string | null
  refunded_amount?: number
  refunded_at?: string | null

  // Return/refund tracking fields
  is_returned?: boolean
  returned_at?: string | null
  returned_by?: string | null
  return_amount?: number
  return_rrn?: string | null
  return_auth_code?: string | null
  return_reference_id?: string | null
  return_number?: string | null
  return_reason?: string | null

  // Timestamps
  authorized_at?: string | null
  captured_at: string | null
  created_at: string

  // Settlement tracking
  is_settled?: boolean
  settled_at?: string | null

  // Terminal response JSONB (for pre-auth field extraction)
  terminal_response?: Record<string, unknown> | null
}

export interface BroadcastOrderData {
  // Identifiers
  id: string
  order_number: string
  display_number: string
  external_id: string | null

  // Relationships
  merchant_id: string
  location_id: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  delivery_address: string | null
  created_by_staff_id: string | null
  created_by_user_id: string | null
  assigned_server_id: string | null
  session_id: string | null // Bidirectional link to table sessions
  server_name?: string | null // Staff name who created the order

  // Station tracking (Phase 2: Remote Order Management)
  station_id: string | null
  station_name: string | null
  // Order info
  order_source?: string | null
  delivery_platform?: string | null
  split_payment_path?: string | null
  order_type: 'dine_in' | 'takeout' | 'delivery'
  status:
    | 'draft'
    | 'pending'
    | 'sent_to_kitchen'
    | 'preparing'
    | 'ready'
    | 'completed'
    | 'cancelled'
    | 'refunded'
    | 'void'
  table_number: string | null
  seat_number: string | null
  special_instructions?: string | null

  // Legacy/Generic totals (backward compatibility)
  subtotal: number
  tax_amount: number
  tip_amount: number
  discount_amount: number
  service_charge: number
  total_amount: number

  // Card pricing (default - what credit card customers pay)
  card_subtotal: number
  card_tax_amount: number
  card_total: number

  // Cash pricing (4% discount)
  cash_subtotal: number
  cash_tax_amount: number
  cash_total: number
  cash_discount_applied: boolean
  cash_discount_amount: number

  // Effective pricing (what's actually being charged based on payment method)
  effective_subtotal: number
  effective_tax_amount: number
  effective_total: number
  payment_pricing_mode: 'card' | 'cash' | null

  // Payment status
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded' | 'unpaid'
  amount_paid: number
  amount_due: number // Card price remaining
  cash_amount_due: number // Cash price remaining
  check_status: 'Opened' | 'Closed' | null

  // Timestamps
  created_at: string
  updated_at: string
  sent_to_kitchen_at: string | null
  started_preparing_at: string | null
  ready_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  voided_at: string | null

  // Void info
  voided_by: string | null
  void_reason: string | null
  cancellation_reason: string | null

  // Sync info
  sync_version: number
  is_offline: boolean

  // Broadcast version: 1 = legacy full payload, 2 = header-only (no items/reversals/refund_items)
  _broadcast_version?: number
  // Computed non-voided item count (present in v2 broadcasts)
  item_count?: number

  // Order items (Phase 2: Remote Order Management)
  order_items?: BroadcastOrderItemData[]

  // Order payments
  order_payments?: BroadcastOrderPaymentData[]
  reversals?: Array<Record<string, unknown>>
  order_refund_items?: Array<Record<string, unknown>>

  // Order discounts (from initial query joins — not present in realtime broadcasts)
  order_discounts?: Array<Record<string, unknown>>

  // Per-payment item coverage (from order_payment_items junction table)
  payment_items?: Array<{
    id: string
    order_payment_id: string
    order_item_id: string
    quantity_paid: number
    unit_price_paid: number
    subtotal_paid: number
    tax_paid: number | null
  }>
}

export interface OrderBroadcastPayload {
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  timestamp: string
  data: {
    order: BroadcastOrderData
  }
}

// Query keys for cache invalidation
export const ordersQueryKeys = {
  list: (locationId: string) => ['orders', locationId] as const,
  detail: (orderId: string) => ['order', orderId] as const,
  stats: (locationId: string) => ['order-stats', locationId] as const,
  payments: (orderId: string) => ['order-payments', orderId] as const,
  openOrders: (locationId: string) => ['open-orders', locationId] as const,
  kitchenQueue: (locationId: string) => ['kitchen-queue', locationId] as const
} as const

/**
 * Hook for real-time order updates
 *
 * Subscribes to: `location:{locationId}:orders`
 *
 * Events handled:
 * - ORDER_INSERT: New order createFd
 * - ORDER_UPDATE: Order status/amount changed
 * - ORDER_DELETE: Order deleted/voided
 * - PAYMENT_INSERT: Payment added
 * - PAYMENT_UPDATE: Payment status changed
 */
export function useOrdersRealtime ({
  locationId,
  enabled = true,
  maxReconnectAttempts,
  onOrderChange,
  onPaymentChange
}: UseOrdersRealtimeOptions) {
  const supabase = useSupabaseClient()

  const events: RealtimeEventType[] = useMemo(
    () => ['INSERT', 'UPDATE', 'DELETE'],
    []
  )

  // Broadcasts update Zustand stores directly via onOrderChange callback.
  // TanStack Query is only used for cold-start bootstrap + reconnection recovery
  // (handled by useOrderSyncRecovery), not per-broadcast invalidation.
  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      if (__DEV__)
        console.log(`[OrdersRealtime] Received ${event} event:`, {
          event,
          orderId: (payload as any)?.data?.order?.id,
          operation: (payload as any)?.operation
        })

      if (event === 'INSERT' || event === 'UPDATE' || event === 'DELETE') {
        const broadcastPayload = payload as OrderBroadcastPayload

        if (onOrderChange) {
          try {
            onOrderChange(broadcastPayload as unknown as OrderPayload)
          } catch (error) {
            console.error('[OrdersRealtime] Callback execution error:', error)
          }
        } else if (__DEV__) {
          console.warn('[OrdersRealtime] No onOrderChange callback registered!')
        }
      }
    },
    [onOrderChange]
  )

  const { status, reconnect, disconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase, // Pass supabase client as prop
    topic: `location:${locationId}:orders`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId && !!supabase, // Add supabase check
    ...(maxReconnectAttempts != null && { maxReconnectAttempts })
  })

  return {
    connectionStatus: status,
    reconnect,
    disconnect,
    isConnected: status.state === 'SUBSCRIBED',
    isReconnecting:
      status.reconnectAttempts > 0 && status.state !== 'SUBSCRIBED'
  }
}

/**
 * Hook for kitchen display system real-time updates
 * Focused on order status transitions for kitchen workflow
 */
export function useKitchenRealtime ({
  locationId,
  enabled = true,
  onOrderStatusChange
}: {
  locationId: string
  enabled?: boolean
  onOrderStatusChange?: (payload: OrderPayload) => void
}) {
  const queryClient = useQueryClient()
  const supabase = useSupabaseClient() // Call at component level

  const events: RealtimeEventType[] = useMemo(
    () => ['ORDER_INSERT', 'ORDER_UPDATE'],
    []
  )

  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      const orderPayload = payload as OrderPayload

      // Only care about orders in kitchen-relevant statuses
      const kitchenStatuses = ['pending', 'preparing', 'ready']
      if (
        !kitchenStatuses.includes(orderPayload.order?.status) &&
        !kitchenStatuses.includes(orderPayload.previous_status || '')
      ) {
        return
      }

      if (__DEV__)
        console.log(`[KitchenRealtime] Event: ${event}`, orderPayload)

      // Invalidate kitchen queue
      queryClient.invalidateQueries({
        queryKey: ordersQueryKeys.kitchenQueue(locationId)
      })

      onOrderStatusChange?.(orderPayload)
    },
    [locationId, queryClient, onOrderStatusChange]
  )

  // Subscribe to location kitchen channel
  const { status, reconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase, // Pass supabase client as prop
    topic: `location:${locationId}:kitchen`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId && !!supabase // Add supabase check
  })

  return {
    connectionStatus: status,
    reconnect,
    isConnected: status.state === 'SUBSCRIBED'
  }
}
