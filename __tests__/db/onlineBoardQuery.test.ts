/**
 * Phase 5 acceptance — the local Online Orders board (lib/db/boardQuery.ts).
 *
 * The board is the first mirrored page whose window predicate is NOT a column
 * on the table it queries: `get_online_orders_board_v1` scopes strictly by
 * `online_orders.placed_at`, through a DISTINCT ON that picks one placement
 * row out of a non-unique FK. Two things therefore have to be true, and both
 * are asserted here rather than assumed:
 *
 *   1. `resolveOnlinePlacedAt` picks the SAME row the RPC picks — including
 *      Postgres's NULLS-FIRST ordering on DESC, which is the half that is easy
 *      to get backwards and impossible to notice.
 *   2. The SQL window reproduces the RPC's bounds: inclusive start, exclusive
 *      end, business-day rollover honored, and a NULL placement excluded
 *      rather than defaulted.
 *
 * Everything runs against a real SQL engine (__mocks__/expo-sqlite.js, backed
 * by node:sqlite) and is seeded through the real mirror write path, so what is
 * being tested is the schema and the statements that ship.
 */
import {
  BOARD_STATUSES,
  boardWindowIsCovered,
  buildBoardStatement,
  queryLocalOnlineBoard,
  resolveBoardWindow,
} from "@/lib/db/boardQuery";
import {
  mapOrdersToBatch,
  registerOrdersDescriptor,
  resolveOnlinePlacedAt,
} from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getReadDb,
  initLocalDb,
} from "@/lib/db/index";
import { writeBatch } from "@/lib/db/write";
import { DateTime } from "luxon";
import { isoAt, serverOrder, type FakeRow } from "./fakeSupabase";

const LOCATION = "loc-1";
const OTHER_LOCATION = "loc-2";

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
// Fixtures
// ---------------------------------------------------------------------------

/** An order with a placement row, shaped like the mirror's embed returns it. */
function onlineOrder(
  id: string,
  placedAt: string | null,
  overrides: Partial<FakeRow> = {},
): FakeRow {
  return serverOrder(id, placedAt ?? isoAt(0), {
    order_source: "online",
    status: "pending",
    online_orders:
      placedAt === null
        ? []
        : [
            {
              id: `oo-${id}`,
              order_id: id,
              provider: "website",
              delivery_company: null,
              placed_at: placedAt,
              updated_at: placedAt,
            },
          ],
    ...overrides,
  });
}

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    item_name: `Item ${id}`,
    quantity: 1,
    unit_price: 5,
    subtotal: 5,
    tax_amount: 0,
    is_voided: false,
    ...overrides,
  };
}

async function seed(rows: FakeRow[], locationId = LOCATION): Promise<void> {
  const scoped = rows.map((r) => ({ ...r, location_id: locationId }));
  const batch = mapOrdersToBatch(scoped as never, new Date().toISOString());
  const result = await writeBatch(
    ENTITIES.orders,
    "pos",
    locationId,
    batch,
    { value: scoped[scoped.length - 1].updated_at as string, id: null },
    { lastSuccessAt: new Date().toISOString(), lastError: null },
  );
  expect(result.committed).toBe(true);
}

const WINDOW = { startTs: isoAt(0), endTs: isoAt(1000) };

function board(window = WINDOW, locationId = LOCATION) {
  return queryLocalOnlineBoard({ locationId, window });
}

// ---------------------------------------------------------------------------
// resolveOnlinePlacedAt — the DISTINCT ON, reproduced
// ---------------------------------------------------------------------------

describe("resolveOnlinePlacedAt", () => {
  it("is null when there is no placement row at all", () => {
    expect(resolveOnlinePlacedAt(undefined)).toBeNull();
    expect(resolveOnlinePlacedAt(null)).toBeNull();
    expect(resolveOnlinePlacedAt([])).toBeNull();
  });

  it("takes the placement row with the newest updated_at, not the first", () => {
    // Deliberately ordered so `rows[0]` is the WRONG answer: PostgREST returns
    // an embed array in no defined order, so picking the head would agree with
    // the server only by luck.
    expect(
      resolveOnlinePlacedAt([
        { id: "a", updated_at: isoAt(1), placed_at: isoAt(10) },
        { id: "b", updated_at: isoAt(5), placed_at: isoAt(50) },
      ]),
    ).toBe(isoAt(50));
  });

  it("breaks a tie on id DESC, exactly as the RPC does", () => {
    expect(
      resolveOnlinePlacedAt([
        { id: "a", updated_at: isoAt(5), placed_at: isoAt(10) },
        { id: "z", updated_at: isoAt(5), placed_at: isoAt(50) },
      ]),
    ).toBe(isoAt(50));
  });

  /**
   * The half that is easy to get backwards. Postgres `ORDER BY x DESC` sorts
   * NULLS FIRST, so a placement row with no `updated_at` OUTRANKS one that has
   * a value — and if that winner also has no `placed_at`, the order is out of
   * every window. Returning null here is the same answer the server gives.
   */
  it("lets a NULL updated_at outrank a real one, and reports its NULL placed_at", () => {
    expect(
      resolveOnlinePlacedAt([
        { id: "a", updated_at: isoAt(5), placed_at: isoAt(10) },
        { id: "b", updated_at: null, placed_at: null },
      ]),
    ).toBeNull();
  });

  it("still returns the winner's placed_at when the winner has one", () => {
    expect(
      resolveOnlinePlacedAt([
        { id: "a", updated_at: isoAt(5), placed_at: isoAt(10) },
        { id: "b", updated_at: null, placed_at: isoAt(99) },
      ]),
    ).toBe(isoAt(99));
  });

  it("ignores malformed entries rather than throwing on the hot path", () => {
    expect(
      resolveOnlinePlacedAt([
        null,
        "nonsense",
        { id: "a", updated_at: isoAt(1), placed_at: isoAt(7) },
      ] as never),
    ).toBe(isoAt(7));
  });
});

// ---------------------------------------------------------------------------
// resolveBoardWindow — the RPC's CASE arms, in luxon
// ---------------------------------------------------------------------------

describe("resolveBoardWindow", () => {
  const UTC = { timezone: "UTC", rolloverHour: 0 };
  const LATE = { timezone: "UTC", rolloverHour: 4 };

  const at = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });

  it("scopes today to local midnight..next midnight with a 0 rollover", () => {
    const w = resolveBoardWindow("today", null, null, UTC, at("2026-03-05T15:00:00Z"));
    expect(w).toEqual({
      startTs: "2026-03-05T00:00:00.000Z",
      endTs: "2026-03-06T00:00:00.000Z",
    });
  });

  /**
   * The rollover is the whole reason this is not a calendar day: at 02:00 with
   * a 4am rollover the kitchen is still working last night's business day, and
   * an order placed at 01:00 belongs on THAT tab. A calendar-day window would
   * put it on an empty "today" and the operator would conclude it never
   * arrived.
   */
  it("is still on yesterday's business day before the rollover hour", () => {
    const w = resolveBoardWindow("today", null, null, LATE, at("2026-03-05T02:00:00Z"));
    expect(w).toEqual({
      startTs: "2026-03-04T04:00:00.000Z",
      endTs: "2026-03-05T04:00:00.000Z",
    });
  });

  it("moves to the new business day once the rollover hour passes", () => {
    const w = resolveBoardWindow("today", null, null, LATE, at("2026-03-05T05:00:00Z"));
    expect(w).toEqual({
      startTs: "2026-03-05T04:00:00.000Z",
      endTs: "2026-03-06T04:00:00.000Z",
    });
  });

  it("makes yesterday exactly abut today, so no tab gaps or overlaps", () => {
    const now = at("2026-03-05T15:00:00Z");
    const yesterday = resolveBoardWindow("yesterday", null, null, LATE, now)!;
    const today = resolveBoardWindow("today", null, null, LATE, now)!;
    expect(yesterday.endTs).toBe(today.startTs);
  });

  it("spans seven business days for last_7_days, ending with today", () => {
    const now = at("2026-03-05T15:00:00Z");
    const w = resolveBoardWindow("last_7_days", null, null, UTC, now)!;
    expect(w.startTs).toBe("2026-02-27T00:00:00.000Z");
    expect(w.endTs).toBe("2026-03-06T00:00:00.000Z");
  });

  it("honors an explicit custom range", () => {
    const w = resolveBoardWindow(
      "custom",
      "2026-03-01",
      "2026-03-02",
      UTC,
      at("2026-03-05T15:00:00Z"),
    );
    expect(w).toEqual({
      startTs: "2026-03-01T00:00:00.000Z",
      endTs: "2026-03-03T00:00:00.000Z",
    });
  });

  /**
   * The RPC RAISES on these. Returning null (and falling back to the server)
   * is the local equivalent — rendering some other window would be a wrong
   * answer where the server gives an error.
   */
  it("refuses the custom ranges the RPC would raise on", () => {
    const now = at("2026-03-05T15:00:00Z");
    expect(resolveBoardWindow("custom", null, "2026-03-02", UTC, now)).toBeNull();
    expect(resolveBoardWindow("custom", "2026-03-01", null, UTC, now)).toBeNull();
    expect(
      resolveBoardWindow("custom", "2026-03-05", "2026-03-01", UTC, now),
    ).toBeNull();
  });

  it("refuses an invalid timezone rather than silently using UTC", () => {
    expect(
      resolveBoardWindow("today", null, null, {
        timezone: "Not/AZone",
        rolloverHour: 0,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The board query
// ---------------------------------------------------------------------------

describe("queryLocalOnlineBoard — the window", () => {
  it("includes the start bound and excludes the end bound, like the RPC", async () => {
    await seed([
      onlineOrder("before", isoAt(-1)),
      onlineOrder("onStart", isoAt(0)),
      onlineOrder("inside", isoAt(500)),
      onlineOrder("onEnd", isoAt(1000)),
    ]);
    const rows = (await board())!;
    expect(rows.map((r) => r.order.id).sort()).toEqual(["inside", "onStart"]);
  });

  /**
   * The defining property of the whole feature: the board scopes on when the
   * CUSTOMER placed the order, which can be a different business day from when
   * the POS row was created. An order created inside the window but placed
   * before it belongs on the earlier tab.
   */
  it("scopes on placed_at, NOT on the order's created_at", async () => {
    await seed([
      onlineOrder("late-placement", isoAt(-500), {
        created_at: isoAt(500),
        updated_at: isoAt(500),
      }),
    ]);
    expect((await board())!).toHaveLength(0);
  });

  it("excludes an order with no placement row at all", async () => {
    await seed([onlineOrder("no-placement", null, { created_at: isoAt(5), updated_at: isoAt(5) })]);
    expect((await board())!).toHaveLength(0);
  });

  it("excludes an order whose authoritative placement row has a NULL placed_at", async () => {
    await seed([
      serverOrder("null-placed", isoAt(5), {
        online_orders: [
          { id: "oo-1", order_id: "null-placed", placed_at: null, updated_at: null },
        ],
      }),
    ]);
    expect((await board())!).toHaveLength(0);
  });

  it("is scoped to one location", async () => {
    await seed([onlineOrder("mine", isoAt(10))]);
    await seed([onlineOrder("theirs", isoAt(10))], OTHER_LOCATION);
    const rows = (await board())!;
    expect(rows.map((r) => r.order.id)).toEqual(["mine"]);
  });

  it("returns newest-placed first, tie-broken on id descending", async () => {
    await seed([
      onlineOrder("a", isoAt(10)),
      onlineOrder("c", isoAt(50)),
      onlineOrder("b", isoAt(50)),
    ]);
    const rows = (await board())!;
    expect(rows.map((r) => r.order.id)).toEqual(["c", "b", "a"]);
  });
});

describe("queryLocalOnlineBoard — the status filter", () => {
  it("renders every status the RPC lists", async () => {
    await seed(
      BOARD_STATUSES.map((status, n) =>
        onlineOrder(`s-${status}`, isoAt(10 + n), { status }),
      ),
    );
    const rows = (await board())!;
    expect(rows).toHaveLength(BOARD_STATUSES.length);
  });

  /**
   * The RPC lists what it wants rather than rejecting what it doesn't, so a
   * status nobody has thought about defaults to INVISIBLE rather than to a
   * card nobody designed. `draft` is the one that would otherwise leak — an
   * unsubmitted order is not an online order anybody placed.
   */
  it("excludes cancelled, void, refunded and draft", async () => {
    await seed(
      ["cancelled", "void", "refunded", "draft"].map((status, n) =>
        onlineOrder(`x-${status}`, isoAt(10 + n), { status }),
      ),
    );
    expect((await board())!).toHaveLength(0);
  });
});

describe("queryLocalOnlineBoard — item_count", () => {
  it("sums quantities of non-voided items", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        order_items: [item("i1", { quantity: 2 }), item("i2", { quantity: 3 })],
      }),
    ]);
    expect((await board())![0].itemCount).toBe(5);
  });

  it("excludes voided items", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        order_items: [
          item("i1", { quantity: 2 }),
          item("i2", { quantity: 9, is_voided: true }),
        ],
      }),
    ]);
    expect((await board())![0].itemCount).toBe(2);
  });

  /**
   * `NOT COALESCE(oi.is_voided, false)` INCLUDES a NULL flag — the opposite of
   * the analytics aggregate's `= 0`, which excludes it. Reproducing the RPC
   * means reproducing this one too, not standardising on the other.
   */
  it("counts an item whose is_voided is NULL, matching NOT COALESCE(...)", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        order_items: [item("i1", { quantity: 4, is_voided: null })],
      }),
    ]);
    expect((await board())![0].itemCount).toBe(4);
  });

  it("floors a negative quantity at zero, like GREATEST(quantity, 0)", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        order_items: [item("i1", { quantity: -3 }), item("i2", { quantity: 2 })],
      }),
    ]);
    expect((await board())![0].itemCount).toBe(2);
  });

  it("is 0, not null, for an order with no items", async () => {
    await seed([onlineOrder("o1", isoAt(10), { order_items: [] })]);
    expect((await board())![0].itemCount).toBe(0);
  });
});

describe("queryLocalOnlineBoard — the rows handed back", () => {
  it("round-trips the server payload and its children verbatim", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        customer_name: "Ada Lovelace",
        order_items: [item("i1")],
        order_payments: [
          { id: "p1", payment_method: "card", amount: 10, status: "captured" },
        ],
      }),
    ]);
    const row = (await board())![0];
    const payload = JSON.parse(row.order.payload as string);
    expect(payload.customer_name).toBe("Ada Lovelace");
    expect(row.items).toHaveLength(1);
    expect(row.payments).toHaveLength(1);
    expect(row.placedAt).toBe(isoAt(10));
  });

  /**
   * The v11 select-list widening. `get_online_orders_board_v1` returns
   * `to_jsonb(o)` — every column — while ORDER_SELECT was a subset, so these
   * resolved to their defaults locally and to real values on the server for
   * the same order. The card and the detail screen read them through
   * `normalizeFetchedOrder`.
   */
  it("carries the columns normalizeFetchedOrder reads, not just the mirror's own", async () => {
    await seed([
      onlineOrder("o1", isoAt(10), {
        external_id: "ext-9",
        delivery_address: { line1: "1 Main St" },
        service_charge_name: "Delivery fee",
        service_charge_rate: 0.05,
        service_charge_applies_on: "post_discount",
        service_charge_is_manual: false,
        service_charge_is_taxable: true,
        cash_discount_applied: true,
        effective_subtotal: 10,
        effective_tax_amount: 0.89,
        payment_pricing_mode: "cash",
        split_payment_path: "even",
        platform_order_number: "GH-1234",
        started_preparing_at: isoAt(12),
        created_by_user_id: "u-1",
      }),
    ]);
    const payload = JSON.parse((await board())![0].order.payload as string);
    expect(payload.external_id).toBe("ext-9");
    expect(payload.delivery_address).toEqual({ line1: "1 Main St" });
    expect(payload.service_charge_name).toBe("Delivery fee");
    expect(payload.service_charge_rate).toBe(0.05);
    expect(payload.service_charge_applies_on).toBe("post_discount");
    expect(payload.service_charge_is_taxable).toBe(true);
    expect(payload.cash_discount_applied).toBe(true);
    expect(payload.effective_subtotal).toBe(10);
    expect(payload.effective_tax_amount).toBe(0.89);
    expect(payload.payment_pricing_mode).toBe("cash");
    expect(payload.split_payment_path).toBe("even");
    expect(payload.platform_order_number).toBe("GH-1234");
    expect(payload.started_preparing_at).toBe(isoAt(12));
    expect(payload.created_by_user_id).toBe("u-1");
  });

  it("returns an empty array, not null, when the window genuinely has nothing", async () => {
    await seed([onlineOrder("o1", isoAt(-500))]);
    expect(await board()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Coverage — "answered, and it is empty" vs "cannot answer"
// ---------------------------------------------------------------------------

describe("boardWindowIsCovered", () => {
  it("is false before the location has ever synced", async () => {
    expect(await boardWindowIsCovered(LOCATION, WINDOW)).toBe(false);
  });

  it("is true once a sync has landed and the window is inside the mirror", async () => {
    // The mirror's oldest retained order predates the window, so the window is
    // fully covered — which is the ordinary case, since the retention cap
    // holds months of history and the board asks for a day.
    await seed([
      onlineOrder("older", isoAt(-500), {
        created_at: isoAt(-500),
        updated_at: isoAt(-500),
      }),
      onlineOrder("o1", isoAt(10)),
    ]);
    expect(await boardWindowIsCovered(LOCATION, WINDOW)).toBe(true);
  });

  /**
   * Retention is measured on `created_at`; the window is measured on
   * `placed_at`. A window that starts before the oldest retained order is one
   * the mirror cannot answer completely, and a partial board that looks whole
   * is the failure this comparison exists to prevent.
   */
  it("is false when the window reaches past the retention floor", async () => {
    await seed([onlineOrder("o1", isoAt(500))]);
    expect(
      await boardWindowIsCovered(LOCATION, {
        startTs: isoAt(0),
        endTs: isoAt(1000),
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

describe("query plan", () => {
  async function planOf(sql: string, params: unknown[]): Promise<string> {
    const rows = await getReadDb()!.getAllAsync<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${sql}`,
      params as never,
    );
    return rows.map((r) => r.detail).join(" | ");
  }

  /**
   * The Phase 5 analytics ③ lesson, applied before it cost anything: SQLite
   * only uses a partial index when the WHERE clause SYNTACTICALLY implies its
   * predicate. The assertion names the seek terms rather than just the index,
   * because an index can keep its name and stop doing any work.
   */
  it("seeks the board window on the partial index, with no sort", async () => {
    await seed(
      Array.from({ length: 40 }, (_, n) => onlineOrder(`o${n}`, isoAt(n))),
    );
    const { sql, params } = buildBoardStatement({
      locationId: LOCATION,
      window: WINDOW,
    });
    const detail = await planOf(sql, params);
    expect(detail).toContain("idx_o_online_placed");
    expect(detail).toContain("location_id=?");
    expect(detail).toContain("_online_placed_at>?");
    // The index carries the DESC ordering, so the board never materialises a
    // temp b-tree to sort what it just read in order.
    expect(detail).not.toContain("USE TEMP B-TREE");
  });

  it("seeks the item count per order instead of scanning every item", async () => {
    await seed(
      Array.from({ length: 40 }, (_, n) =>
        onlineOrder(`o${n}`, isoAt(n), {
          order_items: [item(`i${n}a`), item(`i${n}b`)],
        }),
      ),
    );
    const { sql, params } = buildBoardStatement({
      locationId: LOCATION,
      window: WINDOW,
    });
    const detail = await planOf(sql, params);
    expect(detail).toContain("idx_oi_order");
    expect(detail).not.toContain("SCAN oi");
  });
});
