import { create } from 'zustand'

import {
  buildStaffRows,
  summarizeLoyalty,
  summarizeOrders,
  summarizePayments,
  summarizeSessions,
  summarizeStaffMetrics,
  summarizeTopCustomers,
  summarizeTopItems,
  isPaidOrder,
} from '@/lib/analytics/summarize'
import { queryLocalAnalytics } from '@/lib/db/analyticsQuery'
import { getOrdersMirrorState } from '@/lib/db/historyQuery'
import { isLocalDbReady } from '@/lib/db/index'
import { getRawIsOnline } from '@/services/offlineSyncService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'

import type {
  DateRange,
  LoyaltySummary,
  OrdersSummary,
  PaymentsSummary,
  SessionsSummary,
  StaffRow,
  TopCustomerRow,
  TopItemRow,
} from '@/lib/analytics/summarize'

/**
 * The summary shapes moved to lib/analytics/summarize.ts together with the
 * reductions that build them (see that file's header for why). They are
 * re-exported here unchanged so every existing import site keeps working —
 * the dashboard imports `PaymentLineItem` from this module.
 */
export type {
  DateRange,
  LoyaltySummary,
  OrdersSummary,
  PaymentLineItem,
  PaymentsSummary,
  SessionsSummary,
  StaffRow,
  TopCustomerRow,
  TopItemRow,
} from '@/lib/analytics/summarize'

export interface AnalyticsFilters {
  dateRange: DateRange
  location?: string
  employee?: string
}

/**
 * Phase 5 — when set, the dashboard resolves its numbers from the local mirror
 * (11 of 13 round trips gone, and the page works offline) and lets the server
 * answer whatever the mirror provably cannot. Off: today's server-only path,
 * unchanged.
 */
const LOCAL_ANALYTICS_ENABLED = process.env.EXPO_PUBLIC_LOCAL_ANALYTICS === '1'

/**
 * Where the displayed numbers came from, and what they do NOT cover.
 *
 * This exists because the Phase 5 rule for this page is "never silently
 * under-report revenue". A local answer is complete only within the mirror's
 * retention window and only for the entities the mirror holds, so those two
 * bounds are reported as data rather than left for the merchant to discover.
 */
export interface AnalyticsCoverage {
  source: 'server' | 'local'
  /** False when the session stat cards have no numbers behind them. */
  hasSessions: boolean
  /** created_at of the oldest order this device retains. Null when unknown. */
  retentionFloor: string | null
  /** True when the requested window starts before `retentionFloor`. */
  windowExceedsRetention: boolean
}

export interface AnalyticsData {
  orders: OrdersSummary
  payments: PaymentsSummary
  /**
   * Null when sessions could not be resolved. `table_sessions` is NOT
   * mirrored — its `updated_at` is nullable, so it has no usable keyset
   * watermark — which makes this the one part of the page that still needs a
   * connection. The stat cards render "—" rather than 0: a zero here would
   * read as "no one sat down today".
   */
  sessions: SessionsSummary | null
  staff: StaffRow[]
  topItems: TopItemRow[]
  topCustomers: TopCustomerRow[]
  loyalty: LoyaltySummary | null
}

export interface AnalyticsState {
  filters: AnalyticsFilters
  activePresetLabel: string | null
  data: AnalyticsData | null
  coverage: AnalyticsCoverage | null
  isLoading: boolean
  error: string | null
  setDateRange: (range: DateRange, presetLabel?: string) => void
  fetchData: (supabase: any, locationId: string, merchantId?: string) => Promise<void>
}

const defaultFilters: AnalyticsFilters = {
  dateRange: {
    start: (() => { const d = new Date(); d.setHours(0,0,0,0); return d })(),
    end: (() => { const d = new Date(); d.setHours(23,59,59,999); return d })(),
  }
}

const SESSION_SELECT = 'id, status, party_size, seated_at, closed_at, actual_duration'

/**
 * Staff names for the LOCAL path.
 *
 * There is no staff mirror — the `staff` table is a storage-policy placeholder
 * with no descriptor behind it — so names come from the MMKV-persisted
 * employee roster, which is already on disk and already the offline source for
 * PIN login. `profileId` is `staff_profiles.id`, the same id the orders carry
 * and the same id the server path looks up.
 *
 * The final fallback is the raw id, which is exactly what the server path
 * shows when a profile row is missing.
 */
function localStaffNameResolver(): (staffId: string) => string {
  const byProfileId = new Map<string, string>()
  for (const e of useEmployeeStore.getState().employees) {
    if (e.profileId) byProfileId.set(e.profileId, e.displayName || e.fullName || e.profileId)
  }
  return (staffId: string) => byProfileId.get(staffId) || staffId
}

/**
 * Resolve the whole page from the mirror. Returns null to mean "the server has
 * to answer this one" — the caller then runs the unchanged server path.
 *
 * Two conditions hand it back:
 *  - the local DB is not open, or the aggregate could not run;
 *  - the requested window starts BEFORE the oldest order we retain, AND we are
 *    online. Answering that from disk would under-report by however much has
 *    aged out; answering it from the server is exact. Offline, there is no
 *    exact answer available, so we return what we have and say so through
 *    `coverage.windowExceedsRetention`.
 */
async function loadLocalAnalytics(
  supabase: any,
  locationId: string,
  dateRange: DateRange,
  startIso: string,
  endIso: string,
): Promise<{ data: AnalyticsData; coverage: AnalyticsCoverage } | null> {
  if (!isLocalDbReady()) return null

  const online = getRawIsOnline()
  const mirror = await getOrdersMirrorState(locationId)
  const retentionFloor = mirror?.retentionFloor ?? null
  const windowExceedsRetention = !!(retentionFloor && retentionFloor > startIso)
  if (online && windowExceedsRetention) return null

  const local = await queryLocalAnalytics({ locationId, startIso, endIso })
  if (!local) return null

  // Sessions are the one summary the mirror cannot answer. Top it up from the
  // network when there is one; a failure here degrades the three stat cards
  // and must never fail the page.
  let sessions: SessionsSummary | null = null
  if (online && supabase) {
    try {
      const { data: rows, error } = await supabase
        .from('table_sessions')
        .select(SESSION_SELECT)
        .eq('location_id', locationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
      if (!error) sessions = summarizeSessions(rows || [])
    } catch {
      sessions = null
    }
  }

  if (__DEV__) {
    console.log(
      `[Analytics][local] ${local.orders.totalOrders} orders, ` +
      `${local.payments.totalPayments} payments, sessions=${sessions ? 'server' : 'unavailable'}`,
    )
  }

  return {
    data: {
      orders: local.orders,
      payments: local.payments,
      sessions,
      staff: buildStaffRows(local.staffMetrics, localStaffNameResolver()),
      topItems: local.topItems,
      topCustomers: local.topCustomers,
      // Not mirrored, and not rendered by any tab — `loyalty` is in TabId but
      // absent from TABS, so the server path's two queries feed nothing today.
      loyalty: null,
    },
    coverage: {
      source: 'local',
      hasSessions: sessions !== null,
      retentionFloor,
      windowExceedsRetention,
    },
  }
}

// Legacy shim — financial.tsx reads salesData; keep it as empty array
export const useAnalyticsStore = create<AnalyticsState & Record<string, any>>((set, get) => ({
  salesData: [] as any[],
  currentReportData: null as any,
  savedCustomReports: [] as any[],
  fetchReportData: async () => {},
  forceRefresh: () => {},
  setFilters: () => {},
  resetFilters: () => {},
  setLocation: () => {},
  setEmployee: () => {},
  addSaleEvent: () => {},
  generateCustomReport: () => ({} as any),
  saveCustomReport: () => {},
  deleteCustomReport: () => {},
  clearError: () => {},
  filters: defaultFilters,
  activePresetLabel: 'Today',
  data: null,
  coverage: null,
  isLoading: false,
  error: null,

  setDateRange: (range, presetLabel) => {
    set({ filters: { dateRange: range }, activePresetLabel: presetLabel ?? null })
  },

  fetchData: async (supabase: any, locationId: string, merchantId?: string) => {
    if (!locationId) return
    set({ isLoading: true, error: null })

    const { dateRange } = get().filters
    const startIso = dateRange.start.toISOString()
    const endIso = dateRange.end.toISOString()

    try {
      if (LOCAL_ANALYTICS_ENABLED) {
        const local = await loadLocalAnalytics(supabase, locationId, dateRange, startIso, endIso)
        if (local) {
          set({ data: local.data, coverage: local.coverage, isLoading: false })
          return
        }
        // Fell through: the mirror could not answer this window completely.
      }

      // ── The server path. Unchanged in behaviour; the reductions moved to
      //    lib/analytics/summarize.ts so a test can hold them against the SQL.
      const { data: ordersRaw, error: ordersErr } = await supabase
        .from('orders')
        .select('id, status, payment_status, order_type, total_amount, tax_amount, tip_amount, discount_amount, assigned_server_id, created_by_staff_id, created_at, customer_id, customer_name, customer_email')
        .eq('location_id', locationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .not('status', 'in', '("draft")')

      if (ordersErr) throw new Error(ordersErr.message)
      const orders: any[] = ordersRaw || []
      const revenueOrders = orders.filter(isPaidOrder)
      const ordersSummary = summarizeOrders(orders)

      const { data: paymentsRaw, error: paymentsErr } = await supabase
        .from('order_payments')
        .select('id, amount, tip_amount, total_amount, payment_method, status, is_voided, is_returned, card_last_four, card_type, initiated_at, captured_at')
        .eq('location_id', locationId)
        .gte('initiated_at', startIso)
        .lte('initiated_at', endIso)

      if (paymentsErr) throw new Error(paymentsErr.message)
      const paymentsSummary = summarizePayments(paymentsRaw || [])

      const { data: sessionsRaw, error: sessionsErr } = await supabase
        .from('table_sessions')
        .select(SESSION_SELECT)
        .eq('location_id', locationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)

      if (sessionsErr) throw new Error(sessionsErr.message)
      const sessionsSummary = summarizeSessions(sessionsRaw || [])

      // Staff performance — metrics from the orders, names from staff_profiles.
      const staffMetrics = summarizeStaffMetrics(revenueOrders)
      const staffIds = Array.from(staffMetrics.keys())
      let staffRows: StaffRow[] = []
      if (staffIds.length > 0) {
        const { data: staffRaw } = await supabase
          .from('staff_profiles')
          .select('id, first_name, last_name, display_name')
          .in('id', staffIds)

        staffRows = buildStaffRows(staffMetrics, (id) => {
          const profile = (staffRaw || []).find((s: any) => s.id === id)
          if (!profile) return id
          return profile.display_name
            || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            || id
        })
      }

      // Top selling items
      const orderIds = revenueOrders.map((o: any) => o.id)
      let topItems: TopItemRow[] = []
      if (orderIds.length > 0) {
        const { data: itemsRaw } = await supabase
          .from('order_items')
          .select('item_name, category_name, quantity, price_paid, subtotal')
          .in('order_id', orderIds)
          .eq('is_voided', false)
        topItems = summarizeTopItems(itemsRaw || [])
      }

      const topCustomers = summarizeTopCustomers(revenueOrders)

      // Loyalty. Nothing renders this today — `loyalty` is in the dashboard's
      // TabId union but absent from TABS — so these two queries, one of them a
      // merchant-wide unbounded select, feed nothing. Left in place: removing
      // them is an online-path change outside this phase's scope.
      let loyalty: LoyaltySummary | null = null
      if (merchantId) {
        const { data: enrollmentsRaw } = await supabase
          .from('loyalty_enrollments')
          .select('customer_id, current_points, lifetime_points, total_rewards_earned, total_rewards_redeemed, total_reward_value, is_active, enrolled_at, last_redeem_at')
          .eq('merchant_id', merchantId)

        const enrollments: any[] = enrollmentsRaw || []
        const topEnrollmentIds = [...enrollments.filter((e: any) => e.is_active)]
          .sort((a: any, b: any) => b.current_points - a.current_points)
          .slice(0, 10)
          .map((e: any) => e.customer_id)

        const names: Record<string, string> = {}
        if (topEnrollmentIds.length > 0) {
          const { data: custRaw } = await supabase
            .from('customers')
            .select('id, name')
            .in('id', topEnrollmentIds)
          ;(custRaw || []).forEach((c: any) => { names[c.id] = c.name || 'Guest' })
        }

        loyalty = summarizeLoyalty(enrollments, names, dateRange)
      }

      set({
        data: {
          orders: ordersSummary,
          payments: paymentsSummary,
          sessions: sessionsSummary,
          staff: staffRows,
          topItems,
          topCustomers,
          loyalty,
        },
        coverage: {
          source: 'server',
          hasSessions: true,
          retentionFloor: null,
          windowExceedsRetention: false,
        },
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err.message || 'Failed to load analytics', isLoading: false })
    }
  }
}))
