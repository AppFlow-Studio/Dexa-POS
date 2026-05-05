/**
 * End-of-Day Service
 *
 * Fetches aggregated daily data for EOD reporting.
 * Runs checklist validations against live data.
 */

import { fetchSessionVarianceAnalysis } from '@/services/cashDrawerAuditService'
import { useCashDrawerStore } from '@/stores/useCashDrawerStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import {
  DailySummary,
  DrawerBreakdownItem,
  OpenOrderSummary,
  useEndOfDayStore
} from '@/stores/useEndOfDayStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import {
  FetchedOrderData,
  normalizeFetchedOrder,
  transformBroadcastToOrder
} from '@/utils/orderTransformers'
import { SupabaseClient } from '@supabase/supabase-js'

export interface TipPoolRoleShareOverview {
  id: string
  configId: string
  configName: string
  roleCode: string
  roleName?: string | null
  sharePercentage: number
  pointsPerHour?: number | null
}

export interface TipPoolConfigOverview {
  id: string
  name: string
  description?: string | null
  distributionMethod: string
  tipSource: string
  sourcePercentage: number
  contributingRoleCodes: string[]
  isActive: boolean
  effectiveDate?: string | null
  endDate?: string | null
  shares: TipPoolRoleShareOverview[]
}

export interface TipOutRuleOverview {
  id: string
  fromRoleCode: string
  fromRoleName?: string | null
  toRoleCode: string
  toRoleName?: string | null
  tipOutType: string
  tipOutValue: number
  isActive: boolean
  effectiveDate?: string | null
  endDate?: string | null
}

export interface TipDistributionRulesOverview {
  locationId: string
  fetchedAt: string
  configs: TipPoolConfigOverview[]
  rules: TipOutRuleOverview[]
}

// ============================================================================
// TIP SUMMARY
// ============================================================================

export interface TodayTipSummary {
  /** Gross card tips for the period (what customers wrote on the slip). */
  cardTips: number
  /** Card tips NET of the bank/processor fee (what the merchant actually
   * receives and has to pay out). */
  cardTipsNet: number
  /** Bank/processor fee on card tips for the period (informational). */
  cardTipsProcessorFee: number
  cashTips: number
  /** Total tips after netting the bank fee out of card tips. Distribution
   * pools work off this amount. */
  totalTips: number
  /** Total tips before netting (gross card + cash). Display-only. */
  totalTipsGross: number
  periodStart: string | null // "YYYY-MM-DD" — first day included in totals
  lastCutoffAt: string | null // timestamp of last approved session's data_cutoff_at
  /** Prior-day sessions (since last approved) that are not approved/exported/voided */
  pendingPriorDaySessions: { date: string; status: string }[]
}

export interface TodaySessionRow {
  id: string
  sequenceNumber: number
  status: string
  totalDistributed: number
  dataStartAfter: string | null
  dataCutoffAt: string | null
  approvedAt: string | null
  calculatedAt: string | null
}

/**
 * Fetch all tip distribution sessions for a given location and date.
 * Used by EodStepTips to show the multi-session history.
 */
export async function fetchTodaySessions(
  supabase: SupabaseClient,
  locationId: string,
  date: string,
): Promise<TodaySessionRow[]> {
  const { data, error } = await supabase
    .from('tip_distribution_sessions')
    .select('id, sequence_number, status, total_distributed, data_start_after, data_cutoff_at, approved_at, calculated_at')
    .eq('location_id', locationId)
    .eq('session_date', date)
    .not('status', 'eq', 'voided')
    .order('sequence_number', { ascending: true })

  if (error) throw error

  const mapped = (data || []).map((s: any) => ({
    id: s.id,
    sequenceNumber: Number(s.sequence_number) || 1,
    status: s.status as string,
    totalDistributed: Number(s.total_distributed) || 0,
    dataStartAfter: s.data_start_after as string | null,
    dataCutoffAt: s.data_cutoff_at as string | null,
    approvedAt: s.approved_at as string | null,
    calculatedAt: s.calculated_at as string | null,
  }))

  // Deduplicate: keep only the latest row per sequence_number
  // (recalculations can create multiple rows with the same sequence)
  const bySeq = new Map<number, TodaySessionRow>()
  for (const s of mapped) {
    const existing = bySeq.get(s.sequenceNumber)
    if (!existing || statusPriority(s.status) > statusPriority(existing.status)) {
      bySeq.set(s.sequenceNumber, s)
    }
  }
  return Array.from(bySeq.values()).sort((a, b) => a.sequenceNumber - b.sequenceNumber)
}

function statusPriority(status: string): number {
  switch (status) {
    case 'approved': return 3
    case 'calculated': return 2
    case 'draft': return 1
    default: return 0
  }
}

/**
 * Compute unsettled tips directly from the in-memory order store.
 * Instant — no network round-trip. Used as placeholderData for the backend query.
 * Includes all in-memory orders regardless of date (mirrors the multi-day period logic).
 */
export function computeLocalUnsettledTips (): Pick<
  TodayTipSummary,
  'cardTips' | 'cashTips' | 'totalTips'
> {
  const { ordersById } = useOrderStore.getState()

  // Terminal statuses — never contribute tips
  const EXCLUDED_STATUSES = new Set(['void', 'cancelled', 'refunded'])

  let cardTips = 0
  let cashTips = 0

  for (const order of Object.values(ordersById)) {
    if (!order?.payments?.length) continue
    if (EXCLUDED_STATUSES.has(order.order_status)) continue

    for (const payment of order.payments) {
      // Skip voided/refunded payments
      if (
        payment.isVoided ||
        payment.status === 'voided' ||
        payment.status === 'refunded'
      )
        continue
      const tip = payment.tip_amount || 0
      if (tip <= 0) continue
      // OrderProfilePayment uses `method: PaymentType` with values "Card" / "Cash"
      if (payment.method === 'Card') cardTips += tip
      else if (payment.method === 'Cash') cashTips += tip
    }
  }

  return { cardTips, cashTips, totalTips: cardTips + cashTips }
}

/**
 * Fetch tip totals for all unsettled days since the last approved/exported session.
 * Used by EodStepTips to show the manager what's being distributed.
 */
export async function fetchUnsettledTipSummary (
  supabase: SupabaseClient,
  locationId: string
): Promise<TodayTipSummary> {
  const now = new Date()
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}`
  const endOfPeriod = now.toISOString()

  const lastSettledRes = await supabase
    .from('tip_distribution_sessions')
    .select('session_date, data_cutoff_at')
    .eq('location_id', locationId)
    .in('status', ['approved', 'exported'])
    .order('session_date', { ascending: false })
    .order('sequence_number', { ascending: false })
    .limit(1)

  let startOfPeriod: string
  let periodStart: string
  const lastCutoffAt: string | null = lastSettledRes.data?.[0]?.data_cutoff_at ?? null

  if (lastSettledRes.data?.[0]?.session_date) {
    const lastDate = lastSettledRes.data[0].session_date
    if (lastDate >= localDate) {
      // Last settlement was today — show today's tips
      startOfPeriod = new Date(`${localDate}T00:00:00`).toISOString()
      periodStart = localDate
    } else {
      const d = new Date(`${lastDate}T00:00:00`)
      d.setDate(d.getDate() + 1)
      startOfPeriod = d.toISOString()
      periodStart = d.toISOString().split('T')[0]
    }
  } else {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() - 30)
    startOfPeriod = fallback.toISOString()
    periodStart = fallback.toISOString().split('T')[0]
  }

  const [paymentsRes, priorSessionsRes] = await Promise.all([
    supabase
      .from('order_payments')
      .select('payment_method, tip_amount, tip_fee, is_voided, is_returned, initiated_at')
      .eq('location_id', locationId)
      .not('status', 'in', '("void","failed","declined","pending","processing")')
      .or(`initiated_at.gte.${startOfPeriod},initiated_at.is.null`),
    supabase
      .from('tip_distribution_sessions')
      .select('session_date, status')
      .eq('location_id', locationId)
      .gte('session_date', periodStart)
      .lt('session_date', localDate)
      .not('status', 'in', '("approved","exported","voided")')
  ])

  if (paymentsRes.error) {
    console.error(
      '[EOD] fetchUnsettledTipSummary payments query failed:',
      paymentsRes.error.message
    )
  }

  const payments = (paymentsRes.data || []).filter(
    (p: any) => !p.is_voided && !p.is_returned
  )
  const cardPayments = payments.filter((p: any) => p.payment_method !== 'cash')
  const cardTips = cardPayments.reduce(
    (sum: number, p: any) => sum + Number(p.tip_amount || 0),
    0
  )
  // Bank/processor fee on card tips. The bank deducts this from the
  // merchant payout (see project_platform_fee_tracking). Cash payments
  // have tip_fee=0 by construction.
  const cardTipsProcessorFee = cardPayments.reduce(
    (sum: number, p: any) => sum + Number(p.tip_fee || 0),
    0
  )
  const cardTipsNet = Math.max(0, cardTips - cardTipsProcessorFee)
  const cashTips = payments
    .filter((p: any) => p.payment_method === 'cash')
    .reduce((sum: number, p: any) => sum + Number(p.tip_amount || 0), 0)


  return {
    cardTips,
    cardTipsNet,
    cardTipsProcessorFee,
    cashTips,
    totalTips: cardTipsNet + cashTips,
    totalTipsGross: cardTips + cashTips,
    periodStart,
    lastCutoffAt,
    pendingPriorDaySessions: (priorSessionsRes.data || []).map((s: any) => ({
      date: s.session_date,
      status: s.status
    }))
  }
}

// ============================================================================
// OPEN ORDERS
// ============================================================================

/**
 * Fetch all open (unpaid/partial) orders for the location — no date filter.
 * Fixes the silent bug in the old query that used `.eq("payment_status", "Unpaid")`
 * (not a valid DB enum value — always returned 0 rows).
 */
export async function fetchOpenOrders (
  supabase: SupabaseClient,
  locationId: string
): Promise<OpenOrderSummary[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, table_number, order_type, total_amount, payment_status, check_status, created_at'
    )
    .eq('location_id', locationId)
    .eq('check_status', 'opened')
    .not('payment_status', 'eq', 'paid')
    .not('status', 'in', '("void","cancelled")')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[EOD] fetchOpenOrders failed:', error.message)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    table_number: row.table_number ?? null,
    order_type: row.order_type ?? null,
    grand_total: Number(row.total_amount || 0),
    payment_status: row.payment_status ?? 'pending',
    check_status: row.check_status ?? null,
    created_at: row.created_at
  }))
}

/**
 * Bulk close open orders:
 * - pending/null payment_status → void the order
 * - partial/partially_refunded/refunded → close the check
 * Returns approximate count of rows affected.
 */
export async function bulkCloseOpenOrders (
  supabase: SupabaseClient,
  locationId: string,
  orderIds: string[]
): Promise<number> {
  if (orderIds.length === 0) return 0

  const [voidRes, closeRes] = await Promise.all([
    supabase
      .from('orders')
      .update({ status: 'void' })
      .eq('location_id', locationId)
      .in('id', orderIds)
      .or('payment_status.eq.pending,payment_status.is.null'),
    supabase
      .from('orders')
      .update({ check_status: 'closed' })
      .eq('location_id', locationId)
      .in('id', orderIds)
      .in('payment_status', ['partial', 'partially_refunded', 'refunded'])
  ])

  if (voidRes.error)
    console.error(
      '[EOD] bulkCloseOpenOrders void failed:',
      voidRes.error.message
    )
  if (closeRes.error)
    console.error(
      '[EOD] bulkCloseOpenOrders close failed:',
      closeRes.error.message
    )

  return 0
}

/**
 * Ensure an order is loaded into useOrderStore so PaymentDetailBottomSheet can open it.
 * Returns true if the order is available (either already loaded or successfully fetched).
 */
export async function loadOrderForPaymentSheet (
  supabase: SupabaseClient,
  dbOrderId: string
): Promise<boolean> {
  const { ordersById, dbOrderIdIndex } = useOrderStore.getState()

  // Already in store under local key or db-id key
  if (ordersById[dbOrderId] || dbOrderIdIndex[dbOrderId]) return true

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (*, order_item_modifiers (*)),
        order_payments (*),
        stations (station_name),
        created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name)
      `
      )
      .eq('id', dbOrderId)
      .single()

    if (error || !data) {
      console.error(
        '[EOD] loadOrderForPaymentSheet fetch failed:',
        error?.message
      )
      return false
    }

    const broadcastData = normalizeFetchedOrder(
      data as unknown as FetchedOrderData
    )
    const profile = transformBroadcastToOrder(broadcastData, null)

    useOrderStore.setState(state => ({
      ordersById: { ...state.ordersById, [profile.id]: profile }
    }))
    return true
  } catch (err) {
    console.error('[EOD] loadOrderForPaymentSheet error:', err)
    return false
  }
}

// ============================================================================
// CHECKLIST
// ============================================================================

/**
 * Run all checklist validations and update the store.
 */
export async function runChecklistValidations (
  supabase: SupabaseClient,
  locationId: string
): Promise<void> {
  const eod = useEndOfDayStore.getState()

  // 1. Check tables clear
  const sessions = useTableSessionStore.getState().sessions
  const activeTables = Object.values(sessions).filter(
    s => s && s.status !== 'available' && s.status !== 'cleaning'
  )
  if (activeTables.length === 0) {
    eod.updateChecklistItem('tables_clear', 'passed')
  } else {
    const tableLabel = activeTables.length === 1 ? 'table' : 'tables'
    eod.updateChecklistItem(
      'tables_clear',
      'failed',
      `${activeTables.length} ${tableLabel} still active`
    )
  }

  // 2. Check orders closed
  const openOrders = await fetchOpenOrders(supabase, locationId)
  useEndOfDayStore.getState().setOpenOrders(openOrders)

  if (openOrders.length === 0) {
    eod.updateChecklistItem('orders_closed', 'passed')
  } else {
    eod.updateChecklistItem(
      'orders_closed',
      'failed',
      `${openOrders.length} open order(s) remain`
    )
  }

  // 3. Check cash drawer
  const drawerSession = useCashDrawerStore.getState().activeSession
  if (!drawerSession || drawerSession.status === 'closed') {
    eod.updateChecklistItem('cash_drawer_closed', 'passed')
  } else {
    eod.updateChecklistItem('cash_drawer_closed', 'failed', 'Drawer still open')
  }

  // 4. Check tips — all unsettled days since the last approved/exported session
  const _now = new Date()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(_now.getDate()).padStart(2, '0')}`

  const lastSettledRes = await supabase
    .from('tip_distribution_sessions')
    .select('session_date')
    .eq('location_id', locationId)
    .in('status', ['approved', 'exported'])
    .order('session_date', { ascending: false })
    .limit(1)

  let tipPeriodStart: string
  if (lastSettledRes.data?.[0]?.session_date) {
    const d = new Date(`${lastSettledRes.data[0].session_date}T00:00:00`)
    d.setDate(d.getDate() + 1)
    tipPeriodStart = d.toISOString().split('T')[0]
  } else {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() - 30)
    tipPeriodStart = fallback.toISOString().split('T')[0]
  }

  const [{ data: unsettledSessions }, { data: todaySession }] =
    await Promise.all([
      supabase
        .from('tip_distribution_sessions')
        .select('session_date, status')
        .eq('location_id', locationId)
        .gte('session_date', tipPeriodStart)
        .lte('session_date', today)
        .not('status', 'in', '("approved","exported","voided")'),
      supabase
        .from('tip_distribution_sessions')
        .select('status')
        .eq('location_id', locationId)
        .eq('session_date', today)
        .limit(1)
        .maybeSingle()
    ])

  const pending = (unsettledSessions || []) as {
    session_date: string
    status: string
  }[]

  if (pending.length === 0) {
    eod.updateChecklistItem('tips_distributed', 'passed')
  } else {
    const localTips = computeLocalUnsettledTips()
    const noTips = localTips.totalTips === 0 && !todaySession
    if (noTips) {
      eod.updateChecklistItem('tips_distributed', 'passed')
    } else {
      const detail =
        pending.length === 1 && pending[0].session_date === today
          ? `Today: ${pending[0].status}`
          : `${pending.length} unsettled day${pending.length > 1 ? 's' : ''}`
      eod.updateChecklistItem('tips_distributed', 'failed', detail)
    }
  }

  // 5. Check shifts — exclude the current POS user (they clock out separately)
  const activeEmployeeId = useEmployeeStore.getState().activeEmployeeId
  const activeShifts = Object.entries(
    useTimeclockStore.getState().sessions
  ).filter(([id]) => id !== activeEmployeeId)
  if (activeShifts.length === 0) {
    eod.updateChecklistItem('shifts_reviewed', 'passed')
  } else {
    eod.updateChecklistItem(
      'shifts_reviewed',
      'failed',
      `${activeShifts.length} staff still clocked in`
    )
  }

  // 6. Report is always pending until user generates it
  eod.updateChecklistItem('report_generated', 'pending')
}

/**
 * Fetch aggregated daily summary data.
 */
export async function fetchDailySummary (
  supabase: SupabaseClient,
  locationId: string,
  date?: string
): Promise<DailySummary | null> {
  const _n = new Date()
  const localToday = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(_n.getDate()).padStart(2, '0')}`
  const targetDate = date || localToday
  const startOfDay = new Date(`${targetDate}T00:00:00`).toISOString()
  const endOfDay = new Date(`${targetDate}T23:59:59.999`).toISOString()

  try {
    // Fetch all in parallel
    const [ordersRes, paymentsRes, shiftsRes, itemsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, total_amount, discount_amount, payment_status, status, assigned_server_id, created_by_staff_id, created_at')
        .eq('location_id', locationId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay),
      supabase
        .from('order_payments')
        .select('id, payment_method, total_amount, amount, tip_amount, is_voided, is_returned, status')
        .eq('location_id', locationId)
        .or(`initiated_at.gte.${startOfDay},initiated_at.is.null`),
      supabase
        .from('staff_shifts')
        .select('id, clock_in_time, clock_out_time, hourly_rate_snapshot, break_logs, staff_profile_id')
        .eq('location_id', locationId)
        .gte('clock_in_time', startOfDay)
        .lte('clock_in_time', endOfDay),
      supabase
        .from('order_items')
        .select('item_name, quantity, subtotal, order_id')
        .eq('location_id', locationId)
        .eq('is_voided', false)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay),
    ])

    const orders = ordersRes.data || []
    const payments = paymentsRes.data || []
    const shifts = shiftsRes.data || []
    const items = itemsRes.data || []

    // Fetch staff names for top server
    const serverIds = [...new Set(orders.map((o: any) => o.assigned_server_id || o.created_by_staff_id).filter(Boolean))]
    let staffNameMap: Record<string, string> = {}
    if (serverIds.length > 0) {
      const { data: staffRaw } = await supabase
        .from('staff_profiles')
        .select('id, display_name, first_name, last_name')
        .in('id', serverIds)
      ;(staffRaw || []).forEach((s: any) => {
        staffNameMap[s.id] = s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.id
      })
    }

    // Calculate totals
    const orderList = orders || []
    const paymentList = payments || []
    const shiftList = shifts || []
    const itemList = items || []

    const totalSales = orderList.reduce(
      (sum: number, o: any) => sum + Number(o.total_amount || 0),
      0
    )
    const totalDiscounts = orderList.reduce(
      (sum: number, o: any) => sum + Number(o.discount_amount || 0),
      0
    )
    const totalVoids = orderList.filter((o: any) => o.status === 'void' || o.status === 'voided').length

    const validPayments = paymentList.filter(
      (p: any) => !p.is_voided && !p.is_returned && !['pending', 'processing', 'failed', 'declined', 'void'].includes(p.status)
    )
    const cardPayments = validPayments.filter((p: any) => p.payment_method !== 'cash')
    const cashPayments = validPayments.filter((p: any) => p.payment_method === 'cash')

    const cardTotal = cardPayments.reduce(
      (sum: number, p: any) => sum + Number(p.total_amount || p.amount || 0),
      0
    )
    const cashTotal = cashPayments.reduce(
      (sum: number, p: any) => sum + Number(p.total_amount || p.amount || 0),
      0
    )
    const totalTips = validPayments.reduce(
      (sum: number, p: any) => sum + Number(p.tip_amount || 0),
      0
    )
    const totalRefunds = 0

    // Top selling item
    const itemAgg: Record<string, { quantity: number; revenue: number }> = {}
    for (const item of itemList) {
      const name = (item as any).item_name || 'Unknown'
      if (!itemAgg[name]) itemAgg[name] = { quantity: 0, revenue: 0 }
      itemAgg[name].quantity += Number((item as any).quantity || 1)
      itemAgg[name].revenue += Number((item as any).subtotal || 0)
    }
    let topItem: DailySummary['topItem'] = null
    for (const [name, agg] of Object.entries(itemAgg)) {
      if (!topItem || agg.quantity > topItem.quantity) {
        topItem = { name, quantity: agg.quantity, revenue: agg.revenue }
      }
    }

    // Top server
    const serverAgg: Record<string, { revenue: number; orderCount: number }> = {}
    for (const o of orderList) {
      const sid = (o as any).assigned_server_id || (o as any).created_by_staff_id
      if (!sid) continue
      if (!serverAgg[sid]) serverAgg[sid] = { revenue: 0, orderCount: 0 }
      serverAgg[sid].revenue += Number((o as any).total_amount || 0)
      serverAgg[sid].orderCount += 1
    }
    let topServer: DailySummary['topServer'] = null
    for (const [sid, agg] of Object.entries(serverAgg)) {
      if (!topServer || agg.revenue > topServer.revenue) {
        topServer = { name: staffNameMap[sid] || sid, revenue: agg.revenue, orderCount: agg.orderCount }
      }
    }

    // Busy hour
    const hourAgg: Record<number, number> = {}
    for (const o of orderList) {
      const h = new Date((o as any).created_at).getHours()
      hourAgg[h] = (hourAgg[h] || 0) + 1
    }
    let busyHour: DailySummary['busyHour'] = null
    for (const [hStr, count] of Object.entries(hourAgg)) {
      const h = Number(hStr)
      if (!busyHour || count > busyHour.orderCount) {
        busyHour = { hour: h, orderCount: count }
      }
    }

    // Labor calculation
    let totalLaborHours = 0
    let totalLaborCost = 0
    for (const shift of shiftList) {
      const clockIn = new Date(shift.clock_in_time)
      const clockOut = shift.clock_out_time
        ? new Date(shift.clock_out_time)
        : new Date()
      let durationMs = clockOut.getTime() - clockIn.getTime()

      // Subtract breaks
      if (shift.break_logs && Array.isArray(shift.break_logs)) {
        for (const brk of shift.break_logs as any[]) {
          if (brk.start && brk.end) {
            durationMs -=
              new Date(brk.end).getTime() - new Date(brk.start).getTime()
          }
        }
      }

      const hours = durationMs / (1000 * 60 * 60)
      totalLaborHours += hours
      totalLaborCost += hours * Number(shift.hourly_rate_snapshot || 0)
    }

    // Cash drawer
    const drawerStore = useCashDrawerStore.getState()

    // Fetch per-drawer breakdown for the day
    let drawerBreakdown: DrawerBreakdownItem[] | undefined
    try {
      const { data: sessions } = await supabase
        .from('cash_drawer_sessions')
        .select(
          'id, cash_drawer_id, opening_amount, closing_amount, expected_cash, variance'
        )
        .eq('location_id', locationId)
        .eq('business_date', targetDate)

      if (sessions?.length) {
        const drawerIds = [
          ...new Set(sessions.map((s: any) => s.cash_drawer_id))
        ]
        const { data: drawers } = await supabase
          .from('cash_drawers')
          .select('id, name')
          .in('id', drawerIds)
        const drawerNameMap: Record<string, string> = {}
        for (const d of drawers || []) {
          drawerNameMap[d.id] = d.name
        }

        // Fetch operations for these sessions
        const sessionIds = sessions.map((s: any) => s.id)
        const { data: allOps } = await supabase
          .from('cash_drawer_operations')
          .select('id, session_id, operation_type, amount, performed_at, performed_by, reason, approved_by')
          .in('session_id', sessionIds)

        const opsBySession: Record<string, any[]> = {}
        for (const op of allOps || []) {
          if (!opsBySession[op.session_id]) opsBySession[op.session_id] = []
          opsBySession[op.session_id].push(op)
        }

        drawerBreakdown = sessions.map((s: any) => {
          const ops = opsBySession[s.id] || []
          const sumType = (type: string) =>
            ops
              .filter((o: any) => o.operation_type === type)
              .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0)
          const countType = (type: string) =>
            ops.filter((o: any) => o.operation_type === type).length

          // Collect no-sale event details with timestamps
          const noSaleOps = ops.filter((o: any) => o.operation_type === 'no_sale')
          const noSaleEvents = noSaleOps.map((o: any) => ({
            id: o.id,
            performedAt: o.performed_at,
            performedBy: o.performed_by,
            reason: o.reason || null,
            approvedBy: o.approved_by || null,
          }))

          return {
            drawerName: drawerNameMap[s.cash_drawer_id] || 'Unknown',
            sessionId: s.id,
            opening: Number(s.opening_amount || 0),
            closing: Number(s.closing_amount || 0),
            expected: Number(s.expected_cash || 0),
            variance: Number(s.variance || 0),
            cashSales: sumType('cash_sale'),
            refunds: sumType('cash_refund'),
            payIns: sumType('pay_in'),
            payOuts: sumType('pay_out'),
            cashDrops: sumType('cash_drop'),
            noSaleCount: countType('no_sale'),
            noSaleEvents,
          }
        })

        // Fetch variance analysis for sessions with significant variance
        const alertThreshold = useLocationConfigStore.getState().config.cashDrawer.varianceAlertThreshold || 20
        for (const item of drawerBreakdown) {
          if (item.sessionId && Math.abs(item.variance) >= alertThreshold) {
            try {
              const analysis = await fetchSessionVarianceAnalysis(supabase, item.sessionId)
              if (analysis) {
                item.suspiciousPatterns = analysis.suspiciousPatterns
                // Enrich no-sale events with staff names from analysis
                if (analysis.noSaleEvents.length > 0) {
                  item.noSaleEvents = analysis.noSaleEvents.map(ev => ({
                    id: ev.id,
                    performedAt: ev.performedAt,
                    performedBy: ev.performedBy,
                    performedByName: ev.performedByName || undefined,
                    reason: ev.reason,
                    approvedBy: ev.approvedBy,
                  }))
                }
              }
            } catch (err) {
              console.warn('[EOD] Failed to fetch variance analysis for session:', item.sessionId, err)
            }
          }
        }
      }
    } catch (err) {
      console.warn('[EOD] Failed to fetch drawer breakdown:', err)
    }

    const summary: DailySummary = {
      date: targetDate,
      totalSales,
      totalOrders: orderList.length,
      averageOrderValue:
        orderList.length > 0 ? totalSales / orderList.length : 0,
      cardTotal,
      cashTotal,
      otherTotal: 0,
      totalTips,
      totalLaborHours,
      totalLaborCost,
      staffCount: shiftList.length,
      drawerOpening: drawerStore.activeSession?.openingAmount || 0,
      drawerClosing: drawerStore.getRunningBalance(),
      drawerVariance: 0,
      drawerBreakdown,
      totalVoids,
      totalDiscounts,
      totalRefunds,
      topItem,
      topServer,
      busyHour,
    }

    return summary
  } catch (error) {
    console.error('[EOD] Failed to fetch daily summary:', error)
    return null
  }
}

/**
 * Fetch read-only tip distribution rule configuration for EOD overview.
 */
export async function fetchTipDistributionRulesOverview (
  supabase: SupabaseClient,
  locationId: string
): Promise<TipDistributionRulesOverview | null> {
  try {
    const [tipsRes, poolsRes, sharesRes, rolesRes] = await Promise.all([
      supabase
        .from('tip_out_rules')
        .select(
          'id, from_role_code, to_role_code, tip_out_type, tip_out_value, is_active, effective_date, end_date'
        )
        .eq('location_id', locationId)
        .order('from_role_code'),
      supabase
        .from('tip_pool_configs')
        .select(
          'id, name, description, distribution_method, tip_source, source_percentage, contributing_role_codes, is_active, effective_date, end_date'
        )
        .eq('location_id', locationId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('tip_pool_role_shares')
        .select(
          'id, tip_pool_config_id, role_code, share_percentage, points_per_hour, is_eligible'
        )
        .eq('is_eligible', true),
      supabase.from('roles').select('code, name').not('code', 'is', null)
    ])

    if (
      (tipsRes.error && tipsRes.error.message) ||
      (poolsRes.error && poolsRes.error.message) ||
      (sharesRes.error && sharesRes.error.message) ||
      (rolesRes.error && rolesRes.error.message)
    ) {
      return null
    }

    const roleNameByCode: Record<string, string> = {}
    for (const role of rolesRes.data || []) {
      roleNameByCode[role.code] = role.name
    }

    const shareRows = (sharesRes.data || []) as any[]
    const shareConfigIds = new Set<string>(
      shareRows
        .map(row => row.tip_pool_config_id)
        .filter((id): id is string => Boolean(id))
    )
    const eligiblePools = (poolsRes.data || []).filter(pool =>
      shareConfigIds.has((pool as any).id)
    )

    const sharesByConfig = new Map<string, TipPoolRoleShareOverview[]>()
    for (const share of shareRows) {
      const configId = share.tip_pool_config_id
      if (!configId) continue

      if (!shareConfigIds.has(configId)) {
        continue
      }

      const existing = sharesByConfig.get(configId) || []
      existing.push({
        id: share.id,
        configId,
        configName:
          eligiblePools.find((pool: any) => pool.id === configId)?.name ||
          'Pool',
        roleCode: share.role_code,
        roleName: roleNameByCode[share.role_code],
        sharePercentage: Number(share.share_percentage || 0),
        pointsPerHour:
          share.points_per_hour !== null ? Number(share.points_per_hour) : null
      })
      sharesByConfig.set(configId, existing)
    }

    const pools: TipPoolConfigOverview[] = eligiblePools
      .map(pool => {
        const configId = (pool as any).id
        const shares = (sharesByConfig.get(configId) || [])
          .sort((a, b) => b.sharePercentage - a.sharePercentage)
          .sort((a, b) => a.roleName?.localeCompare(b.roleName || '') || 0)

        return {
          id: configId,
          name: pool.name,
          description: pool.description,
          distributionMethod: pool.distribution_method,
          tipSource: pool.tip_source,
          sourcePercentage: Number(pool.source_percentage || 0),
          contributingRoleCodes: pool.contributing_role_codes || [],
          isActive: Boolean(pool.is_active),
          effectiveDate: pool.effective_date,
          endDate: pool.end_date,
          shares
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    const rules = (tipsRes.data || [])
      .map(rule => ({
        id: rule.id,
        fromRoleCode: rule.from_role_code,
        fromRoleName: roleNameByCode[rule.from_role_code],
        toRoleCode: rule.to_role_code,
        toRoleName: roleNameByCode[rule.to_role_code],
        tipOutType: rule.tip_out_type,
        tipOutValue: Number(rule.tip_out_value || 0),
        isActive: Boolean(rule.is_active),
        effectiveDate: rule.effective_date,
        endDate: rule.end_date
      }))
      .filter(rule => {
        const fromRole = roleNameByCode[rule.fromRoleCode] || rule.fromRoleCode
        const toRole = roleNameByCode[rule.toRoleCode] || rule.toRoleCode
        return Boolean(fromRole) && Boolean(toRole)
      })

    return {
      locationId,
      fetchedAt: new Date().toISOString(),
      configs: pools,
      rules
    }
  } catch (error) {
    console.error('[EOD] Failed to load tip distribution overview:', error)
    return null
  }
}
