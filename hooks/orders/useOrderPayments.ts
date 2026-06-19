import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import type {
  CartItem,
  OrderPaymentItemCoverage,
  OrderProfilePayment,
  PaymentType
} from '@/lib/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

const EMPTY_ORDER_ITEMS: CartItem[] = []

type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'voided'
  | 'refunded'

export interface OrderPaymentItemRow {
  order_item_id: string
  quantity_paid: number
  unit_price_paid: number
  subtotal_paid: number
  tax_paid?: number | null
}

export interface OrderPaymentRow {
  id: string
  order_id: string
  amount: number | null
  tip_amount: number | null
  total_amount: number | null
  payment_method: 'cash' | 'card' | string | null
  status: PaymentStatus | string | null
  card_type: string | null
  card_last_four: string | null
  transaction_id: string | null
  terminal_type: string | null
  reference_number: string | null
  authorization_code: string | null
  auth_code: string | null
  rrn: string | null
  batch_number: string | null
  dejavoo_batch_number: string | null
  dejavoo_invoice_number: string | null
  entry_mode: string | null
  is_voided: boolean | null
  void_reason: string | null
  voided_at: string | null
  refunded_amount: number | null
  refunded_at: string | null
  is_returned: boolean | null
  returned_at: string | null
  returned_by: string | null
  return_amount: number | null
  return_rrn: string | null
  return_auth_code: string | null
  return_reference_id: string | null
  return_number: string | null
  return_reason: string | null
  initiated_at: string | null
  created_at: string
  amount_tendered: number | null
  change_given: number | null
  is_cash_priced: boolean | null
  original_amount: number | null
  subtotal_portion: number | null
  tax_portion: number | null
  discount_portion: number | null
  split_portion_index: number | null
  split_count: number | null
  original_tip_amount?: number | null
  tip_adjusted_at?: string | null
  tip_adjusted_by?: string | null
  dual_pricing_fee?: number | null
  tip_fee?: number | null
  refunded_dual_pricing_fee?: number | null
  refunded_tip_fee?: number | null
  original_tip_fee?: number | null
  dual_pricing_percentage_snapshot?: number | null
  tip_surcharge_percentage_snapshot?: number | null
  terminal_response?: Record<string, unknown> | null
  processor_response?: Record<string, unknown> | null
  order_payment_items?: OrderPaymentItemRow[] | null
}

export const orderPaymentsQueryKey = (orderId: string) =>
  ['payments', orderId] as const

export const getOrderPaymentsQueryOptions = (
  supabase: ReturnType<typeof useSupabaseClient>,
  orderId: string
) => ({
  queryKey: orderPaymentsQueryKey(orderId),
  queryFn: async (): Promise<OrderPaymentRow[]> => {
    const { data, error } = await supabase
      .from('order_payments')
      .select(
        `
          id,
          order_id,
          amount,
          tip_amount,
          total_amount,
          payment_method,
          status,
          card_type,
          card_last_four,
          transaction_id,
          terminal_type,
          reference_number,
          authorization_code,
          auth_code,
          rrn,
          batch_number,
          dejavoo_batch_number,
          dejavoo_invoice_number,
          entry_mode,
          is_voided,
          void_reason,
          voided_at,
          refunded_amount,
          refunded_at,
          is_returned,
          returned_at,
          returned_by,
          return_amount,
          return_rrn,
          return_auth_code,
          return_reference_id,
          return_number,
          return_reason,
          initiated_at,
          created_at,
          amount_tendered,
          change_given,
          is_cash_priced,
          original_amount,
          subtotal_portion,
          tax_portion,
          discount_portion,
          split_portion_index,
          split_count,
          original_tip_amount,
          tip_adjusted_at,
          tip_adjusted_by,
          dual_pricing_fee,
          tip_fee,
          refunded_dual_pricing_fee,
          refunded_tip_fee,
          original_tip_fee,
          dual_pricing_percentage_snapshot,
          tip_surcharge_percentage_snapshot,
          terminal_response,
          processor_response,
          order_payment_items (
            order_item_id,
            quantity_paid,
            unit_price_paid,
            subtotal_paid,
            tax_paid
          )
        `
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data as OrderPaymentRow[] | null) ?? []
  },
  enabled: !!supabase && !!orderId,
  // 60s instead of 0: reopening the payment sheet within a minute serves
  // cache instead of refetching. Cross-station freshness is covered by the
  // realtime broadcast handler (useOrdersRealtime), which invalidates this
  // key for ANY order's INSERT/UPDATE — an open sheet refetches immediately.
  staleTime: 60_000
})

const toPaymentType = (paymentMethod: OrderPaymentRow['payment_method']): PaymentType => {
  if (paymentMethod?.toLowerCase() === 'cash') return 'Cash'
  return 'Card'
}

const buildItemsCovered = (
  payment: OrderPaymentRow,
  orderItems: CartItem[]
): OrderPaymentItemCoverage[] => {
  const itemsById = new Map<string, CartItem>()
  orderItems.forEach(item => {
    if (item.db_order_item_id) itemsById.set(item.db_order_item_id, item)
    itemsById.set(item.id, item)
  })

  return (payment.order_payment_items ?? []).map(item => ({
    itemId: item.order_item_id,
    itemName: itemsById.get(item.order_item_id)?.name ?? 'Unknown Item',
    quantity: item.quantity_paid,
    unitPrice: item.unit_price_paid,
    subtotal: item.subtotal_paid
  }))
}

export const hydrateOrderPayments = (
  rows: OrderPaymentRow[],
  orderItems: CartItem[]
): OrderProfilePayment[] =>
  rows.map(payment => {
    const terminalResponse = payment.terminal_response as
      | Record<string, any>
      | undefined
    const castlesTxn = terminalResponse?.castles_transaction as
      | Record<string, any>
      | undefined
    const dejavooTxn = terminalResponse?.dejavoo_transaction as
      | Record<string, any>
      | undefined

    return {
      id: payment.id,
      db_payment_id: payment.id,
      amount: payment.amount ?? 0,
      method: toPaymentType(payment.payment_method),
      tip_amount: payment.tip_amount ?? 0,
      total_collected:
        (payment.amount ?? 0) + (payment.tip_amount ?? 0),
      cardBrand:
        payment.card_type ??
        castlesTxn?.cardType ??
        dejavooTxn?.CardType,
      last4:
        payment.card_last_four ??
        castlesTxn?.cardLast4 ??
        dejavooTxn?.Last4,
      amountTendered: payment.amount_tendered ?? undefined,
      changeGiven: payment.change_given ?? undefined,
      isCashPriced: payment.is_cash_priced ?? false,
      cashSavings:
        payment.is_cash_priced &&
        payment.original_amount != null &&
        payment.amount != null
          ? Math.max(0, payment.original_amount - payment.amount)
          : undefined,
      subtotal_portion: payment.subtotal_portion ?? undefined,
      tax_portion: payment.tax_portion ?? undefined,
      discount_portion: payment.discount_portion ?? undefined,
      splitInfo:
        payment.split_count && payment.split_count > 1
          ? {
              portionIndex: payment.split_portion_index ?? 0,
              totalPortions: payment.split_count,
              isLastPortion:
                (payment.split_portion_index ?? 0) ===
                payment.split_count - 1
            }
          : undefined,
      itemsCovered: buildItemsCovered(payment, orderItems),
      status: (payment.status ?? 'captured') as OrderProfilePayment['status'],
      timestamp: payment.initiated_at ?? payment.created_at,
      isPreAuth: payment.status === 'authorized',
      isVoided: payment.is_voided ?? false,
      voidReason: payment.void_reason ?? undefined,
      voidedAt: payment.voided_at ?? undefined,
      refundedAmount: payment.refunded_amount ?? 0,
      refundedAt: payment.refunded_at ?? undefined,
      reference_id: payment.reference_number ?? undefined,
      isReturned: payment.is_returned ?? false,
      returnedAt: payment.returned_at ?? undefined,
      returnedBy: payment.returned_by ?? undefined,
      returnAmount: payment.return_amount ?? undefined,
      returnRrn: payment.return_rrn ?? undefined,
      returnAuthCode: payment.return_auth_code ?? undefined,
      returnReferenceId: payment.return_reference_id ?? undefined,
      returnNumber: payment.return_number ?? undefined,
      returnReason: payment.return_reason ?? undefined,
      original_tip_amount: payment.original_tip_amount ?? undefined,
      tip_adjusted_at: payment.tip_adjusted_at ?? undefined,
      tip_adjusted_by: payment.tip_adjusted_by ?? undefined,
      dual_pricing_fee: payment.dual_pricing_fee ?? undefined,
      tip_fee: payment.tip_fee ?? undefined,
      refunded_dual_pricing_fee:
        payment.refunded_dual_pricing_fee ?? undefined,
      refunded_tip_fee: payment.refunded_tip_fee ?? undefined,
      original_tip_fee: payment.original_tip_fee ?? undefined,
      dual_pricing_percentage_snapshot:
        payment.dual_pricing_percentage_snapshot ?? undefined,
      tip_surcharge_percentage_snapshot:
        payment.tip_surcharge_percentage_snapshot ?? undefined,
      transactionDetails: {
        terminalType: payment.terminal_type ?? undefined,
        authorizationCode:
          payment.authorization_code ?? payment.auth_code ?? undefined,
        cardType:
          payment.card_type ??
          castlesTxn?.cardType ??
          dejavooTxn?.CardType,
        last4:
          payment.card_last_four ??
          castlesTxn?.cardLast4 ??
          dejavooTxn?.Last4,
        transactionId: payment.transaction_id ?? undefined,
        amountTendered: payment.amount_tendered ?? undefined,
        changeGiven: payment.change_given ?? undefined,
        isCashPriced: payment.is_cash_priced ?? undefined,
        isCash: payment.payment_method === 'cash',
        rrn: payment.rrn ?? undefined,
        batchNumber:
          payment.batch_number ??
          payment.dejavoo_batch_number ??
          undefined,
        invoiceNumber: payment.dejavoo_invoice_number ?? undefined,
        entryMode:
          ((payment.processor_response as any)?.dejavoo_transaction
            ?.entryMode as string | undefined) ??
          payment.entry_mode ??
          castlesTxn?.entryMode,
        referenceId: payment.reference_number ?? undefined,
        castlesTransaction: castlesTxn,
        dejavooTransaction: (payment.processor_response as any)
          ?.dejavoo_transaction
      }
    }
  })

interface UseOrderPaymentsOptions {
  enabled?: boolean
}

export function useOrderPayments (
  orderId: string | null | undefined,
  options?: UseOrderPaymentsOptions
) {
  const supabase = useSupabaseClient()
  const enabled = options?.enabled ?? true

  const orderItems = useOrderStore(state => {
    if (!orderId) return EMPTY_ORDER_ITEMS
    const localOrderId = state.dbOrderIdIndex[orderId] ?? orderId
    return state.ordersById[localOrderId]?.items ?? EMPTY_ORDER_ITEMS
  })

  const query = useQuery({
    ...getOrderPaymentsQueryOptions(supabase, orderId ?? ''),
    enabled: enabled && !!orderId
  })

  const payments = useMemo(
    () => hydrateOrderPayments(query.data ?? [], orderItems),
    [orderItems, query.data]
  )

  return {
    ...query,
    payments
  }
}
