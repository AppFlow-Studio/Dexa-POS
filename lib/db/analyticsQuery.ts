/**
 * The LOCAL half of the analytics dashboard — SQL aggregates over the orders
 * mirror, standing in for 11 of the 13 network round trips the page makes.
 *
 * Its counterpart is lib/analytics/summarize.ts, which is the SERVER path's
 * reduction over PostgREST rows. Those two must produce the same numbers from
 * the same data, and __tests__/db/analyticsQuery.test.ts asserts exactly that
 * against a real SQL engine. Every predicate below is therefore written to
 * mirror a specific line over there, and the comments name which — if one side
 * changes, the other has to, and the test is what enforces it.
 *
 * THREE SEMANTIC TRAPS this file exists to get right:
 *
 * ① PostgREST's NULL behaviour. `.not('status','in','("draft")')` is
 *    `NOT (status IN ('draft'))` and `.eq('is_voided', false)` is
 *    `is_voided = false`; both evaluate to NULL — and so EXCLUDE the row — when
 *    the column is NULL. SQLite's three-valued logic agrees exactly, so the
 *    plain `!=` / `= 0` forms below are already faithful and need no NULL arm.
 *    What is NOT faithful is the form a reader reaches for instinctively:
 *    `is_voided IS NOT 1` means "not voided" in English and MATCHES NULL rows,
 *    which would count items the server dashboard does not. That is the arm
 *    the tests pin, and it is the same shape of mistake historyQuery.ts
 *    documents for `neq`.
 *
 * ② Falsy-vs-nullish. The server reduce uses `total_amount || amount` in one
 *    place and `total_amount ?? amount + tip` in another, so a payment with a
 *    total of exactly 0 behaves differently in the two. That is preserved:
 *    `NULLIF(x, 0)` for the `||` sites, plain `COALESCE` for the `??` ones.
 *
 * ③ Money never touches a float. Every sum is over an INTEGER `*_minor`
 *    column, which is exact for any number of rows; the single divide by 100
 *    happens once, at the boundary, through lib/db/money.ts. Reading
 *    `json_extract(payload, '$.total_amount')` instead would hand SQLite a
 *    REAL and put currency through IEEE-754 — the thing the project rule
 *    forbids, and the reason schema v9 promoted two more columns rather than
 *    reaching into the payload.
 *
 * Rows OUTSIDE the mirror's retention window are not an error here, they are a
 * coverage fact: `getOrdersMirrorState().retentionFloor` is returned alongside
 * the numbers so the caller can say "older data needs a connection" instead of
 * under-reporting revenue in silence.
 */
import {
  PAID_ORDER_STATUSES,
  PAYMENT_APPROVED_STATUSES,
  TOP_ROW_LIMIT,
  byPaidAtDesc,
  isCardMethod,
  isCashMethod,
  type OrdersSummary,
  type PaymentLineItem,
  type PaymentsSummary,
  type TopCustomerRow,
  type TopItemRow,
} from "@/lib/analytics/summarize";
import {
  getReadDb,
  hasDedicatedReadConnection,
} from "@/lib/db/index";
import { fromMinor } from "@/lib/db/money";
import { dbWriteMutex } from "@/lib/db/write";

type SqlValue = string | number | null;

export interface AnalyticsWindow {
  locationId: string;
  /** Inclusive lower bound on orders.created_at (ISO). */
  startIso: string;
  /**
   * INCLUSIVE upper bound (ISO). The server path uses `.lte`, not `.lt` —
   * unlike Previous Orders, which is half-open. Getting this wrong shifts a
   * business-day total by whatever landed on the final millisecond.
   */
  endIso: string;
}

/**
 * Everything the analytics page can answer from disk.
 *
 * `sessions` and `loyalty` are deliberately absent: `table_sessions` is not
 * mirrored (its `updated_at` is nullable, so it has no usable keyset
 * watermark) and the loyalty summary is not rendered by any tab. The caller
 * tops sessions up from the network when there is one.
 */
export interface LocalAnalyticsResult {
  orders: OrdersSummary;
  payments: PaymentsSummary;
  topItems: TopItemRow[];
  topCustomers: TopCustomerRow[];
  /** staff_profiles.id → metrics. Names are resolved by the caller. */
  staffMetrics: Map<string, { orderCount: number; revenue: number }>;
}

/** Same read-connection rule as historyQuery: mutex only on the fallback. */
function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}

function quoteList(values: readonly string[]): string {
  return `(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
}

const PAID_LIST = quoteList(PAID_ORDER_STATUSES);
const APPROVED_LIST = quoteList(PAYMENT_APPROVED_STATUSES);

/**
 * The order window, mirroring the server's four filters exactly:
 * `.eq(location_id)`, `.gte(created_at)`, `.lte(created_at)` and
 * `.not(status, in, (draft))`.
 *
 * `status != 'draft'` drops a NULL status on its own — trap ① — which is what
 * PostgREST does too. Do not "fix" it into `(status IS NULL OR status !=
 * 'draft')`: that would start counting NULL-status rows the server dashboard
 * leaves out.
 */
const ORDER_WINDOW_SQL = `o.location_id = ?
    AND o.created_at >= ?
    AND o.created_at <= ?
    AND o.status != 'draft'`;

/** `isPaidOrder` from summarize.ts, as SQL. */
const PAID_SQL = `o.payment_status IN ${PAID_LIST}`;

/** `x || 'unknown'` — JS treats an empty string as falsy, SQL does not. */
function orElse(column: string, fallback: string): string {
  return `CASE WHEN ${column} IS NULL OR ${column} = '' THEN '${fallback}' ELSE ${column} END`;
}

function windowParams(w: AnalyticsWindow): SqlValue[] {
  return [w.locationId, w.startIso, w.endIso];
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** Minor units → the major-unit `number` the summary types carry. */
function major(minor: unknown): number {
  return fromMinor(num(minor))?.toNumber() ?? 0;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

interface OrderTotalsRow {
  total_orders: number;
  completed_orders: number;
  voided_orders: number;
  cancelled_orders: number;
  revenue_minor: number | null;
  tax_minor: number | null;
  tips_minor: number | null;
  discounts_minor: number | null;
}

export const ORDER_TOTALS_SQL = `
  SELECT
    COUNT(*)                                                        AS total_orders,
    SUM(CASE WHEN ${PAID_SQL} THEN 1 ELSE 0 END)                    AS completed_orders,
    SUM(CASE WHEN o.status = 'void' THEN 1 ELSE 0 END)              AS voided_orders,
    SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END)         AS cancelled_orders,
    SUM(CASE WHEN ${PAID_SQL} THEN COALESCE(o.total_amount_minor, 0) ELSE 0 END)   AS revenue_minor,
    SUM(CASE WHEN ${PAID_SQL} THEN COALESCE(o.tax_amount_minor, 0)  ELSE 0 END)    AS tax_minor,
    SUM(CASE WHEN ${PAID_SQL} THEN COALESCE(o.tip_amount_minor, 0)  ELSE 0 END)    AS tips_minor,
    -- Discounts are summed over EVERY order in the window, paid or not. That
    -- asymmetry is in the server reduce too; it is not a transcription slip.
    SUM(COALESCE(o.discount_amount_minor, 0))                       AS discounts_minor
  FROM orders o
  WHERE ${ORDER_WINDOW_SQL}`;

export const ORDERS_BY_TYPE_SQL = `
  SELECT ${orElse("o.order_type", "unknown")} AS type,
         COUNT(*) AS count,
         SUM(CASE WHEN ${PAID_SQL} THEN COALESCE(o.total_amount_minor, 0) ELSE 0 END) AS revenue_minor
  FROM orders o
  WHERE ${ORDER_WINDOW_SQL}
  GROUP BY type
  -- The name tiebreak has no server counterpart: JS Map order there is the
  -- arbitrary order PostgREST returned rows in. Deterministic is strictly
  -- better than arbitrary — it stops the chart reshuffling between refreshes.
  ORDER BY count DESC, type ASC`;

// ---------------------------------------------------------------------------
// Payments — scoped by location + initiated_at, INDEPENDENTLY of the parent
// order's created_at, exactly as the server query is.
// ---------------------------------------------------------------------------

const PAYMENT_WINDOW_SQL = `p.location_id = ?
    AND p.initiated_at >= ?
    AND p.initiated_at <= ?`;

/**
 * `!is_voided && !is_returned` — a NULL flag is falsy in JS, so `IS NOT 1`
 * (which matches NULL and 0) is the faithful translation here. Contrast the
 * items query, where the server used `.eq(false)` and NULL must be excluded.
 */
const APPROVED_SQL = `p.is_voided IS NOT 1
    AND p.is_returned IS NOT 1
    AND p.status IN ${APPROVED_LIST}`;

/** `is_returned || is_voided` — truthy, so only a literal 1 counts. */
const REFUND_SQL = `(p.is_returned IS 1 OR p.is_voided IS 1)`;

/** `total_amount || amount || 0` — trap ②: a 0 total falls through to amount. */
const PAYMENT_AMOUNT_SQL = `COALESCE(NULLIF(p.total_amount_minor, 0), p.amount_minor, 0)`;

export const PAYMENT_TOTALS_SQL = `
  SELECT
    SUM(CASE WHEN ${APPROVED_SQL} THEN 1 ELSE 0 END)                       AS approved_count,
    SUM(CASE WHEN ${APPROVED_SQL} THEN ${PAYMENT_AMOUNT_SQL} ELSE 0 END)   AS approved_minor,
    SUM(CASE WHEN ${REFUND_SQL}   THEN 1 ELSE 0 END)                       AS refund_count,
    SUM(CASE WHEN ${REFUND_SQL}   THEN ${PAYMENT_AMOUNT_SQL} ELSE 0 END)   AS refund_minor
  FROM order_payments p
  WHERE ${PAYMENT_WINDOW_SQL}`;

export const PAYMENTS_BY_METHOD_SQL = `
  SELECT ${orElse("p.payment_method", "unknown")} AS method,
         COUNT(*) AS count,
         SUM(${PAYMENT_AMOUNT_SQL}) AS amount_minor
  FROM order_payments p
  WHERE ${PAYMENT_WINDOW_SQL} AND ${APPROVED_SQL}
  GROUP BY method
  ORDER BY amount_minor DESC, method ASC`;

/**
 * The captured card/cash rows behind the Payments tab dropdowns.
 *
 * Uncapped, matching the server path — the list IS the feature, and a cap
 * would silently drop payments from a reconciliation screen. It is bounded in
 * practice by the window: a business day, which is what this page defaults to.
 */
export const PAYMENT_LINE_ITEMS_SQL = `
  SELECT p.id, p.payment_method, p.card_type, p.card_last_four,
         p.amount_minor, p.tip_amount_minor, p.total_amount_minor,
         p.captured_at, p.initiated_at
  FROM order_payments p
  WHERE ${PAYMENT_WINDOW_SQL} AND ${APPROVED_SQL}
    AND (p.payment_method LIKE 'card%' OR p.payment_method = 'cash')`;

interface PaymentLineRow {
  id: string;
  payment_method: string | null;
  card_type: string | null;
  card_last_four: string | null;
  amount_minor: number | null;
  tip_amount_minor: number | null;
  total_amount_minor: number | null;
  captured_at: string | null;
  initiated_at: string | null;
}

/**
 * Mirror row → PaymentLineItem, reproducing `toPaymentLineItem` including its
 * `??`/`||` asymmetry: `total_amount ?? (amount + tip)` keeps a 0 total, while
 * `amount != null ? amount : total - tip` keeps a 0 amount.
 */
function toLineItem(r: PaymentLineRow): PaymentLineItem {
  const tip = major(r.tip_amount_minor ?? 0);
  const total =
    r.total_amount_minor !== null && r.total_amount_minor !== undefined
      ? major(r.total_amount_minor)
      : major(r.amount_minor ?? 0) + tip;
  const amount = r.amount_minor !== null ? major(r.amount_minor) : total - tip;
  return {
    id: r.id,
    method: r.payment_method || "unknown",
    isCard: isCardMethod(r.payment_method),
    cardBrand: r.card_type || null,
    last4: r.card_last_four || null,
    amount,
    tip,
    total,
    paidAt: r.captured_at || r.initiated_at || null,
  };
}

// ---------------------------------------------------------------------------
// Items / customers / staff
// ---------------------------------------------------------------------------

/**
 * `.eq('is_voided', false)` on the server EXCLUDES a NULL — trap ①. `= 0` is
 * the faithful translation, since `NULL = 0` is NULL and therefore unmatched.
 *
 * THE REDUNDANT-LOOKING FIRST CONJUNCT IS LOAD-BEARING, and it is a query-plan
 * fact rather than a semantic one. `idx_oi_order` is PARTIAL
 * (`WHERE is_voided IS NOT 1`), and SQLite will only use a partial index when
 * the query's WHERE clause SYNTACTICALLY implies the index predicate — it does
 * not reason that `= 0` implies `IS NOT 1`. Written as `= 0` alone the planner
 * emits `SCAN oi`: a full scan of every order item the mirror holds, once per
 * query, which at the 20k-order retention cap is ~50k rows to answer a Top
 * Items list. With `IS NOT 1` present it emits
 * `SEARCH oi USING INDEX idx_oi_order (order_id=?)`.
 *
 * The two conjuncts together select exactly the same rows as `= 0` — verified,
 * not assumed: see the query-plan and NULL-flag cases in the test.
 */
const ITEM_NOT_VOIDED_SQL = `oi.is_voided IS NOT 1 AND oi.is_voided = 0`;

export const TOP_ITEMS_SQL = `
  SELECT ${orElse("oi.item_name", "Unknown")} AS item_name,
         -- "quantity || 1" on the server: a 0 or NULL quantity counts as one.
         SUM(CASE WHEN COALESCE(oi.quantity, 0) = 0 THEN 1 ELSE oi.quantity END) AS quantity,
         -- "subtotal || price_paid || 0" — trap ②, hence NULLIF on subtotal.
         SUM(COALESCE(NULLIF(oi.subtotal_minor, 0), oi.price_paid_minor, 0))     AS revenue_minor,
         -- The server keeps the category of whichever row arrived first, which
         -- is arbitrary; MAX is deterministic and skips NULLs.
         MAX(oi.category_name) AS category_name
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE ${ORDER_WINDOW_SQL} AND ${PAID_SQL} AND ${ITEM_NOT_VOIDED_SQL}
  GROUP BY item_name
  ORDER BY quantity DESC, item_name ASC
  LIMIT ${TOP_ROW_LIMIT}`;

/** `customer_id || customer_name || customer_email`, empty strings falsy. */
const CUSTOMER_KEY_SQL = `COALESCE(
    NULLIF(o.customer_id, ''),
    NULLIF(o.customer_name, ''),
    NULLIF(o.customer_email, ''))`;

export const TOP_CUSTOMERS_SQL = `
  SELECT ${CUSTOMER_KEY_SQL} AS customer_key,
         COUNT(*) AS order_count,
         SUM(COALESCE(o.total_amount_minor, 0)) AS spend_minor,
         -- Within a group keyed by customer_id every row carries that same id,
         -- and within one keyed by name the id is NULL on every row, so MAX
         -- resolves both cases without a quirk.
         MAX(o.customer_id) AS customer_id,
         MAX(COALESCE(NULLIF(o.customer_name, ''), NULLIF(o.customer_email, ''))) AS display_name
  FROM orders o
  WHERE ${ORDER_WINDOW_SQL} AND ${PAID_SQL} AND ${CUSTOMER_KEY_SQL} IS NOT NULL
  GROUP BY customer_key
  ORDER BY spend_minor DESC, customer_key ASC
  LIMIT ${TOP_ROW_LIMIT}`;

/** `assigned_server_id || created_by_staff_id`. */
const STAFF_KEY_SQL = `COALESCE(
    NULLIF(o.assigned_server_id, ''),
    NULLIF(o.created_by_staff_id, ''))`;

export const STAFF_METRICS_SQL = `
  SELECT ${STAFF_KEY_SQL} AS staff_id,
         COUNT(*) AS order_count,
         SUM(COALESCE(o.total_amount_minor, 0)) AS revenue_minor
  FROM orders o
  WHERE ${ORDER_WINDOW_SQL} AND ${PAID_SQL} AND ${STAFF_KEY_SQL} IS NOT NULL
  GROUP BY staff_id`;

// ---------------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------------

/**
 * Every summary the mirror can answer, in one pass. Returns null when the
 * local DB is unavailable — the caller falls back to the server path, exactly
 * like Previous Orders does.
 */
export async function queryLocalAnalytics(
  w: AnalyticsWindow,
): Promise<LocalAnalyticsResult | null> {
  const db = getReadDb();
  if (!db) return null;

  return runOnRead(async () => {
    const op = windowParams(w);

    const [
      totals,
      byType,
      payTotals,
      byMethod,
      lineRows,
      itemRows,
      customerRows,
      staffRows,
    ] = await Promise.all([
      db.getFirstAsync<OrderTotalsRow>(ORDER_TOTALS_SQL, op),
      db.getAllAsync<{ type: string; count: number; revenue_minor: number }>(
        ORDERS_BY_TYPE_SQL,
        op,
      ),
      db.getFirstAsync<{
        approved_count: number | null;
        approved_minor: number | null;
        refund_count: number | null;
        refund_minor: number | null;
      }>(PAYMENT_TOTALS_SQL, op),
      db.getAllAsync<{ method: string; count: number; amount_minor: number }>(
        PAYMENTS_BY_METHOD_SQL,
        op,
      ),
      db.getAllAsync<PaymentLineRow>(PAYMENT_LINE_ITEMS_SQL, op),
      db.getAllAsync<{
        item_name: string;
        quantity: number;
        revenue_minor: number;
        category_name: string | null;
      }>(TOP_ITEMS_SQL, op),
      db.getAllAsync<{
        customer_key: string;
        order_count: number;
        spend_minor: number;
        customer_id: string | null;
        display_name: string | null;
      }>(TOP_CUSTOMERS_SQL, op),
      db.getAllAsync<{
        staff_id: string;
        order_count: number;
        revenue_minor: number;
      }>(STAFF_METRICS_SQL, op),
    ]);

    const totalOrders = num(totals?.total_orders);
    const completedOrders = num(totals?.completed_orders);
    const totalRevenue = major(totals?.revenue_minor);

    const orders: OrdersSummary = {
      totalOrders,
      completedOrders,
      voidedOrders: num(totals?.voided_orders),
      cancelledOrders: num(totals?.cancelled_orders),
      totalRevenue,
      totalTax: major(totals?.tax_minor),
      totalTips: major(totals?.tips_minor),
      totalDiscounts: major(totals?.discounts_minor),
      averageOrderValue:
        completedOrders > 0 ? totalRevenue / completedOrders : 0,
      ordersByType: byType.map((r) => ({
        type: r.type,
        count: num(r.count),
        revenue: major(r.revenue_minor),
      })),
    };

    // Sorted in JS through the SHARED comparator rather than in SQL, so the
    // ordering is provably the same function the server path uses instead of
    // SQLite's collation happening to agree with String.localeCompare.
    const allLines = lineRows.map(toLineItem);
    const cardPayments = allLines
      .filter((l) => isCardMethod(l.method))
      .sort(byPaidAtDesc);
    const cashPayments = allLines
      .filter((l) => isCashMethod(l.method))
      .sort(byPaidAtDesc);
    const sumBy = (arr: PaymentLineItem[], key: "total" | "tip") =>
      arr.reduce((s, x) => s + x[key], 0);

    const payments: PaymentsSummary = {
      totalPayments: num(payTotals?.approved_count),
      totalAmount: major(payTotals?.approved_minor),
      byMethod: byMethod.map((r) => ({
        method: r.method,
        count: num(r.count),
        amount: major(r.amount_minor),
      })),
      refundCount: num(payTotals?.refund_count),
      refundAmount: major(payTotals?.refund_minor),
      cardCount: cardPayments.length,
      cardTotal: sumBy(cardPayments, "total"),
      cardTips: sumBy(cardPayments, "tip"),
      cashCount: cashPayments.length,
      cashTotal: sumBy(cashPayments, "total"),
      cashTips: sumBy(cashPayments, "tip"),
      cardPayments,
      cashPayments,
    };

    const topItems: TopItemRow[] = itemRows.map((r) => ({
      itemName: r.item_name,
      quantity: num(r.quantity),
      revenue: major(r.revenue_minor),
      categoryName: r.category_name ?? null,
    }));

    const topCustomers: TopCustomerRow[] = customerRows.map((r) => {
      const orderCount = num(r.order_count);
      const totalSpend = major(r.spend_minor);
      return {
        customerId: r.customer_id ?? null,
        name: r.display_name || "Guest",
        orderCount,
        totalSpend,
        avgSpend: orderCount > 0 ? totalSpend / orderCount : 0,
      };
    });

    const staffMetrics = new Map<
      string,
      { orderCount: number; revenue: number }
    >();
    for (const r of staffRows) {
      staffMetrics.set(r.staff_id, {
        orderCount: num(r.order_count),
        revenue: major(r.revenue_minor),
      });
    }

    return { orders, payments, topItems, topCustomers, staffMetrics };
  });
}
