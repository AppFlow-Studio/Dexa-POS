/**
 * v12 acceptance — the transactional outbox and the retention exemption.
 *
 * Against a REAL SQLite engine (__mocks__/expo-sqlite.js is backed by
 * node:sqlite), so transaction rollback, triggers and the retention DELETE are
 * genuine SQL behaviour rather than a fake agreeing with itself.
 *
 * The two properties under test are the ones the whole local-first design
 * rests on:
 *
 *   1. ATOMICITY — a row and its sync intent land together or not at all.
 *      This is what makes "local order created, server row didn't" —
 *      the reported failure — unrepresentable rather than merely unlikely.
 *   2. RETENTION EXEMPTION — a row the server has never seen is never pruned
 *      by a row cap. Before v12 pruning was free (every row was refetchable);
 *      now it can destroy a guest's check.
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  claimBatch,
  commitLocalWrite,
  hasUnsyncedWrites,
  markRejected,
  markRetry,
  markSynced,
  failedOpCount,
  nextLamport,
  observeRemoteLamport,
  pendingOpCount,
  backoffMs,
  purgeUnsyncableOps,
  requeueFailedOps,
  failedOpReasons,
  discardFailedOps,
  unsyncedItemIds,
  __resetLamportForTests,
} from "@/lib/db/outbox";
import { ENTITIES, type EntityDescriptor } from "@/lib/db/entities";
import {
  ADDITIVE_UPGRADES,
  isAdditiveUpgrade,
  SCHEMA_STATEMENTS,
  SCHEMA_VERSION,
  TABLES,
  TABLE_CONFLICT_KEYS,
  TABLES_WITH_SYNC_STATUS,
} from "@/lib/db/schema";
import { writeBatch, writeRows, type Row } from "@/lib/db/write";

const LOCATION = "loc-1";

function orderRow(
  id: string,
  createdAt: string,
  syncStatus = "synced",
): Row {
  return {
    id,
    location_id: LOCATION,
    order_number: id,
    status: "completed",
    total_amount_minor: 1234,
    created_at: createdAt,
    updated_at: createdAt,
    _sync_status: syncStatus,
    _server_seen_at: "2026-09-07T00:00:00.000Z",
    payload: JSON.stringify({ id }),
  };
}

function isoAt(minutes: number): string {
  return new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString();
}

function ordersWithCap(maxRows: number | null): EntityDescriptor {
  return {
    ...ENTITIES.orders,
    retention: { ...ENTITIES.orders.retention, maxRows },
  };
}

beforeEach(async () => {
  __resetLamportForTests();
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

describe("schema declarations stay in sync with the DDL", () => {
  /**
   * The comment on TABLES_WITH_SYNC_STATUS promises this test. Without it,
   * adding `_sync_status` to a new table and forgetting to list it means
   * retention silently deletes that table's unsent rows — the failure is
   * invisible until someone loses an order.
   */
  it("TABLES_WITH_SYNC_STATUS matches every table declaring the column", () => {
    const declaring = new Set<string>();
    for (const stmt of SCHEMA_STATEMENTS) {
      const m = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*)/.exec(stmt);
      if (m && m[2].includes("_sync_status")) declaring.add(m[1]);
    }
    expect([...declaring].sort()).toEqual([...TABLES_WITH_SYNC_STATUS].sort());
  });

  it("every composite-PK table is declared in TABLE_CONFLICT_KEYS", () => {
    // Re-asserted for the v12 tables specifically: an undeclared composite key
    // upserts on its first column, which SQLite rejects and writeBatch
    // swallows into a rolled-back batch — looking like "the mirror is empty"
    // rather than "the conflict target is wrong".
    expect(TABLE_CONFLICT_KEYS.table_session_tables).toEqual([
      "session_id",
      "table_id",
    ]);
    expect(TABLE_CONFLICT_KEYS.order_seats).toEqual(["order_id", "item_id"]);
  });

  it("outbox is dropped first so no foreign key can block a rebuild", () => {
    // DROP_STATEMENTS walks TABLES in reverse, so outbox must be last here.
    expect(TABLES[TABLES.length - 1]).toBe("outbox");
  });
});

// ---------------------------------------------------------------------------

describe("v11 -> v12 upgrade keeps production data", () => {
  /**
   * Track A is LIVE. Every tablet holds a populated mirror, so the v12 bump
   * must not go through DROP_STATEMENTS — that would force a full cold
   * re-sync (up to the 20,000-order retention cap) on every device, on the
   * update that ships v12.
   *
   * v12 only ADDS tables, so re-running the CREATE ... IF NOT EXISTS
   * statements is enough.
   */
  it("preserves existing rows and still creates the new tables", async () => {
    const db = getDb()!;

    await db.runAsync(
      `INSERT INTO orders (id, location_id, order_number, status, created_at, updated_at, _sync_status, _server_seen_at, payload)
       VALUES ('survivor', ?, 'ORD-1', 'completed', ?, ?, 'synced', ?, '{}')`,
      [LOCATION, isoAt(0), isoAt(0), isoAt(0)],
    );

    // Simulate a device that upgraded from the shipped v11 build: the v11
    // tables exist and hold data, and user_version still says 11.
    await db.execAsync("PRAGMA user_version = 11");
    await db.execAsync("DROP TABLE IF EXISTS outbox");

    __resetLocalDbForTests();
    await initLocalDb();

    const reopened = getDb()!;

    const survivor = await reopened.getFirstAsync<{ id: string }>(
      `SELECT id FROM orders WHERE id = 'survivor'`,
    );
    const version = await reopened.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    const outbox = await reopened.getAllAsync(`SELECT * FROM outbox`);

    // The order the store had is still there...
    expect(survivor?.id).toBe("survivor");
    // ...the version advanced...
    expect(version?.user_version).toBe(12);
    // ...and the new table exists (querying a missing table would throw).
    expect(outbox).toEqual([]);
  });

  it("isAdditiveUpgrade pins the target so a later destructive bump rebuilds", () => {
    // If SCHEMA_VERSION moves to 13 and nobody updates ADDITIVE_UPGRADES, the
    // v11 entry stops matching and the upgrade correctly falls back to
    // drop-and-rebuild rather than leaving a v12 file claiming to be v13.
    expect(isAdditiveUpgrade(11)).toBe(true);
    expect(isAdditiveUpgrade(9)).toBe(false);
    expect(ADDITIVE_UPGRADES.every((u) => u.to === SCHEMA_VERSION)).toBe(true);
  });
});

describe("commitLocalWrite — atomicity", () => {
  it("writes the row and its outbox op together", async () => {
    const db = getDb()!;
    const result = await commitLocalWrite(
      [
        {
          sql: `INSERT INTO orders (id, location_id, order_number, status, created_at, updated_at, _sync_status, _server_seen_at, payload)
                VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?)`,
          args: [
            "ord-1",
            LOCATION,
            "ORD-1",
            "draft",
            isoAt(0),
            isoAt(0),
            isoAt(0),
            "{}",
          ],
        },
      ],
      [
        {
          id: "op-1",
          op: "create_order",
          entity: "order",
          entityId: "ord-1",
          orderId: "ord-1",
          payload: { hello: "world" },
          baseVersion: 0,
        },
      ],
    );

    expect(result.ok).toBe(true);
    const order = await db.getFirstAsync<{ id: string; _sync_status: string }>(
      `SELECT id, _sync_status FROM orders WHERE id = 'ord-1'`,
    );
    const op = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM outbox WHERE id = 'op-1'`,
    );
    expect(order?._sync_status).toBe("local");
    expect(op?.id).toBe("op-1");
  });

  it("leaves NOTHING behind when any statement fails", async () => {
    const db = getDb()!;
    // Second statement violates NOT NULL on location_id, so the transaction
    // must roll back — including the first insert AND the outbox op.
    const result = await commitLocalWrite(
      [
        {
          sql: `INSERT INTO orders (id, location_id, order_number, status, created_at, updated_at, _sync_status, _server_seen_at, payload)
                VALUES ('ord-ok', ?, 'A', 'draft', ?, ?, 'local', ?, '{}')`,
          args: [LOCATION, isoAt(0), isoAt(0), isoAt(0)],
        },
        {
          sql: `INSERT INTO orders (id, location_id, created_at, updated_at, _server_seen_at, payload)
                VALUES ('ord-bad', NULL, ?, ?, ?, '{}')`,
          args: [isoAt(0), isoAt(0), isoAt(0)],
        },
      ],
      [
        {
          id: "op-bad",
          op: "create_order",
          entity: "order",
          entityId: "ord-ok",
          payload: {},
        },
      ],
    );

    expect(result.ok).toBe(false);

    // THE point of the whole design: no half state.
    const orders = await db.getAllAsync(`SELECT id FROM orders`);
    const ops = await db.getAllAsync(`SELECT id FROM outbox`);
    expect(orders).toHaveLength(0);
    expect(ops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("retention exemption for unsynced rows", () => {
  it("prunes synced rows past the cap but never unsynced ones", async () => {
    const db = getDb()!;

    // Six synced orders, newest last, cap of 2.
    const rows: Row[] = [];
    for (let i = 0; i < 6; i++) rows.push(orderRow(`synced-${i}`, isoAt(i)));

    // One unsynced order that is also the OLDEST, so `pruneBy` sorting alone
    // would delete it first. This is not hypothetical: an order rung up during
    // an outage yesterday sorts old and is exactly the row worth protecting.
    rows.push(orderRow("unsynced-old", isoAt(-1000), "local"));

    // Written through the CAPPED descriptor so retention runs inside the same
    // transaction as the insert — which is how the real boundary works, and
    // why a separate empty writeBatch would short-circuit before pruning.
    await writeRows(ordersWithCap(2), "pos", LOCATION, rows);

    const surviving = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM orders ORDER BY id`,
    );
    const ids = surviving.map((r) => r.id);

    // The unsynced row survives despite being the OLDEST and far outside a
    // cap of 2. This is the assertion that matters: without the exemption a
    // row cap silently destroys an order the server has never seen.
    expect(ids).toContain("unsynced-old");

    // The cap still bites on synced rows — the exemption must not disable
    // retention, only carve out what is unsafe to delete.
    const syncedSurvivors = ids.filter((i) => i.startsWith("synced-"));
    expect(syncedSurvivors).toEqual(["synced-4", "synced-5"]);
  });

  it("still prunes once an unsynced row has drained to synced", async () => {
    // The exemption is about SAFETY, not permanence: once the server has the
    // row it becomes refetchable again and rejoins the normal cap.
    const db = getDb()!;
    const rows: Row[] = [];
    for (let i = 0; i < 6; i++) rows.push(orderRow(`s-${i}`, isoAt(i)));
    rows.push(orderRow("was-local", isoAt(-1000), "local"));
    await writeRows(ordersWithCap(2), "pos", LOCATION, rows);
    expect(
      await db.getFirstAsync(`SELECT id FROM orders WHERE id = 'was-local'`),
    ).toBeTruthy();

    await db.runAsync(
      `UPDATE orders SET _sync_status = 'synced' WHERE id = 'was-local'`,
    );
    await writeRows(ordersWithCap(2), "pos", LOCATION, [
      orderRow("s-9", isoAt(9)),
    ]);

    expect(
      await db.getFirstAsync(`SELECT id FROM orders WHERE id = 'was-local'`),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("identity invariant — ids are immutable", () => {
  it("refuses to rewrite an order_items id", async () => {
    const db = getDb()!;
    await db.runAsync(
      `INSERT INTO orders (id, location_id, created_at, updated_at, _server_seen_at, payload)
       VALUES ('o1', ?, ?, ?, ?, '{}')`,
      [LOCATION, isoAt(0), isoAt(0), isoAt(0)],
    );
    await db.runAsync(
      `INSERT INTO order_items (id, order_id, item_name, payload) VALUES ('i1','o1','Burger','{}')`,
    );

    await expect(
      db.runAsync(`UPDATE order_items SET id = 'i2' WHERE id = 'i1'`),
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses to rewrite a table_sessions id", async () => {
    const db = getDb()!;
    await db.runAsync(
      `INSERT INTO table_sessions (id, location_id, created_at, updated_at, payload)
       VALUES ('s1', ?, ?, ?, '{}')`,
      [LOCATION, isoAt(0), isoAt(0)],
    );

    await expect(
      db.runAsync(`UPDATE table_sessions SET id = 's2' WHERE id = 's1'`),
    ).rejects.toThrow(/immutable/i);
  });
});

// ---------------------------------------------------------------------------

describe("drain bookkeeping", () => {
  async function seedOp(id: string, entityId = "ord-1") {
    await commitLocalWrite(
      [
        {
          sql: `INSERT OR IGNORE INTO orders (id, location_id, created_at, updated_at, _sync_status, _server_seen_at, payload)
                VALUES (?, ?, ?, ?, 'local', ?, '{}')`,
          args: [entityId, LOCATION, isoAt(0), isoAt(0), isoAt(0)],
        },
      ],
      [{ id, op: "add_item", entity: "order_item", entityId, payload: {} }],
    );
  }

  it("claims eligible ops oldest-first and skips backed-off ones", async () => {
    await seedOp("op-a");
    await seedOp("op-b");

    let claimed = await claimBatch();
    expect(claimed.map((o) => o.id)).toEqual(["op-a", "op-b"]);

    // Back op-a off into the future; it must disappear from the claim.
    await markRetry("op-a", 3, "network");
    claimed = await claimBatch();
    expect(claimed.map((o) => o.id)).toEqual(["op-b"]);
  });

  it("deletes the op on success — a drained outbox is an EMPTY table", async () => {
    await seedOp("op-c");
    expect(await pendingOpCount()).toBe(1);

    await markSynced("op-c", { table: "orders", id: "ord-1" });

    expect(await pendingOpCount()).toBe(0);
    expect(await hasUnsyncedWrites()).toBe(false);
  });

  it("keeps the row 'local' while ANY other op is still queued", async () => {
    const db = getDb()!;
    await seedOp("op-d");
    await seedOp("op-e");

    await markSynced("op-d", { table: "orders", id: "ord-1" });

    // op-e still references ord-1, so marking the row synced now would hide a
    // pending write from every "is this order fully synced?" check.
    const row = await db.getFirstAsync<{ _sync_status: string }>(
      `SELECT _sync_status FROM orders WHERE id = 'ord-1'`,
    );
    expect(row?._sync_status).toBe("local");
  });

  it("reports the stored reason each op was parked", async () => {
    // A parked op from an earlier session is correctly NOT retried, so it
    // emits no fresh error — the only symptom is a count that never drops.
    // last_error was always stored; it just was never read back.
    await seedOp("op-a");
    await seedOp("op-b", "ord-2");
    await markRejected("op-a", "modifier_group_name violates not-null", {
      table: "orders",
      id: "ord-1",
    });
    await markRejected("op-b", "modifier_group_name violates not-null", {
      table: "orders",
      id: "ord-2",
    });

    const reasons = await failedOpReasons();

    expect(reasons).toHaveLength(1);
    expect(reasons[0].count).toBe(2);
    expect(reasons[0].reason).toMatch(/modifier_group_name/);
  });

  it("discardFailedOps drops the intent but keeps the local rows", async () => {
    const db = getDb()!;
    await seedOp("op-dead2");
    await markRejected("op-dead2", "unfixable", { table: "orders", id: "ord-1" });

    const discarded = await discardFailedOps();

    expect(discarded).toBe(1);
    expect(await failedOpCount()).toBe(0);
    // The order itself is untouched — this discards syncing, not data.
    const row = await db.getFirstAsync(`SELECT id FROM orders WHERE id = 'ord-1'`);
    expect(row).toBeTruthy();
  });

  it("names exactly which items are not on the server", async () => {
    // The diagnostic behind KITCHEN_ITEMS_UNRESOLVED: an id on the cart line
    // whose row is still 'local' is an item the server cannot route.
    const db = getDb()!;
    await db.runAsync(
      `INSERT INTO orders (id, location_id, created_at, updated_at, _server_seen_at, payload)
       VALUES ('o1', ?, ?, ?, ?, '{}')`,
      [LOCATION, isoAt(0), isoAt(0), isoAt(0)],
    );
    await db.runAsync(
      `INSERT INTO order_items (id, order_id, item_name, _sync_status, payload)
       VALUES ('i-synced','o1','A','synced','{}')`,
    );
    await db.runAsync(
      `INSERT INTO order_items (id, order_id, item_name, _sync_status, payload)
       VALUES ('i-local','o1','B','local','{}')`,
    );

    const missing = await unsyncedItemIds([
      "i-synced",
      "i-local",
      "i-does-not-exist",
    ]);

    // Unsynced AND entirely absent both count as "the server does not have it".
    expect(missing.sort()).toEqual(["i-does-not-exist", "i-local"]);
  });

  it("requeues failed ops once, so a shipped fix can recover them", async () => {
    // Every bug found in the field (non-uuid item ids, un-flattened modifier
    // payloads) parks the ops that hit it. Without a requeue those orders stay
    // stranded even though the next build would push them fine.
    await seedOp("op-was-broken");
    await markRejected("op-was-broken", "some bug now fixed", {
      table: "orders",
      id: "ord-1",
    });
    expect((await claimBatch()).map((o) => o.id)).not.toContain("op-was-broken");

    const requeued = await requeueFailedOps();

    expect(requeued).toBe(1);
    expect((await claimBatch()).map((o) => o.id)).toContain("op-was-broken");
  });

  it("never re-claims an op that was permanently rejected", async () => {
    // REGRESSION (real device): claimBatch used `status != 'inflight'`, which
    // also matched 'failed'. Every permanently-rejected op was re-pushed on
    // EVERY drain — one tap replaying twenty dead ops, flooding the log and
    // calling the server with requests that can never succeed.
    await seedOp("op-dead");
    await markRejected("op-dead", "invalid input syntax for type uuid", {
      table: "orders",
      id: "ord-1",
    });

    const claimed = await claimBatch();
    expect(claimed.map((o) => o.id)).not.toContain("op-dead");
  });

  it("purges ops whose entity id can never be a uuid", async () => {
    const db = getDb()!;
    await commitLocalWrite(
      [],
      [
        {
          id: "op-legacy",
          op: "create_order",
          entity: "order",
          entityId: "order_1788799538394_vxvqwc",
          payload: {},
        },
        {
          id: "op-good",
          op: "create_order",
          entity: "order",
          entityId: "8ce00f36-d090-472d-bd71-36812d6c9cfb",
          payload: {},
        },
      ],
    );

    // An op whose ENTITY id is a valid uuid but whose ORDER id is legacy is
    // just as unsyncable — the order can never exist server-side, so the push
    // fails on p_order_id forever. Purging on entity_id alone left exactly
    // these behind.
    await commitLocalWrite(
      [],
      [
        {
          id: "op-legacy-order",
          op: "add_item",
          entity: "order_item",
          entityId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
          orderId: "order_1788799823504_fgvy5k",
          payload: {},
        },
      ],
    );

    const purged = await purgeUnsyncableOps();

    expect(purged).toBe(2);
    const left = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM outbox ORDER BY id`,
    );
    expect(left.map((r) => r.id)).toEqual(["op-good"]);
  });

  it("parks a rejection as failed and flags the row, never dropping it", async () => {
    const db = getDb()!;
    await seedOp("op-f");

    await markRejected("op-f", "order locked for payment", {
      table: "orders",
      id: "ord-1",
    });

    const op = await db.getFirstAsync<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM outbox WHERE id = 'op-f'`,
    );
    const row = await db.getFirstAsync<{ _sync_status: string }>(
      `SELECT _sync_status FROM orders WHERE id = 'ord-1'`,
    );

    // Still present — an operator has to be able to see what did not apply.
    expect(op?.status).toBe("failed");
    expect(op?.last_error).toMatch(/locked/);
    expect(row?._sync_status).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------

describe("lamport clock", () => {
  it("is monotonic", () => {
    const a = nextLamport();
    const b = nextLamport();
    expect(b).toBeGreaterThan(a);
  });

  it("advances past an observed remote value", () => {
    // The half people forget. Without it a device at 12 can never win a merge
    // against a peer at 900, no matter how much later it writes.
    observeRemoteLamport(9000);
    expect(nextLamport()).toBeGreaterThan(9000);
  });

  it("ignores junk rather than corrupting the clock", () => {
    const before = nextLamport();
    observeRemoteLamport(null);
    observeRemoteLamport(undefined);
    observeRemoteLamport(Number.NaN);
    expect(nextLamport()).toBeGreaterThan(before);
  });
});

describe("backoff", () => {
  it("grows exponentially and is capped at 5 minutes", () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(99)).toBe(5 * 60 * 1000);
  });
});
