/**
 * Phase 3 — the local Previous Orders query (lib/db/historyQuery.ts).
 *
 * Every assertion here mirrors the SERVER path's semantics
 * (buildHistoryOrderQuery in services/historyOrderFilters.ts) — the two must
 * never disagree on the same filter, or an online search and an offline search
 * would return different result sets.
 *
 * Rows are seeded through the real write path (mapOrdersToBatch + writeBatch),
 * so payloads and promoted columns are exactly what the mirror holds.
 */
import {
    mapOrdersToBatch,
    registerOrdersDescriptor,
} from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import {
    buildHistoryOrderWhere,
    historyOrderBySql,
    queryLocalHistoryPage,
} from "@/lib/db/historyQuery";
import {
    __resetLocalDbForTests,
    destroyLocalDb,
    initLocalDb,
} from "@/lib/db/index";
import { writeBatch } from "@/lib/db/write";
import {
    DEFAULT_HISTORY_FILTERS,
    type HistoryOrderFilters,
} from "@/services/historyOrderFilters";
import { isoAt, serverOrder } from "./fakeSupabase";

const LOCATION = "loc-1";
const PAGE_SIZE = 50;

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

/** Seed server-shaped rows through the real mirror write path. */
async function seed(rows: ReturnType<typeof serverOrder>[]): Promise<void> {
  const { root, children } = mapOrdersToBatch(rows as never, isoAt(0));
  await writeBatch(ENTITIES.orders, "pos", LOCATION, { root, children });
}

function spec(
  filters: HistoryOrderFilters = DEFAULT_HISTORY_FILTERS,
  pageIndex = 0,
) {
  return {
    locationId: LOCATION,
    filters,
    startTs: null,
    endTs: null,
    pageIndex,
    pageSize: PAGE_SIZE,
  };
}

describe("buildHistoryOrderWhere — mirrors the server builder", () => {
  it("scopes to the location and date window", () => {
    const { where, params } = buildHistoryOrderWhere({
      locationId: "loc-9",
      filters: DEFAULT_HISTORY_FILTERS,
      startTs: "2026-01-01T00:00:00Z",
      endTs: "2026-01-02T00:00:00Z",
    });
    expect(where).toContain("o.location_id = ?");
    expect(where).toContain("o.created_at >= ?");
    expect(where).toContain("o.created_at < ?");
    expect(params).toEqual([
      "loc-9",
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
    ]);
  });

  it("excludes empty drafts exactly like the server EMPTY_DRAFT_EXCLUSION_OR", () => {
    const { where } = buildHistoryOrderWhere({
      locationId: LOCATION,
      filters: DEFAULT_HISTORY_FILTERS,
      startTs: null,
      endTs: null,
    });
    // A $0, never-completed, unpaid order with no discount must be excluded.
    expect(where).toContain("o.total_amount_minor != 0");
    expect(where).toContain("o.completed_at IS NOT NULL");
    expect(where).toContain("o.payment_status = 'paid'");
  });
});

describe("queryLocalHistoryPage", () => {
  it("returns the newest-first page and the exact total", async () => {
    await seed([
      serverOrder("o1", isoAt(1)),
      serverOrder("o2", isoAt(2)),
      serverOrder("o3", isoAt(3)),
    ]);

    const result = await queryLocalHistoryPage(spec());
    expect(result).not.toBeNull();
    expect(result!.totalCount).toBe(3);
    expect(result!.orders.map((r) => r.id)).toEqual(["o3", "o2", "o1"]);
  });

  it("paginates by offset and reports the same total on every page", async () => {
    await seed([
      serverOrder("o1", isoAt(1)),
      serverOrder("o2", isoAt(2)),
      serverOrder("o3", isoAt(3)),
      serverOrder("o4", isoAt(4)),
      serverOrder("o5", isoAt(5)),
    ]);

    const page0 = await queryLocalHistoryPage({
      ...spec(),
      pageSize: 2,
      pageIndex: 0,
    });
    const page1 = await queryLocalHistoryPage({
      ...spec(),
      pageSize: 2,
      pageIndex: 1,
    });
    const page2 = await queryLocalHistoryPage({
      ...spec(),
      pageSize: 2,
      pageIndex: 2,
    });

    expect(page0!.orders.map((r) => r.id)).toEqual(["o5", "o4"]);
    expect(page1!.orders.map((r) => r.id)).toEqual(["o3", "o2"]);
    expect(page2!.orders.map((r) => r.id)).toEqual(["o1"]);
    expect(page0!.totalCount).toBe(5);
    expect(page1!.totalCount).toBe(5);
  });

  it("filters by channel — online is defined by order_source", async () => {
    await seed([
      serverOrder("o1", isoAt(1), { order_source: "pos" }),
      serverOrder("o2", isoAt(2), { order_source: "online" }),
      serverOrder("o3", isoAt(3), { order_source: "online_store" }),
    ]);

    const online = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, channel: "online" }),
    );
    expect(online!.orders.map((r) => r.id).sort()).toEqual(["o2", "o3"]);

    const dineIn = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, channel: "dine_in" }),
    );
    // A non-online dine_in order is included; online-sourced rows are not.
    expect(dineIn!.orders.map((r) => r.id)).toEqual(["o1"]);
  });

  it("filters by status — voided is status='void'", async () => {
    await seed([
      serverOrder("o1", isoAt(1), {
        status: "completed",
        payment_status: "paid",
      }),
      serverOrder("o2", isoAt(2), { status: "void", payment_status: "paid" }),
    ]);

    const voided = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, status: "voided" }),
    );
    expect(voided!.orders.map((r) => r.id)).toEqual(["o2"]);

    const paid = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, status: "paid" }),
    );
    // paid excludes void rows, as the server builder does.
    expect(paid!.orders.map((r) => r.id)).toEqual(["o1"]);
  });

  it("searches customer name and phone across the whole window", async () => {
    await seed([
      serverOrder("o1", isoAt(1), {
        customer_name: "Alice Johnson",
        customer_phone: "555-0142",
      }),
      serverOrder("o2", isoAt(2), {
        customer_name: "Bob Smith",
        customer_phone: "555-0111",
      }),
    ]);

    const byName = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, search: "ali" }),
    );
    expect(byName!.orders.map((r) => r.id)).toEqual(["o1"]);

    const byPhone = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, search: "0142" }),
    );
    expect(byPhone!.orders.map((r) => r.id)).toEqual(["o1"]);
  });

  it("searches delivery_platform through the verbatim payload", async () => {
    await seed([
      serverOrder("o1", isoAt(1), {
        order_source: "online",
        delivery_platform: "Uber Eats",
      }),
      serverOrder("o2", isoAt(2), {
        order_source: "online",
        delivery_platform: "DoorDash",
      }),
    ]);

    const uber = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, search: "uber" }),
    );
    expect(uber!.orders.map((r) => r.id)).toEqual(["o1"]);
  });

  it("sorts by amount using minor units", async () => {
    await seed([
      serverOrder("o1", isoAt(1), { total_amount: 19.99 }),
      serverOrder("o2", isoAt(2), { total_amount: 5.5 }),
      serverOrder("o3", isoAt(3), { total_amount: 42.0 }),
    ]);

    const desc = await queryLocalHistoryPage(
      spec({ ...DEFAULT_HISTORY_FILTERS, sort: "amount_desc" }),
    );
    expect(desc!.orders.map((r) => r.id)).toEqual(["o3", "o1", "o2"]);

    expect(
      historyOrderBySql({ ...DEFAULT_HISTORY_FILTERS, sort: "amount_desc" }),
    ).toContain("o.total_amount_minor DESC");
  });

  it("excludes empty drafts — a $0 never-completed unpaid order is not history", async () => {
    await seed([
      serverOrder("o1", isoAt(1), {
        status: "open",
        payment_status: null,
        total_amount: 0,
        subtotal: 0,
        completed_at: null,
      }),
      serverOrder("o2", isoAt(2), {
        status: "completed",
        payment_status: "paid",
      }),
    ]);

    const result = await queryLocalHistoryPage(spec());
    expect(result!.orders.map((r) => r.id)).toEqual(["o2"]);
  });
});
