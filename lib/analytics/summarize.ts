/**
 * The analytics reductions, as pure functions over raw server rows.
 *
 * These were inline in `useAnalyticsStore.fetchData`. They are extracted here
 * for one reason, and it is the reason the whole local-analytics phase hangs
 * on: the Phase 5 acceptance bar for this page is
 *
 *   > Numbers must match the server dashboard exactly.
 *
 * A local SQL aggregate and a JS reduce over PostgREST rows can only be shown
 * to agree if BOTH are reachable from a test. While the reduce lived inside an
 * async store action that takes a Supabase client, it was not — the only way
 * to check agreement was to run the two side by side on a tablet and squint.
 * With the reduce out here as a function of its rows, the property becomes an
 * assertion: seed the mirror from the same rows, and
 * `queryLocalAnalytics(...)` must equal `summarizeX(rows)`.
 *
 * So this module is deliberately NOT "shared logic the local path also calls".
 * The local path computes its numbers in SQL (lib/db/analyticsQuery.ts) — that
 * is the whole point of mirroring. These functions stay the SERVER path's
 * implementation and the test's reference implementation, nothing more. If the
 * two ever disagree, the test fails, which is the outcome this split exists to
 * produce.
 *
 * Every quirk below is preserved verbatim, including the ones that look like
 * bugs (see PAYMENT_APPROVED_STATUSES). Faithfulness beats correctness here:
 * a local path that quietly fixes something the server path gets wrong shows a
 * merchant two different totals for the same day, which is worse than one
 * consistent wrong total. Fixes belong in both paths, in one commit, with the
 * test updated to match.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export interface OrdersSummary {
  totalOrders: number;
  completedOrders: number;
  voidedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalTips: number;
  totalDiscounts: number;
  averageOrderValue: number;
  ordersByType: { type: string; count: number; revenue: number }[];
}

/** A single captured payment, surfaced for the card/cash detail dropdowns. */
export interface PaymentLineItem {
  id: string;
  method: string; // raw payment_method (e.g. 'card', 'card_spinapi', 'cash')
  isCard: boolean;
  cardBrand: string | null; // card_type (Visa, Mastercard, …)
  last4: string | null; // card_last_four
  amount: number; // base amount captured (excludes tip)
  tip: number; // tip_amount
  total: number; // amount + tip actually collected
  paidAt: string | null; // captured_at ?? initiated_at (ISO)
}

export interface PaymentsSummary {
  totalPayments: number;
  totalAmount: number;
  byMethod: { method: string; count: number; amount: number }[];
  refundCount: number;
  refundAmount: number;
  // Captured payments split into card vs cash for the business-day banner
  cardCount: number;
  cardTotal: number;
  cardTips: number;
  cashCount: number;
  cashTotal: number;
  cashTips: number;
  cardPayments: PaymentLineItem[];
  cashPayments: PaymentLineItem[];
}

export interface SessionsSummary {
  totalSessions: number;
  averagePartySize: number;
  averageDurationMinutes: number;
  totalCovers: number;
  sessionsByStatus: { status: string; count: number }[];
}

export interface StaffRow {
  staffId: string;
  name: string;
  orderCount: number;
  revenue: number;
  averageOrderValue: number;
}

export interface TopItemRow {
  itemName: string;
  quantity: number;
  revenue: number;
  categoryName: string | null;
}

export interface TopCustomerRow {
  customerId: string | null;
  name: string;
  orderCount: number;
  totalSpend: number;
  avgSpend: number;
}

export interface LoyaltySummary {
  totalEnrolled: number;
  activeMembers: number;
  totalPointsInCirculation: number;
  totalRewardsEarned: number;
  totalRewardsRedeemed: number;
  totalRewardValue: number;
  redemptionsInPeriod: number;
  newEnrollmentsInPeriod: number;
  topLoyaltyCustomers: {
    customerId: string;
    name: string;
    currentPoints: number;
    lifetimePoints: number;
    totalRewardsRedeemed: number;
  }[];
}

/** How many rows the Items and Customers tables show. */
export const TOP_ROW_LIMIT = 15;

/**
 * `payment_status` values that count an order's money as real revenue.
 * 'refunded' is included: the order WAS paid, and the refund is accounted for
 * on the payments side rather than by erasing the sale.
 */
export const PAID_ORDER_STATUSES = [
  "paid",
  "partial",
  "partially_refunded",
  "refunded",
] as const;

/**
 * Payment `status` values that count as captured.
 *
 * ONLY 'captured' is a real member of the remote `payment_status` enum —
 * 'approved' and 'settled' do not exist in it (see database.types.ts:
 * pending, processing, authorized, captured, failed, declined, refunded,
 * partially_refunded, void, paid, partial). The two dead values are kept
 * because removing them is a BEHAVIOUR change to the server dashboard, not a
 * cleanup, and this phase's contract is that the local numbers match what the
 * server path produces today. Both paths read this constant, so a later fix
 * lands on both at once.
 */
export const PAYMENT_APPROVED_STATUSES = [
  "approved",
  "settled",
  "captured",
] as const;

/** An order whose money counts toward revenue. */
export function isPaidOrder(o: { payment_status?: string | null }): boolean {
  return (PAID_ORDER_STATUSES as readonly string[]).includes(
    o.payment_status as string,
  );
}

/** Card = any method whose enum name starts with 'card'. */
export function isCardMethod(m: unknown): boolean {
  return typeof m === "string" && m.startsWith("card");
}

export function isCashMethod(m: unknown): boolean {
  return m === "cash";
}

/** Captured, not voided, not returned. */
export function isApprovedPayment(p: {
  status?: string | null;
  is_voided?: boolean | null;
  is_returned?: boolean | null;
}): boolean {
  return (
    !p.is_voided &&
    !p.is_returned &&
    (PAYMENT_APPROVED_STATUSES as readonly string[]).includes(
      p.status as string,
    )
  );
}

/** Voided or returned — the refund side of the payments summary. */
export function isRefundPayment(p: {
  is_voided?: boolean | null;
  is_returned?: boolean | null;
}): boolean {
  return !!(p.is_returned || p.is_voided);
}

type OrderLike = Record<string, any>;
type PaymentLike = Record<string, any>;
type SessionLike = Record<string, any>;
type ItemLike = Record<string, any>;

export function summarizeOrders(orders: OrderLike[]): OrdersSummary {
  const voided = orders.filter((o) => o.status === "void");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const revenueOrders = orders.filter((o) => isPaidOrder(o));

  const totalRevenue = revenueOrders.reduce(
    (s, o) => s + Number(o.total_amount || 0),
    0,
  );
  const totalTax = revenueOrders.reduce(
    (s, o) => s + Number(o.tax_amount || 0),
    0,
  );
  const totalTips = revenueOrders.reduce(
    (s, o) => s + Number(o.tip_amount || 0),
    0,
  );
  // Deliberately over ALL orders, not just paid ones.
  const totalDiscounts = orders.reduce(
    (s, o) => s + Number(o.discount_amount || 0),
    0,
  );

  // Orders by type — count all, revenue from paid only.
  const typeMap = new Map<string, { count: number; revenue: number }>();
  orders.forEach((o) => {
    const t = o.order_type || "unknown";
    const ex = typeMap.get(t) || { count: 0, revenue: 0 };
    typeMap.set(t, {
      count: ex.count + 1,
      revenue: ex.revenue + (isPaidOrder(o) ? Number(o.total_amount || 0) : 0),
    });
  });
  const ordersByType = Array.from(typeMap.entries())
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.count - a.count);

  return {
    totalOrders: orders.length,
    completedOrders: revenueOrders.length,
    voidedOrders: voided.length,
    cancelledOrders: cancelled.length,
    totalRevenue,
    totalTax,
    totalTips,
    totalDiscounts,
    averageOrderValue:
      revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0,
    ordersByType,
  };
}

export function toPaymentLineItem(p: PaymentLike): PaymentLineItem {
  const tip = Number(p.tip_amount || 0);
  const total = Number(p.total_amount ?? Number(p.amount || 0) + tip);
  const amount = p.amount != null ? Number(p.amount) : total - tip;
  return {
    id: p.id,
    method: p.payment_method || "unknown",
    isCard: isCardMethod(p.payment_method),
    cardBrand: p.card_type || null,
    last4: p.card_last_four || null,
    amount,
    tip,
    total,
    paidAt: p.captured_at || p.initiated_at || null,
  };
}

/** Newest captured first. */
export function byPaidAtDesc(a: PaymentLineItem, b: PaymentLineItem): number {
  return (b.paidAt || "").localeCompare(a.paidAt || "");
}

export function summarizePayments(payments: PaymentLike[]): PaymentsSummary {
  const approved = payments.filter(isApprovedPayment);
  const refunds = payments.filter(isRefundPayment);

  const methodMap = new Map<string, { count: number; amount: number }>();
  approved.forEach((p) => {
    const m = p.payment_method || "unknown";
    const ex = methodMap.get(m) || { count: 0, amount: 0 };
    methodMap.set(m, {
      count: ex.count + 1,
      amount: ex.amount + Number(p.total_amount || p.amount || 0),
    });
  });
  const byMethod = Array.from(methodMap.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount);

  const cardPayments = approved
    .filter((p) => isCardMethod(p.payment_method))
    .map(toPaymentLineItem)
    .sort(byPaidAtDesc);
  const cashPayments = approved
    .filter((p) => isCashMethod(p.payment_method))
    .map(toPaymentLineItem)
    .sort(byPaidAtDesc);
  const sumBy = (arr: PaymentLineItem[], key: "total" | "tip") =>
    arr.reduce((s, x) => s + x[key], 0);

  return {
    totalPayments: approved.length,
    totalAmount: approved.reduce(
      (s, p) => s + Number(p.total_amount || p.amount || 0),
      0,
    ),
    byMethod,
    refundCount: refunds.length,
    refundAmount: refunds.reduce(
      (s, p) => s + Number(p.total_amount || p.amount || 0),
      0,
    ),
    cardCount: cardPayments.length,
    cardTotal: sumBy(cardPayments, "total"),
    cardTips: sumBy(cardPayments, "tip"),
    cashCount: cashPayments.length,
    cashTotal: sumBy(cashPayments, "total"),
    cashTips: sumBy(cashPayments, "tip"),
    cardPayments,
    cashPayments,
  };
}

export function summarizeSessions(sessions: SessionLike[]): SessionsSummary {
  const totalCovers = sessions.reduce(
    (s, ses) => s + (Number(ses.party_size) || 0),
    0,
  );

  // Prefer actual_duration (seconds), fall back to seated_at → closed_at.
  const durationsMin = sessions
    .map((s) => {
      if (s.actual_duration) return Number(s.actual_duration) / 60;
      if (s.seated_at && s.closed_at) {
        const diff =
          (new Date(s.closed_at).getTime() - new Date(s.seated_at).getTime()) /
          60000;
        return diff > 0 ? diff : null;
      }
      return null;
    })
    .filter((d): d is number => d !== null);
  const avgDuration =
    durationsMin.length > 0
      ? durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length
      : 0;

  const statusMap = new Map<string, number>();
  sessions.forEach((s) => {
    const key = s.status || "unknown";
    statusMap.set(key, (statusMap.get(key) || 0) + 1);
  });
  const sessionsByStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSessions: sessions.length,
    averagePartySize: sessions.length > 0 ? totalCovers / sessions.length : 0,
    averageDurationMinutes: avgDuration,
    totalCovers,
    sessionsByStatus,
  };
}

/**
 * Per-staff order counts and revenue, keyed by staff_profiles.id.
 *
 * Names are resolved by the CALLER, because the two paths have different name
 * sources: the server path selects `staff_profiles`, the local path reads the
 * MMKV-persisted employee roster (there is no staff mirror). Splitting the
 * metric from the label keeps the number identical on both paths even when the
 * label is not resolvable offline.
 */
export function summarizeStaffMetrics(
  revenueOrders: OrderLike[],
): Map<string, { orderCount: number; revenue: number }> {
  const staffMap = new Map<string, { orderCount: number; revenue: number }>();
  revenueOrders.forEach((o) => {
    const sid = o.assigned_server_id || o.created_by_staff_id;
    if (!sid) return;
    const ex = staffMap.get(sid) || { orderCount: 0, revenue: 0 };
    staffMap.set(sid, {
      orderCount: ex.orderCount + 1,
      revenue: ex.revenue + Number(o.total_amount || 0),
    });
  });
  return staffMap;
}

/** Metrics + a name resolver → the rendered Staff tab rows. */
export function buildStaffRows(
  metrics: Map<string, { orderCount: number; revenue: number }>,
  resolveName: (staffId: string) => string,
): StaffRow[] {
  return Array.from(metrics.entries())
    .map(([staffId, m]) => ({
      staffId,
      name: resolveName(staffId),
      orderCount: m.orderCount,
      revenue: m.revenue,
      averageOrderValue: m.orderCount > 0 ? m.revenue / m.orderCount : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function summarizeTopItems(items: ItemLike[]): TopItemRow[] {
  const itemMap = new Map<
    string,
    { quantity: number; revenue: number; categoryName: string | null }
  >();
  items.forEach((item) => {
    const name = item.item_name || "Unknown";
    const ex = itemMap.get(name) || {
      quantity: 0,
      revenue: 0,
      // First occurrence wins — a name that appears under two categories keeps
      // the category it was first seen with.
      categoryName: item.category_name || null,
    };
    itemMap.set(name, {
      // `|| 1`, not `?? 1`: a quantity of 0 counts as 1, matching the server.
      quantity: ex.quantity + Number(item.quantity || 1),
      revenue: ex.revenue + Number(item.subtotal || item.price_paid || 0),
      categoryName: ex.categoryName,
    });
  });
  return Array.from(itemMap.entries())
    .map(([itemName, v]) => ({ itemName, ...v }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, TOP_ROW_LIMIT);
}

export function summarizeTopCustomers(
  revenueOrders: OrderLike[],
): TopCustomerRow[] {
  const customerMap = new Map<
    string,
    {
      name: string;
      orderCount: number;
      totalSpend: number;
      customerId: string | null;
    }
  >();
  revenueOrders.forEach((o) => {
    // Identity is the customer id when there is one, otherwise the name, then
    // the email — a walk-in with a name but no record still aggregates.
    const key = o.customer_id || o.customer_name || o.customer_email;
    if (!key) return;
    const name = o.customer_name || o.customer_email || "Guest";
    const ex = customerMap.get(key) || {
      name,
      orderCount: 0,
      totalSpend: 0,
      customerId: o.customer_id || null,
    };
    customerMap.set(key, {
      name: ex.name,
      orderCount: ex.orderCount + 1,
      totalSpend: ex.totalSpend + Number(o.total_amount || 0),
      customerId: ex.customerId,
    });
  });
  return Array.from(customerMap.entries())
    .map(([, v]) => ({
      ...v,
      avgSpend: v.orderCount > 0 ? v.totalSpend / v.orderCount : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, TOP_ROW_LIMIT);
}

export function summarizeLoyalty(
  enrollments: Record<string, any>[],
  names: Record<string, string>,
  range: DateRange,
): LoyaltySummary {
  const active = enrollments.filter((e) => e.is_active);
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= range.start && d <= range.end;
  };

  const topEnrollments = [...active]
    .sort((a, b) => b.current_points - a.current_points)
    .slice(0, 10);

  return {
    totalEnrolled: enrollments.length,
    activeMembers: active.length,
    totalPointsInCirculation: active.reduce(
      (s, e) => s + Number(e.current_points || 0),
      0,
    ),
    totalRewardsEarned: enrollments.reduce(
      (s, e) => s + Number(e.total_rewards_earned || 0),
      0,
    ),
    totalRewardsRedeemed: enrollments.reduce(
      (s, e) => s + Number(e.total_rewards_redeemed || 0),
      0,
    ),
    totalRewardValue: enrollments.reduce(
      (s, e) => s + Number(e.total_reward_value || 0),
      0,
    ),
    redemptionsInPeriod: enrollments.filter((e) => inRange(e.last_redeem_at))
      .length,
    newEnrollmentsInPeriod: enrollments.filter((e) => inRange(e.enrolled_at))
      .length,
    topLoyaltyCustomers: topEnrollments.map((e) => ({
      customerId: e.customer_id,
      name: names[e.customer_id] || "Guest",
      currentPoints: Number(e.current_points || 0),
      lifetimePoints: Number(e.lifetime_points || 0),
      totalRewardsRedeemed: Number(e.total_rewards_redeemed || 0),
    })),
  };
}
