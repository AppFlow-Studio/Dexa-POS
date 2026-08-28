/**
 * Phase 2 acceptance — realtime and the delta pull share one write path.
 *
 * The property that matters most here is the NEGATIVE one: a broadcast must
 * never move the sync cursor. Applying a broadcast for an order newer than our
 * watermark and then advancing to it would skip every order in between — a
 * permanent, silent hole that no retry heals, because the engine would believe
 * it had already read that range.
 */
import { registerOrdersDescriptor } from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  applyOrdersFromRealtime,
  deleteOrderFromRealtime,
} from "@/lib/db/realtimeApply";
import { readCursor, syncEntity } from "@/lib/db/syncEngine";
import { FakeSupabase, isoAt, serverOrder } from "./fakeSupabase";

const LOCATION = "loc-1";
let server: FakeSupabase;

function supabase() {
  return server as unknown as import("@supabase/supabase-js").SupabaseClient;
}

async function countOrders(): Promise<number> {
  const row = await getDb()!.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM orders",
  );
  return row?.n ?? 0;
}

beforeAll(() => registerOrdersDescriptor());

beforeEach(async () => {
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
  server = new FakeSupabase();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
});

describe("applyOrdersFromRealtime", () => {
  it("upserts a broadcast order", async () => {
    const result = await applyOrdersFromRealtime(
      [serverOrder("o1", isoAt(1))],
      "pos",
      LOCATION,
    );
    expect(result.applied).toBe(1);
    expect(await countOrders()).toBe(1);
  });

  it("applies children through the same mapping as the pull", async () => {
    await applyOrdersFromRealtime(
      [
        serverOrder("o1", isoAt(1), {
          order_items: [{ id: "i1", item_name: "Burger", quantity: 1, unit_price: 9.5 }],
        }),
      ],
      "pos",
      LOCATION,
    );

    const item = await getDb()!.getFirstAsync<{
      item_name: string;
      unit_price_minor: number;
    }>("SELECT item_name, unit_price_minor FROM order_items");
    expect(item?.item_name).toBe("Burger");
    expect(item?.unit_price_minor).toBe(950);
  });

  /**
   * The negative property. This is the one that would be silently wrong.
   */
  it("NEVER advances the sync cursor", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const before = await readCursor("orders", LOCATION);
    expect(before.watermark).toBe(isoAt(1));

    // A broadcast far ahead of the cursor.
    await applyOrdersFromRealtime(
      [serverOrder("o99", isoAt(99))],
      "pos",
      LOCATION,
    );

    const after = await readCursor("orders", LOCATION);
    expect(after.watermark).toBe(isoAt(1)); // unchanged

    // ...and the proof of why that matters: the orders BETWEEN the cursor and
    // the broadcast are still fetched by the next delta pull.
    server.rows.push(serverOrder("o2", isoAt(2)), serverOrder("o3", isoAt(3)));
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const ids = await getDb()!.getAllAsync<{ id: string }>(
      "SELECT id FROM orders ORDER BY id",
    );
    expect(ids.map((r) => r.id)).toEqual(["o1", "o2", "o3", "o99"]);
  });

  it("refuses to write on a station that may not hold orders", async () => {
    const result = await applyOrdersFromRealtime(
      [serverOrder("o1", isoAt(1))],
      "kiosk",
      LOCATION,
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("station");
    expect(await countOrders()).toBe(0);
  });

  it("drops an unusable partial payload rather than guessing", async () => {
    // A broadcast without id/updated_at cannot be keyed or ordered. Dropping it
    // is safe: the delta pull brings the row in properly on the next cycle.
    const result = await applyOrdersFromRealtime(
      [{ status: "paid" } as Record<string, unknown>],
      "pos",
      LOCATION,
    );
    expect(result.applied).toBe(0);
    expect(result.reason).toBe("unusable payload");
    expect(await countOrders()).toBe(0);
  });

  it("keeps the usable half of a mixed batch", async () => {
    const result = await applyOrdersFromRealtime(
      [serverOrder("good", isoAt(1)), { status: "paid" }],
      "pos",
      LOCATION,
    );
    expect(result.applied).toBe(1);
    expect(await countOrders()).toBe(1);
  });

  it("is a no-op on an empty batch", async () => {
    const result = await applyOrdersFromRealtime([], "pos", LOCATION);
    expect(result.skipped).toBe(true);
  });
});

describe("deleteOrderFromRealtime", () => {
  it("removes the order and cascades its children", async () => {
    await applyOrdersFromRealtime(
      [
        serverOrder("o1", isoAt(1), {
          order_items: [{ id: "i1", item_name: "Burger", quantity: 1 }],
        }),
      ],
      "pos",
      LOCATION,
    );

    expect(await deleteOrderFromRealtime("o1", "pos")).toBe(true);
    expect(await countOrders()).toBe(0);

    const items = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM order_items",
    );
    expect(items?.n).toBe(0);
  });

  it("refuses on a station that may not hold orders", async () => {
    expect(await deleteOrderFromRealtime("o1", "kiosk")).toBe(false);
  });
});

describe("realtime and pull agree", () => {
  /**
   * Two mappings would mean a broadcast-applied row and a pull-applied row
   * could differ for the same order — invisible until someone compares two
   * stations at close-out. One shared mapping is what prevents it, and this
   * asserts they really do produce identical rows.
   */
  it("produces a byte-identical row either way", async () => {
    const order = serverOrder("o1", isoAt(1), {
      total_amount: 19.99,
      order_items: [{ id: "i1", item_name: "Burger", quantity: 2, unit_price: 9.5 }],
    });

    await applyOrdersFromRealtime([order], "pos", LOCATION);
    const viaRealtime = await getDb()!.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM orders WHERE id = 'o1'",
    );

    __resetLocalDbForTests();
    await destroyLocalDb();
    __resetLocalDbForTests();
    await initLocalDb();

    server.rows = [order];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    const viaPull = await getDb()!.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM orders WHERE id = 'o1'",
    );

    // _server_seen_at is a wall-clock stamp and legitimately differs.
    const normalize = (r: Record<string, unknown> | null) => {
      const { _server_seen_at, ...rest } = r ?? {};
      return rest;
    };
    expect(normalize(viaRealtime)).toEqual(normalize(viaPull));
  });
});
