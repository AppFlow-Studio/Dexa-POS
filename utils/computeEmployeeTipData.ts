/**
 * Compute per-employee tip summary from the local order store.
 *
 * Used by CashTipDeclarationModal to show shift stats when offline.
 * Mirrors the backend logic in fetchShiftTipSummary() but runs against
 * in-memory ordersById instead of Supabase.
 */

import { OrderProfile } from '@/lib/types'
import { round2 } from '@/utils/money'

export interface EmployeeTipSummary {
  cardTips: number
  cashPaymentTips: number
  grossSales: number
}

const EXCLUDED_STATUSES = new Set(['void', 'cancelled', 'refunded'])

export function computeEmployeeTipData(
  staffProfileId: string,
  ordersById: Record<string, OrderProfile>,
  startUtc: string,
  endUtc: string,
): EmployeeTipSummary {
  let cardTips = 0
  let cashPaymentTips = 0
  let grossSales = 0

  for (const order of Object.values(ordersById)) {
    if (!order) continue
    if (EXCLUDED_STATUSES.has(order.order_status)) continue
    if (order.created_by_staff_profile_id !== staffProfileId) continue

    // Date filter: order must fall within business day bounds
    const openedAt = order.opened_at
    if (!openedAt || openedAt < startUtc || openedAt > endUtc) continue

    // Accumulate gross sales (subtotal equivalent)
    grossSales += order.total_amount || 0

    // Accumulate tips from payments
    if (!order.payments?.length) continue
    for (const payment of order.payments) {
      if (
        payment.isVoided ||
        payment.status === 'voided' ||
        payment.status === 'refunded'
      ) continue

      const tip = payment.tip_amount || 0
      if (tip <= 0) continue

      if (payment.method === 'Card') {
        cardTips += tip
      } else if (payment.method === 'Cash') {
        cashPaymentTips += tip
      }
    }
  }

  return {
    cardTips: round2(cardTips),
    cashPaymentTips: round2(cashPaymentTips),
    grossSales: round2(grossSales),
  }
}
