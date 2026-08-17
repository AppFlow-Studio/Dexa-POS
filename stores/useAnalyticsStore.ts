import { create } from 'zustand'

export interface DateRange {
  start: Date
  end: Date
}

export interface AnalyticsFilters {
  dateRange: DateRange
  location?: string
  employee?: string
}

export interface OrdersSummary {
  totalOrders: number
  completedOrders: number
  voidedOrders: number
  cancelledOrders: number
  totalRevenue: number
  totalTax: number
  totalTips: number
  totalDiscounts: number
  averageOrderValue: number
  ordersByType: { type: string; count: number; revenue: number }[]
}

// A single captured payment, surfaced for the card/cash detail dropdowns.
export interface PaymentLineItem {
  id: string
  method: string          // raw payment_method (e.g. 'card', 'card_spinapi', 'cash')
  isCard: boolean
  cardBrand: string | null // card_type (Visa, Mastercard, …)
  last4: string | null     // card_last_four
  amount: number           // base amount captured (excludes tip)
  tip: number              // tip_amount
  total: number            // amount + tip actually collected
  paidAt: string | null    // captured_at ?? initiated_at (ISO)
}

export interface PaymentsSummary {
  totalPayments: number
  totalAmount: number
  byMethod: { method: string; count: number; amount: number }[]
  refundCount: number
  refundAmount: number
  // Captured payments split into card vs cash for the business-day banner + dropdowns
  cardCount: number
  cardTotal: number
  cardTips: number
  cashCount: number
  cashTotal: number
  cashTips: number
  cardPayments: PaymentLineItem[]
  cashPayments: PaymentLineItem[]
}

export interface SessionsSummary {
  totalSessions: number
  averagePartySize: number
  averageDurationMinutes: number
  totalCovers: number
  sessionsByStatus: { status: string; count: number }[]
}

export interface StaffRow {
  staffId: string
  name: string
  orderCount: number
  revenue: number
  averageOrderValue: number
}

export interface TopItemRow {
  itemName: string
  quantity: number
  revenue: number
  categoryName: string | null
}

export interface TopCustomerRow {
  customerId: string | null
  name: string
  orderCount: number
  totalSpend: number
  avgSpend: number
}

export interface LoyaltySummary {
  totalEnrolled: number
  activeMembers: number
  totalPointsInCirculation: number
  totalRewardsEarned: number
  totalRewardsRedeemed: number
  totalRewardValue: number
  redemptionsInPeriod: number
  newEnrollmentsInPeriod: number
  topLoyaltyCustomers: { customerId: string; name: string; currentPoints: number; lifetimePoints: number; totalRewardsRedeemed: number }[]
}

export interface AnalyticsData {
  orders: OrdersSummary
  payments: PaymentsSummary
  sessions: SessionsSummary
  staff: StaffRow[]
  topItems: TopItemRow[]
  topCustomers: TopCustomerRow[]
  loyalty: LoyaltySummary | null
}

export interface AnalyticsState {
  filters: AnalyticsFilters
  activePresetLabel: string | null
  data: AnalyticsData | null
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
      // Fetch orders — include payment_status to determine revenue
      const { data: ordersRaw, error: ordersErr } = await supabase
        .from('orders')
        .select('id, status, payment_status, order_type, total_amount, tax_amount, tip_amount, discount_amount, assigned_server_id, created_by_staff_id, created_at, customer_id, customer_name, customer_email')
        .eq('location_id', locationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .not('status', 'in', '("draft")')

      if (ordersErr) throw new Error(ordersErr.message)
      const orders: any[] = ordersRaw || []

      // An order is "paid" if payment_status is paid/partial/partially_refunded
      const isPaid = (o: any) =>
        ['paid', 'partial', 'partially_refunded', 'refunded'].includes(o.payment_status)
      // "Completed" for display purposes = paid OR status=completed
      const voided = orders.filter(o => o.status === 'void')
      const cancelled = orders.filter(o => o.status === 'cancelled')
      // Revenue from all orders that have been paid (any payment)
      const revenueOrders = orders.filter(o => isPaid(o))
      const totalRevenue = revenueOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
      const totalTax = revenueOrders.reduce((s, o) => s + Number(o.tax_amount || 0), 0)
      const totalTips = revenueOrders.reduce((s, o) => s + Number(o.tip_amount || 0), 0)
      const totalDiscounts = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0)

      // Orders by type — count all, revenue from paid only
      const typeMap = new Map<string, { count: number; revenue: number }>()
      orders.forEach(o => {
        const t = o.order_type || 'unknown'
        const ex = typeMap.get(t) || { count: 0, revenue: 0 }
        typeMap.set(t, {
          count: ex.count + 1,
          revenue: ex.revenue + (isPaid(o) ? Number(o.total_amount || 0) : 0)
        })
      })
      const ordersByType = Array.from(typeMap.entries())
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.count - a.count)

      const ordersSummary: OrdersSummary = {
        totalOrders: orders.length,
        completedOrders: revenueOrders.length,
        voidedOrders: voided.length,
        cancelledOrders: cancelled.length,
        totalRevenue,
        totalTax,
        totalTips,
        totalDiscounts,
        averageOrderValue: revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0,
        ordersByType,
      }

      // Fetch payments
      const { data: paymentsRaw, error: paymentsErr } = await supabase
        .from('order_payments')
        .select('id, amount, tip_amount, total_amount, payment_method, status, is_voided, is_returned, card_last_four, card_type, initiated_at, captured_at')
        .eq('location_id', locationId)
        .gte('initiated_at', startIso)
        .lte('initiated_at', endIso)

      if (paymentsErr) throw new Error(paymentsErr.message)
      const payments: any[] = paymentsRaw || []

      const approvedPayments = payments.filter(p => !p.is_voided && !p.is_returned && (p.status === 'approved' || p.status === 'settled' || p.status === 'captured'))
      const refunds = payments.filter(p => p.is_returned || p.is_voided)

      const methodMap = new Map<string, { count: number; amount: number }>()
      approvedPayments.forEach(p => {
        const m = p.payment_method || 'unknown'
        const ex = methodMap.get(m) || { count: 0, amount: 0 }
        methodMap.set(m, {
          count: ex.count + 1,
          amount: ex.amount + Number(p.total_amount || p.amount || 0)
        })
      })
      const byMethod = Array.from(methodMap.entries())
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.amount - a.amount)

      // Card/cash split of captured payments → banner totals + detail dropdowns.
      // Card = any method whose enum name starts with 'card'; cash = 'cash'.
      const isCardMethod = (m: any) => typeof m === 'string' && m.startsWith('card')
      const isCashMethod = (m: any) => m === 'cash'
      const toLineItem = (p: any): PaymentLineItem => {
        const tip = Number(p.tip_amount || 0)
        const total = Number(p.total_amount ?? (Number(p.amount || 0) + tip))
        const amount = p.amount != null ? Number(p.amount) : total - tip
        return {
          id: p.id,
          method: p.payment_method || 'unknown',
          isCard: isCardMethod(p.payment_method),
          cardBrand: p.card_type || null,
          last4: p.card_last_four || null,
          amount,
          tip,
          total,
          paidAt: p.captured_at || p.initiated_at || null,
        }
      }
      const byTimeDesc = (a: PaymentLineItem, b: PaymentLineItem) =>
        (b.paidAt || '').localeCompare(a.paidAt || '')
      const cardPayments = approvedPayments.filter(p => isCardMethod(p.payment_method)).map(toLineItem).sort(byTimeDesc)
      const cashPayments = approvedPayments.filter(p => isCashMethod(p.payment_method)).map(toLineItem).sort(byTimeDesc)
      const sumBy = (arr: PaymentLineItem[], key: 'total' | 'tip') => arr.reduce((s, x) => s + x[key], 0)

      const paymentsSummary: PaymentsSummary = {
        totalPayments: approvedPayments.length,
        totalAmount: approvedPayments.reduce((s, p) => s + Number(p.total_amount || p.amount || 0), 0),
        byMethod,
        refundCount: refunds.length,
        refundAmount: refunds.reduce((s, p) => s + Number(p.total_amount || p.amount || 0), 0),
        cardCount: cardPayments.length,
        cardTotal: sumBy(cardPayments, 'total'),
        cardTips: sumBy(cardPayments, 'tip'),
        cashCount: cashPayments.length,
        cashTotal: sumBy(cashPayments, 'total'),
        cashTips: sumBy(cashPayments, 'tip'),
        cardPayments,
        cashPayments,
      }

      // Fetch table sessions
      const { data: sessionsRaw, error: sessionsErr } = await supabase
        .from('table_sessions')
        .select('id, status, party_size, seated_at, closed_at, actual_duration')
        .eq('location_id', locationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)

      if (sessionsErr) throw new Error(sessionsErr.message)
      const sessions: any[] = sessionsRaw || []

      const totalCovers = sessions.reduce((s, ses) => s + (Number(ses.party_size) || 0), 0)

      // Duration: prefer actual_duration (seconds), fall back to seated_at→closed_at diff
      const durationsMin = sessions
        .map(s => {
          if (s.actual_duration) return Number(s.actual_duration) / 60
          if (s.seated_at && s.closed_at) {
            const diff = (new Date(s.closed_at).getTime() - new Date(s.seated_at).getTime()) / 60000
            return diff > 0 ? diff : null
          }
          return null
        })
        .filter((d): d is number => d !== null)
      const avgDuration = durationsMin.length > 0 ? durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length : 0

      const statusMap = new Map<string, number>()
      sessions.forEach(s => {
        statusMap.set(s.status || 'unknown', (statusMap.get(s.status || 'unknown') || 0) + 1)
      })
      const sessionsByStatus = Array.from(statusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count)

      const sessionsSummary: SessionsSummary = {
        totalSessions: sessions.length,
        averagePartySize: sessions.length > 0 ? totalCovers / sessions.length : 0,
        averageDurationMinutes: avgDuration,
        totalCovers,
        sessionsByStatus,
      }

      // Staff performance — group paid orders by server (fallback to created_by_staff_id)
      const staffMap = new Map<string, { orderCount: number; revenue: number }>()
      revenueOrders.forEach(o => {
        const sid = o.assigned_server_id || o.created_by_staff_id
        if (!sid) return
        const ex = staffMap.get(sid) || { orderCount: 0, revenue: 0 }
        staffMap.set(sid, {
          orderCount: ex.orderCount + 1,
          revenue: ex.revenue + Number(o.total_amount || 0)
        })
      })

      // Fetch staff names
      const staffIds = Array.from(staffMap.keys())
      let staffRows: StaffRow[] = []
      if (staffIds.length > 0) {
        const { data: staffRaw } = await supabase
          .from('staff_profiles')
          .select('id, first_name, last_name, display_name')
          .in('id', staffIds)

        staffRows = staffIds.map(id => {
          const metrics = staffMap.get(id)!
          const profile = (staffRaw || []).find((s: any) => s.id === id)
          const name = profile
            ? (profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || id)
            : id
          return {
            staffId: id,
            name,
            orderCount: metrics.orderCount,
            revenue: metrics.revenue,
            averageOrderValue: metrics.orderCount > 0 ? metrics.revenue / metrics.orderCount : 0
          }
        }).sort((a, b) => b.revenue - a.revenue)
      }

      // Fetch top selling items
      const orderIds = orders.filter(o => isPaid(o)).map((o: any) => o.id)
      let topItems: TopItemRow[] = []
      if (orderIds.length > 0) {
        const { data: itemsRaw } = await supabase
          .from('order_items')
          .select('item_name, category_name, quantity, price_paid, subtotal')
          .in('order_id', orderIds)
          .eq('is_voided', false)

        const itemMap = new Map<string, { quantity: number; revenue: number; categoryName: string | null }>()
        ;(itemsRaw || []).forEach((item: any) => {
          const name = item.item_name || 'Unknown'
          const ex = itemMap.get(name) || { quantity: 0, revenue: 0, categoryName: item.category_name || null }
          itemMap.set(name, {
            quantity: ex.quantity + Number(item.quantity || 1),
            revenue: ex.revenue + Number(item.subtotal || item.price_paid || 0),
            categoryName: ex.categoryName,
          })
        })
        topItems = Array.from(itemMap.entries())
          .map(([itemName, v]) => ({ itemName, ...v }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 15)
      }

      // Top customers — group paid orders by customer
      const customerMap = new Map<string, { name: string; orderCount: number; totalSpend: number; customerId: string | null }>()
      revenueOrders.forEach((o: any) => {
        const key = o.customer_id || o.customer_name || o.customer_email
        if (!key) return
        const name = o.customer_name || o.customer_email || 'Guest'
        const ex = customerMap.get(key) || { name, orderCount: 0, totalSpend: 0, customerId: o.customer_id || null }
        customerMap.set(key, {
          name: ex.name,
          orderCount: ex.orderCount + 1,
          totalSpend: ex.totalSpend + Number(o.total_amount || 0),
          customerId: ex.customerId,
        })
      })
      const topCustomers: TopCustomerRow[] = Array.from(customerMap.entries())
        .map(([, v]) => ({ ...v, avgSpend: v.orderCount > 0 ? v.totalSpend / v.orderCount : 0 }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 15)

      // Loyalty
      let loyalty: LoyaltySummary | null = null
      if (merchantId) {
        const { data: enrollmentsRaw } = await supabase
          .from('loyalty_enrollments')
          .select('customer_id, current_points, lifetime_points, total_rewards_earned, total_rewards_redeemed, total_reward_value, is_active, enrolled_at, last_redeem_at')
          .eq('merchant_id', merchantId)

        const enrollments: any[] = enrollmentsRaw || []
        const activeEnrollments = enrollments.filter((e: any) => e.is_active)

        // New enrollments in period
        const newInPeriod = enrollments.filter((e: any) => {
          if (!e.enrolled_at) return false
          const d = new Date(e.enrolled_at)
          return d >= dateRange.start && d <= dateRange.end
        }).length

        // Redemptions in period (last_redeem_at within range)
        const redemptionsInPeriod = enrollments.filter((e: any) => {
          if (!e.last_redeem_at) return false
          const d = new Date(e.last_redeem_at)
          return d >= dateRange.start && d <= dateRange.end
        }).length

        // Fetch customer names for top loyalty customers
        const topEnrollments = [...activeEnrollments]
          .sort((a: any, b: any) => b.current_points - a.current_points)
          .slice(0, 10)

        const loyaltyCustomerIds = topEnrollments.map((e: any) => e.customer_id)
        let loyaltyCustomerNames: Record<string, string> = {}
        if (loyaltyCustomerIds.length > 0) {
          const { data: custRaw } = await supabase
            .from('customers')
            .select('id, name')
            .in('id', loyaltyCustomerIds)
          ;(custRaw || []).forEach((c: any) => { loyaltyCustomerNames[c.id] = c.name || 'Guest' })
        }

        loyalty = {
          totalEnrolled: enrollments.length,
          activeMembers: activeEnrollments.length,
          totalPointsInCirculation: activeEnrollments.reduce((s: number, e: any) => s + Number(e.current_points || 0), 0),
          totalRewardsEarned: enrollments.reduce((s: number, e: any) => s + Number(e.total_rewards_earned || 0), 0),
          totalRewardsRedeemed: enrollments.reduce((s: number, e: any) => s + Number(e.total_rewards_redeemed || 0), 0),
          totalRewardValue: enrollments.reduce((s: number, e: any) => s + Number(e.total_reward_value || 0), 0),
          redemptionsInPeriod,
          newEnrollmentsInPeriod: newInPeriod,
          topLoyaltyCustomers: topEnrollments.map((e: any) => ({
            customerId: e.customer_id,
            name: loyaltyCustomerNames[e.customer_id] || 'Guest',
            currentPoints: Number(e.current_points || 0),
            lifetimePoints: Number(e.lifetime_points || 0),
            totalRewardsRedeemed: Number(e.total_rewards_redeemed || 0),
          })),
        }
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
        isLoading: false,
      })
    } catch (err: any) {
      set({ error: err.message || 'Failed to load analytics', isLoading: false })
    }
  }
}))
