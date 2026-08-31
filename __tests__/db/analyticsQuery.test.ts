/**
 * Phase 5 acceptance — the local analytics aggregate (lib/db/analyticsQuery.ts).
 *
 * The bar the plan sets for this page is "numbers must match the server
 * dashboard exactly", and this file is what turns that from a manual side-by-
 * side into a property.
 *
 * THE LOAD-BEARING TEST is `parity`: one fixture is fed to BOTH implementations
 * — through the real mirror write path into a real SQLite engine for the SQL
 * aggregate, and through lib/analytics/summarize.ts (the server path's own
 * reduce) for the reference — and the two are required to agree. Nothing else
 * here can catch a semantic slip that both sides make; that one catches every
 * slip only one side makes, which is the failure mode that ships wrong money
 * to a merchant.
 *
 * `serverWindow()` below states the SERVER query's filter semantics explicitly,
 * including the two PostgREST NULL behaviours (`not.in` and `eq(false)` both
 * drop NULL rows). Those are the assertions the SQL is being held to; writing
 * them out is deliberate, because they are invisible in the PostgREST builder
 * and were the easiest thing in this phase to get quietly wrong.
 */
import {
  isPaidOrder,
  summarizeOrders,
  summarizePayments,
  summarizeStaffMetrics,
  summarizeTopCustomers,
  summarizeTopItems,
} from "@/lib/analytics/summarize";
import { TOP_ITEMS_SQL, queryLocalAnalytics } from "@/lib/db/analyticsQuery";
import {
  mapOrdersToBatch,
  registerOrdersDescriptor,
} from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getReadDb,
  initLocalDb,
} from "@/lib/db/index";
import { writeBatch } from "@/lib/db/write";
import { isoAt, serverOrder, type FakeRow } from "./fakeSupabase";

const LOCATION = "loc-1";
const OTHER_LOCATION = "loc-2";
const START = isoAt(0);
const END = isoAt(1000);

beforeAll(() => {
  registerOrdersDescriptor();
});

beforeEach(async () => {
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
});

// ---------------------------------------------------------------------------
// Fixtures — server-shaped, seeded through the real mirror write path so the
// promoted columns and payloads are exactly what a sync would have produced.
// ---------------------------------------------------------------------------

function item(
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    item_name: `Item ${id}`,
    category_name: "Food",
    quantity: 1,
    subtotal: 5,
    price_paid: 5,
    tax_amount: 0,
    is_voided: false,
    ...overrides,
  };
}

function payment(
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    location_id: LOCATION,
    payment_method: "card_spinapi",
    status: "captured",
    amount: 10,
    tip_amount: 2,
    total_amount: 12,
    is_voided: false,
    is_returned: false,
    card_type: "Visa",
    card_last_four: "4242",
    initiated_at: isoAt(10),
    captured_at: isoAt(10),
    ...overrides,
  };
}

async function seed(rows: FakeRow[]): Promise<void> {
  const { root, children } = mapOrdersToBatch(rows as never, isoAt(0));
  await writeBatch(ENTITIES.orders, "pos", LOCATION, { root, children });
}

/** Seed rows belonging to a second location, so scoping can be asserted. */
async function seedOther(rows: FakeRow[]): Promise<void> {
  const { root, children } = mapOrdersToBatch(rows as never, isoAt(0));
  await writeBatch(ENTITIES.orders, "pos", OTHER_LOCATION, { root, children });
}

function read() {
  return queryLocalAnalytics({
    locationId: LOCATION,
    startIso: START,
    endIso: END,
  });
}

// ---------------------------------------------------------------------------
// The SERVER query's filter semantics, stated explicitly.
// ---------------------------------------------------------------------------

interface ServerWindow {
  orders: FakeRow[];
  revenueOrders: FakeRow[];
  payments: Record<string, unknown>[];
  items: Record<string, unknown>[];
}

function serverWindow(all: FakeRow[]): ServerWindow {
  const orders = all.filter(
    (o) =>
      o.location_id === LOCATION &&
      o.created_at >= START &&
      // `.lte`, not `.lt` — analytics is a CLOSED interval, unlike history.
      o.created_at <= END &&
      // `.not('status','in','("draft")')` is NOT (status IN (...)), which is
      // NULL — and so excludes the row — when status is NULL.
      o.status !== null &&
      o.status !== undefined &&
      o.status !== "draft",
  );
  const revenueOrders = orders.filter((o) => isPaidOrder(o as never));

  // Payments are scoped by their OWN location + initiated_at, with no
  // reference to the parent order's created_at.
  const payments = all
    .flatMap((o) => (o.order_payments as Record<string, unknown>[]) ?? [])
    .filter(
      (p) =>
        p.location_id === LOCATION &&
        (p.initiated_at as string) >= START &&
        (p.initiated_at as string) <= END,
    );

  // `.in('order_id', paidIds).eq('is_voided', false)` — eq(false) excludes a
  // NULL is_voided, which is why this is `=== false` and not `!== true`.
  const paidIds = new Set(revenueOrders.map((o) => o.id));
  const items = all
    .filter((o) => paidIds.has(o.id))
    .flatMap((o) => (o.order_items as Record<string, unknown>[]) ?? [])
    .filter((i) => i.is_voided === false);

  return { orders, revenueOrders, payments, items };
}

/** Money agrees to the cent. The local side is exact; the server side floats. */
function expectMoney(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 6);
}

// ---------------------------------------------------------------------------

describe("queryLocalAnalytics — parity with the server reduce", () => {
  it("produces the same numbers as summarize.ts over the same rows", async () => {
    const rows: FakeRow[] = [
      serverOrder("o1", isoAt(5), {
        order_type: "dine_in",
        payment_status: "paid",
        total_amount: 42.5,
        tax_amount: 3.5,
        tip_amount: 5,
        discount_amount: 1.25,
        assigned_server_id: "staff-a",
        customer_id: "cust-1",
        customer_name: "Ada",
        order_items: [
          item("i1", { item_name: "Burger", quantity: 2, subtotal: 20 }),
          item("i2", { item_name: "Fries", quantity: 1, subtotal: 6.5 }),
        ],
        order_payments: [payment("p1", { amount: 40, tip_amount: 5, total_amount: 45 })],
      }),
      serverOrder("o2", isoAt(20), {
        order_type: "takeout",
        payment_status: "partial",
        total_amount: 18.75,
        tax_amount: 1.5,
        tip_amount: 0,
        discount_amount: 0,
        created_by_staff_id: "staff-b",
        customer_name: "Grace",
        order_items: [item("i3", { item_name: "Burger", quantity: 3, subtotal: 30 })],
        order_payments: [
          payment("p2", {
            payment_method: "cash",
            amount: 18.75,
            tip_amount: 0,
            total_amount: 18.75,
            card_type: null,
            card_last_four: null,
            initiated_at: isoAt(21),
            captured_at: isoAt(21),
          }),
        ],
      }),
      // Unpaid — counts toward totalOrders and discounts, never toward revenue.
      serverOrder("o3", isoAt(30), {
        order_type: "dine_in",
        status: "open",
        payment_status: "pending",
        total_amount: 99,
        tax_amount: 9,
        tip_amount: 9,
        discount_amount: 4,
        assigned_server_id: "staff-a",
        order_items: [item("i4", { item_name: "Steak", subtotal: 99 })],
        order_payments: [],
      }),
      serverOrder("o4", isoAt(40), {
        status: "void",
        payment_status: "pending",
        total_amount: 12,
        discount_amount: 0,
        order_items: [],
        order_payments: [
          payment("p3", {
            is_voided: true,
            amount: 12,
            total_amount: 12,
            initiated_at: isoAt(41),
          }),
        ],
      }),
      serverOrder("o5", isoAt(50), {
        status: "cancelled",
        payment_status: "pending",
        total_amount: 7,
        discount_amount: 0,
        order_items: [],
        order_payments: [],
      }),
    ];
    await seed(rows);

    const local = (await read())!;
    expect(local).not.toBeNull();

    const w = serverWindow(rows);
    const refOrders = summarizeOrders(w.orders as never);
    const refPayments = summarizePayments(w.payments);
    const refItems = summarizeTopItems(w.items);
    const refCustomers = summarizeTopCustomers(w.revenueOrders as never);
    const refStaff = summarizeStaffMetrics(w.revenueOrders as never);

    // ── Orders ────────────────────────────────────────────────
    expect(local.orders.totalOrders).toBe(refOrders.totalOrders);
    expect(local.orders.completedOrders).toBe(refOrders.completedOrders);
    expect(local.orders.voidedOrders).toBe(refOrders.voidedOrders);
    expect(local.orders.cancelledOrders).toBe(refOrders.cancelledOrders);
    expectMoney(local.orders.totalRevenue, refOrders.totalRevenue);
    expectMoney(local.orders.totalTax, refOrders.totalTax);
    expectMoney(local.orders.totalTips, refOrders.totalTips);
    expectMoney(local.orders.totalDiscounts, refOrders.totalDiscounts);
    expectMoney(local.orders.averageOrderValue, refOrders.averageOrderValue);

    // by-type: same set, same counts, same revenue (order can tie-break
    // differently — SQL sorts deterministically, the server does not).
    const byType = (rowsIn: { type: string; count: number; revenue: number }[]) =>
      Object.fromEntries(rowsIn.map((r) => [r.type, r]));
    const localByType = byType(local.orders.ordersByType);
    const refByType = byType(refOrders.ordersByType);
    expect(Object.keys(localByType).sort()).toEqual(Object.keys(refByType).sort());
    for (const key of Object.keys(refByType)) {
      expect(localByType[key].count).toBe(refByType[key].count);
      expectMoney(localByType[key].revenue, refByType[key].revenue);
    }

    // ── Payments ──────────────────────────────────────────────
    expect(local.payments.totalPayments).toBe(refPayments.totalPayments);
    expectMoney(local.payments.totalAmount, refPayments.totalAmount);
    expect(local.payments.refundCount).toBe(refPayments.refundCount);
    expectMoney(local.payments.refundAmount, refPayments.refundAmount);
    expect(local.payments.cardCount).toBe(refPayments.cardCount);
    expectMoney(local.payments.cardTotal, refPayments.cardTotal);
    expectMoney(local.payments.cardTips, refPayments.cardTips);
    expect(local.payments.cashCount).toBe(refPayments.cashCount);
    expectMoney(local.payments.cashTotal, refPayments.cashTotal);
    expectMoney(local.payments.cashTips, refPayments.cashTips);
    expect(local.payments.cardPayments.map((p) => p.id)).toEqual(
      refPayments.cardPayments.map((p) => p.id),
    );
    expect(local.payments.cashPayments.map((p) => p.id)).toEqual(
      refPayments.cashPayments.map((p) => p.id),
    );
    expect(local.payments.byMethod.map((m) => m.method).sort()).toEqual(
      refPayments.byMethod.map((m) => m.method).sort(),
    );

    // ── Items / customers / staff ─────────────────────────────
    expect(local.topItems.map((i) => [i.itemName, i.quantity])).toEqual(
      refItems.map((i) => [i.itemName, i.quantity]),
    );
    local.topItems.forEach((row, i) => expectMoney(row.revenue, refItems[i].revenue));

    expect(local.topCustomers.map((c) => c.name)).toEqual(
      refCustomers.map((c) => c.name),
    );
    local.topCustomers.forEach((row, i) => {
      expect(row.orderCount).toBe(refCustomers[i].orderCount);
      expectMoney(row.totalSpend, refCustomers[i].totalSpend);
      expectMoney(row.avgSpend, refCustomers[i].avgSpend);
    });

    expect([...local.staffMetrics.keys()].sort()).toEqual(
      [...refStaff.keys()].sort(),
    );
    for (const [id, m] of refStaff) {
      expect(local.staffMetrics.get(id)!.orderCount).toBe(m.orderCount);
      expectMoney(local.staffMetrics.get(id)!.revenue, m.revenue);
    }
  });
});

describe("window semantics", () => {
  it("EXCLUDES drafts and NULL-status orders, matching PostgREST not.in", async () => {
    await seed([
      serverOrder("keep", isoAt(5)),
      serverOrder("draft", isoAt(6), { status: "draft" }),
      serverOrder("nullish", isoAt(7), { status: null }),
    ]);
    const local = (await read())!;
    expect(local.orders.totalOrders).toBe(1);
  });

  it("treats the end bound as INCLUSIVE (analytics uses lte, history uses lt)", async () => {
    await seed([
      serverOrder("on-the-edge", END),
      serverOrder("just-past", isoAt(1001)),
    ]);
    const local = (await read())!;
    expect(local.orders.totalOrders).toBe(1);
  });

  it("scopes every summary to the location", async () => {
    await seed([
      serverOrder("mine", isoAt(5), {
        order_payments: [payment("p-mine")],
        order_items: [item("i-mine")],
      }),
    ]);
    await seedOther([
      serverOrder("theirs", isoAt(6), {
        location_id: OTHER_LOCATION,
        order_payments: [payment("p-theirs", { location_id: OTHER_LOCATION })],
        order_items: [item("i-theirs", { item_name: "Elsewhere" })],
      }),
    ]);

    const local = (await read())!;
    expect(local.orders.totalOrders).toBe(1);
    expect(local.payments.totalPayments).toBe(1);
    expect(local.topItems.map((i) => i.itemName)).toEqual(["Item i-mine"]);
  });

  it("scopes payments by initiated_at, NOT by the parent order's created_at", async () => {
    // The order is inside the window; its payment was initiated after it.
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [payment("late", { initiated_at: isoAt(2000), captured_at: isoAt(2000) })],
      }),
    ]);
    const local = (await read())!;
    expect(local.orders.totalOrders).toBe(1);
    expect(local.payments.totalPayments).toBe(0);
  });
});

describe("payments", () => {
  it("splits card from cash and sums tips per side", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [
          payment("card1", { payment_method: "card", amount: 10, tip_amount: 2, total_amount: 12 }),
          payment("card2", { payment_method: "card_online", amount: 20, tip_amount: 3, total_amount: 23 }),
          payment("cash1", { payment_method: "cash", amount: 5, tip_amount: 1, total_amount: 6 }),
          // Not card, not cash — counted in totals, absent from both lists.
          payment("gift1", { payment_method: "gift_card", amount: 7, tip_amount: 0, total_amount: 7 }),
        ],
      }),
    ]);
    const local = (await read())!;
    expect(local.payments.totalPayments).toBe(4);
    expect(local.payments.cardCount).toBe(2);
    expectMoney(local.payments.cardTotal, 35);
    expectMoney(local.payments.cardTips, 5);
    expect(local.payments.cashCount).toBe(1);
    expectMoney(local.payments.cashTotal, 6);
    expectMoney(local.payments.cashTips, 1);
    expectMoney(local.payments.totalAmount, 48);
  });

  it("counts voided and returned payments as refunds, never as captured", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [
          payment("ok", { amount: 10, total_amount: 10 }),
          payment("voided", { is_voided: true, amount: 4, total_amount: 4 }),
          payment("returned", { is_returned: true, amount: 6, total_amount: 6 }),
        ],
      }),
    ]);
    const local = (await read())!;
    expect(local.payments.totalPayments).toBe(1);
    expect(local.payments.refundCount).toBe(2);
    expectMoney(local.payments.refundAmount, 10);
  });

  it("excludes a payment whose status is not captured", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [
          payment("pending", { status: "pending", amount: 10, total_amount: 10 }),
          payment("declined", { status: "declined", amount: 10, total_amount: 10 }),
        ],
      }),
    ]);
    const local = (await read())!;
    expect(local.payments.totalPayments).toBe(0);
    expectMoney(local.payments.totalAmount, 0);
  });

  it("falls back to amount when total_amount is 0 — the server's || semantics", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [payment("p1", { amount: 9, tip_amount: 0, total_amount: 0 })],
      }),
    ]);
    const local = (await read())!;
    expectMoney(local.payments.totalAmount, 9);
    // The line item keeps `??` semantics instead: a 0 total stays 0 there.
    expectMoney(local.payments.cardTotal, 0);
  });

  it("orders the card list newest-captured-first", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_payments: [
          payment("early", { initiated_at: isoAt(10), captured_at: isoAt(10) }),
          payment("late", { initiated_at: isoAt(60), captured_at: isoAt(60) }),
          payment("mid", { initiated_at: isoAt(30), captured_at: isoAt(30) }),
        ],
      }),
    ]);
    const local = (await read())!;
    expect(local.payments.cardPayments.map((p) => p.id)).toEqual([
      "late",
      "mid",
      "early",
    ]);
  });
});

describe("top items", () => {
  it("excludes voided items AND items with a NULL is_voided, like eq(false)", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_items: [
          item("keep", { item_name: "Kept" }),
          item("void", { item_name: "Voided", is_voided: true }),
          item("nullish", { item_name: "Unknown flag", is_voided: null }),
        ],
      }),
    ]);
    const local = (await read())!;
    expect(local.topItems.map((i) => i.itemName)).toEqual(["Kept"]);
  });

  it("only counts items on PAID orders", async () => {
    await seed([
      serverOrder("paid", isoAt(5), {
        payment_status: "paid",
        order_items: [item("a", { item_name: "Sold" })],
      }),
      serverOrder("open", isoAt(6), {
        status: "open",
        payment_status: "pending",
        order_items: [item("b", { item_name: "Not sold" })],
      }),
    ]);
    const local = (await read())!;
    expect(local.topItems.map((i) => i.itemName)).toEqual(["Sold"]);
  });

  it("counts a zero quantity as one, matching `quantity || 1`", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_items: [item("a", { item_name: "Odd", quantity: 0, subtotal: 3 })],
      }),
    ]);
    const local = (await read())!;
    expect(local.topItems[0].quantity).toBe(1);
  });

  it("falls back to price_paid when subtotal is 0 — needs the v9 column", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_items: [item("a", { subtotal: 0, price_paid: 4.25 })],
      }),
    ]);
    const local = (await read())!;
    expectMoney(local.topItems[0].revenue, 4.25);
  });

  it("caps at 15 rows, highest quantity first", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_items: Array.from({ length: 20 }, (_, i) =>
          item(`i${i}`, { item_name: `Item ${i}`, quantity: i + 1 }),
        ),
      }),
    ]);
    const local = (await read())!;
    expect(local.topItems).toHaveLength(15);
    expect(local.topItems[0].itemName).toBe("Item 19");
  });
});

describe("top customers and staff", () => {
  it("keys on customer_id, then name, then email", async () => {
    await seed([
      serverOrder("a", isoAt(5), { customer_id: "c1", customer_name: "Ada", total_amount: 10 }),
      serverOrder("b", isoAt(6), { customer_id: "c1", customer_name: "Ada", total_amount: 20 }),
      serverOrder("c", isoAt(7), { customer_id: null, customer_name: "Walk In", total_amount: 5 }),
      serverOrder("d", isoAt(8), { customer_id: null, customer_name: null, customer_email: "x@y.z", total_amount: 3 }),
      // No identity at all — skipped entirely.
      serverOrder("e", isoAt(9), { customer_id: null, customer_name: null, customer_email: null, total_amount: 99 }),
    ]);
    const local = (await read())!;
    expect(local.topCustomers).toHaveLength(3);
    expect(local.topCustomers[0].name).toBe("Ada");
    expect(local.topCustomers[0].orderCount).toBe(2);
    expectMoney(local.topCustomers[0].totalSpend, 30);
    expectMoney(local.topCustomers[0].avgSpend, 15);
    expect(local.topCustomers.map((c) => c.name)).toContain("x@y.z");
  });

  it("prefers assigned_server_id over created_by_staff_id", async () => {
    await seed([
      serverOrder("a", isoAt(5), {
        assigned_server_id: "server-1",
        created_by_staff_id: "creator-1",
        total_amount: 10,
      }),
      serverOrder("b", isoAt(6), {
        assigned_server_id: null,
        created_by_staff_id: "creator-1",
        total_amount: 4,
      }),
    ]);
    const local = (await read())!;
    expect([...local.staffMetrics.keys()].sort()).toEqual(["creator-1", "server-1"]);
    expectMoney(local.staffMetrics.get("server-1")!.revenue, 10);
    expectMoney(local.staffMetrics.get("creator-1")!.revenue, 4);
  });
});

describe("money is exact", () => {
  it("sums cents as integers where a float reduce drifts", async () => {
    // 0.1 x 3 is the canonical IEEE-754 failure: the JS reduce lands on
    // 0.30000000000000004. The mirror sums 10 + 10 + 10 minor units.
    const rows = [1, 2, 3].map((n) =>
      serverOrder(`o${n}`, isoAt(n), {
        total_amount: 0.1,
        tax_amount: 0,
        tip_amount: 0,
        discount_amount: 0,
        order_items: [],
        order_payments: [],
      }),
    );
    await seed(rows);

    const local = (await read())!;
    expect(local.orders.totalRevenue).toBe(0.3);

    // And the reference it has to match is the one that drifts — which is why
    // parity is asserted to the cent rather than by ===.
    const drifted = summarizeOrders(serverWindow(rows).orders as never).totalRevenue;
    expect(drifted).not.toBe(0.3);
    expectMoney(local.orders.totalRevenue, drifted);
  });
});

/**
 * These assert the SHAPE of the plan, not just that an index name appears —
 * an index can keep its name and lose the column that makes it useful, which
 * is exactly what a name-only assertion misses.
 */
describe("query plans", () => {
  async function planOf(sql: string, params: unknown[]): Promise<string> {
    const rows = await getReadDb()!.getAllAsync<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${sql}`,
      params as never,
    );
    return rows.map((r) => r.detail).join(" | ");
  }

  it("seeks payments on BOTH index columns, never scanning the table", async () => {
    await seed([serverOrder("o1", isoAt(5), { order_payments: [payment("p1")] })]);
    const detail = await planOf(
      `SELECT COUNT(*) FROM order_payments p
       WHERE p.location_id = ? AND p.initiated_at >= ? AND p.initiated_at <= ?`,
      [LOCATION, START, END],
    );
    expect(detail).toContain("idx_op_loc_initiated");
    // The range terms are the point of the index — a location-only index would
    // still be named in the plan while scanning every payment at the location.
    expect(detail).toContain("location_id=?");
    expect(detail).toContain("initiated_at>?");
    expect(detail).not.toContain("SCAN p");
  });

  it("drives Top Items from the orders window, seeking items per order", async () => {
    // 40 orders x 3 items — enough that the planner has a real choice to make.
    await seed(
      Array.from({ length: 40 }, (_, n) =>
        serverOrder(`o${n}`, isoAt(n), {
          order_payments: [],
          order_items: [
            item(`k${n}`, { is_voided: false }),
            item(`v${n}`, { is_voided: true }),
            item(`n${n}`, { is_voided: null }),
          ],
        }),
      ),
    );
    const detail = await planOf(TOP_ITEMS_SQL, [LOCATION, START, END]);

    // orders is the selective side and must be the outer loop…
    expect(detail).toContain("SEARCH o USING INDEX idx_o_loc_created_v2");
    // …and each order's items must be an index seek, NOT a scan of every item
    // row in the mirror. This is what the redundant-looking `IS NOT 1` in
    // ITEM_NOT_VOIDED_SQL buys: SQLite only uses the PARTIAL idx_oi_order when
    // the WHERE clause syntactically implies its predicate.
    expect(detail).toContain("SEARCH oi USING INDEX idx_oi_order");
    expect(detail).not.toContain("SCAN oi");
  });

  it("the index-enabling predicate selects the same rows as `= 0` alone", async () => {
    await seed([
      serverOrder("o1", isoAt(5), {
        order_items: [
          item("kept", { is_voided: false }),
          item("voided", { is_voided: true }),
          item("nullish", { is_voided: null }),
        ],
      }),
    ]);
    const db = getReadDb()!;
    const count = async (pred: string) =>
      (
        await db.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.location_id = ? AND ${pred}`,
          [LOCATION],
        )
      )!.n;

    expect(await count("oi.is_voided IS NOT 1 AND oi.is_voided = 0")).toBe(
      await count("oi.is_voided = 0"),
    );
    // And the tempting shorthand really is wrong — it keeps the NULL row.
    expect(await count("oi.is_voided IS NOT 1")).toBe(2);
  });
});

describe("availability", () => {
  it("returns null when the local DB is closed, so the caller can fall back", async () => {
    await destroyLocalDb();
    __resetLocalDbForTests();
    expect(await read()).toBeNull();
  });
});
