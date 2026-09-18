/**
 * Phase 1 acceptance — the write boundary, against a REAL SQLite engine.
 *
 * __mocks__/expo-sqlite.js is backed by node:sqlite, so everything asserted
 * here is genuine SQL behaviour: the retention DELETE, ON DELETE CASCADE, the
 * immutable-id trigger, ON CONFLICT upserts and transaction rollback. A fake
 * would pass all of these while proving none of them.
 */
import { ENTITIES, type EntityDescriptor } from "@/lib/db/entities";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import { writeRows, type Row } from "@/lib/db/write";

const LOCATION = "loc-1";
const OTHER_LOCATION = "loc-2";

/** An orders row with every NOT NULL column satisfied. */
function orderRow(id: string, createdAt: string, locationId = LOCATION): Row {
  return {
    id,
    location_id: locationId,
    order_number: id,
    status: "completed",
    total_amount_minor: 1234,
    created_at: createdAt,
    updated_at: createdAt,
    _server_seen_at: "2026-08-28T00:00:00.000Z",
    payload: JSON.stringify({ id, total_amount: "12.34" }),
  };
}

/** ISO timestamps that sort lexicographically the same way they sort in time. */
function isoAt(minutesFromEpoch: number): string {
  return new Date(Date.UTC(2026, 0, 1) + minutesFromEpoch * 60_000).toISOString();
}

/** A copy of the orders descriptor with a small, test-sized cap. */
function ordersWithCap(maxRows: number | null): EntityDescriptor {
  return {
    ...ENTITIES.orders,
    retention: { ...ENTITIES.orders.retention, maxRows },
  };
}

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

describe("initLocalDb", () => {
  it("creates every table", async () => {
    const db = getDb()!;
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const names = rows.map((r) => r.name);
    for (const t of ["orders", "order_items", "order_payments", "menu_items", "staff", "sync_state"]) {
      expect(names).toContain(t);
    }
  });

  it("stamps the schema version", async () => {
    const row = await getDb()!.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });

  it("is idempotent — a second init does not duplicate or throw", async () => {
    await expect(initLocalDb()).resolves.toBeTruthy();
    const row = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders",
    );
    expect(row?.n).toBe(0);
  });
});

describe("station policy at the write boundary", () => {
  it("refuses an order write on a kiosk, and writes nothing", async () => {
    const result = await writeRows(ENTITIES.orders, "kiosk", LOCATION, [
      orderRow("o1", isoAt(1)),
    ]);

    expect(result.rejected).toBe(true);
    expect(result.written).toBe(0);

    // The important half: nothing reached the disk.
    const row = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders",
    );
    expect(row?.n).toBe(0);
  });

  it("refuses an order write on a KDS", async () => {
    const result = await writeRows(ENTITIES.orders, "kds", LOCATION, [
      orderRow("o1", isoAt(1)),
    ]);
    expect(result.rejected).toBe(true);
  });

  it("allows the menu on a kiosk", async () => {
    const result = await writeRows(ENTITIES.menu, "kiosk", LOCATION, [
      {
        id: "m1",
        location_id: LOCATION,
        name: "Lunch",
        is_active: 1,
        display_order: 0,
        updated_at: isoAt(1),
        _ordinal: 0,
        _server_seen_at: isoAt(1),
        payload: "{}",
      },
    ]);
    expect(result.rejected).toBe(false);
    expect(result.written).toBe(1);
  });
});

describe("upsert", () => {
  it("updates in place rather than duplicating on the same id", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [
      orderRow("o1", isoAt(1)),
    ]);
    await writeRows(ENTITIES.orders, "pos", LOCATION, [
      { ...orderRow("o1", isoAt(1)), status: "voided" },
    ]);

    const rows = await getDb()!.getAllAsync<{ id: string; status: string }>(
      "SELECT id, status FROM orders",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("voided");
  });
});

describe("retention", () => {
  /**
   * The headline Phase 1 assertion from the plan: insert cap + 500, exactly
   * cap survive, newest kept, retention_floor equals the oldest survivor.
   */
  it("keeps exactly `cap` rows, newest first, and records the floor", async () => {
    const cap = 50;
    const entity = ordersWithCap(cap);
    const total = cap + 500;

    const rows = Array.from({ length: total }, (_, i) =>
      orderRow(`o${String(i).padStart(4, "0")}`, isoAt(i)),
    );
    await writeRows(entity, "pos", LOCATION, rows);

    const db = getDb()!;
    const count = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE location_id = ?",
      [LOCATION],
    );
    expect(count?.n).toBe(cap);

    // Newest kept: the survivors are the last `cap` by created_at.
    const oldest = await db.getFirstAsync<{ created_at: string }>(
      "SELECT MIN(created_at) AS created_at FROM orders WHERE location_id = ?",
      [LOCATION],
    );
    expect(oldest?.created_at).toBe(isoAt(total - cap));

    const newest = await db.getFirstAsync<{ created_at: string }>(
      "SELECT MAX(created_at) AS created_at FROM orders WHERE location_id = ?",
      [LOCATION],
    );
    expect(newest?.created_at).toBe(isoAt(total - 1));

    // retention_floor is what screens read to state their window instead of
    // silently under-reporting past the cap.
    const state = await db.getFirstAsync<{
      retention_floor: string;
      row_count: number;
    }>("SELECT retention_floor, row_count FROM sync_state WHERE entity = ?", [
      entity.name,
    ]);
    expect(state?.retention_floor).toBe(isoAt(total - cap));
    expect(state?.row_count).toBe(cap);
  });

  it("prunes per location — one location never evicts another", async () => {
    const cap = 10;
    const entity = ordersWithCap(cap);

    await writeRows(
      entity,
      "pos",
      LOCATION,
      Array.from({ length: 30 }, (_, i) => orderRow(`a${i}`, isoAt(i))),
    );
    await writeRows(
      entity,
      "pos",
      OTHER_LOCATION,
      Array.from({ length: 5 }, (_, i) =>
        orderRow(`b${i}`, isoAt(i), OTHER_LOCATION),
      ),
    );

    const db = getDb()!;
    const a = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE location_id = ?",
      [LOCATION],
    );
    const b = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE location_id = ?",
      [OTHER_LOCATION],
    );
    expect(a?.n).toBe(cap);
    expect(b?.n).toBe(5); // under its own cap, untouched by the other location
  });

  it("takes child rows with the parent, via ON DELETE CASCADE", async () => {
    const cap = 2;
    const entity = ordersWithCap(cap);
    const db = getDb()!;

    await writeRows(entity, "pos", LOCATION, [
      orderRow("keep1", isoAt(10)),
      orderRow("keep2", isoAt(11)),
      orderRow("evict", isoAt(1)),
    ]);

    // The evicted parent is already gone; add items to a survivor and to a
    // row we are about to evict, then force another prune.
    await db.runAsync(
      `INSERT INTO order_items (id, order_id, item_name, payload)
       VALUES ('i1', 'keep1', 'Fries', '{}')`,
    );

    await writeRows(entity, "pos", LOCATION, [orderRow("keep3", isoAt(12))]);

    // keep1 is now the oldest of three and gets evicted — its item must go too.
    const orders = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM orders ORDER BY created_at",
    );
    expect(orders.map((o) => o.id)).toEqual(["keep2", "keep3"]);

    const items = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM order_items",
    );
    expect(items?.n).toBe(0);
  });

  it("does not prune an entity whose cap is null", async () => {
    const entity = ordersWithCap(null);
    await writeRows(
      entity,
      "pos",
      LOCATION,
      Array.from({ length: 200 }, (_, i) => orderRow(`o${i}`, isoAt(i))),
    );
    const count = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders",
    );
    expect(count?.n).toBe(200);
  });
});

describe("identity invariant", () => {
  it("refuses to rewrite an order id", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [
      orderRow("stable-id", isoAt(1)),
    ]);

    await expect(
      getDb()!.runAsync("UPDATE orders SET id = ? WHERE id = ?", [
        "rewritten",
        "stable-id",
      ]),
    ).rejects.toThrow(/immutable/);

    const row = await getDb()!.getFirstAsync<{ id: string }>(
      "SELECT id FROM orders",
    );
    expect(row?.id).toBe("stable-id");
  });
});

describe("atomicity", () => {
  it("writes nothing when one row in the batch is invalid", async () => {
    const bad: Row = { id: "b1" }; // missing NOT NULL columns
    const result = await writeRows(ENTITIES.orders, "pos", LOCATION, [
      orderRow("good", isoAt(1)),
      bad,
    ]);

    // Reporting 0 written is what stops a caller advancing a sync watermark
    // past rows that never landed.
    expect(result.written).toBe(0);

    const count = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders",
    );
    expect(count?.n).toBe(0);
  });
});
