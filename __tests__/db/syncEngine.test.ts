/**
 * Phase 2 acceptance — the delta sync engine.
 *
 * Every assertion here maps to a "Done when" or "Watch for" line in the plan:
 *
 *   - cold sync populates the window and the watermark advances
 *   - a second sync with no changes returns ZERO rows and writes nothing
 *   - killing the app mid-pull resumes at the same page, no gap, no duplicate
 *   - two rows sharing a millisecond both land, and the loop terminates
 *   - a hard delete survives a delta pull but is caught by the manifest
 *   - >>> the watermark NEVER advances past rows that failed to apply <<<
 *
 * The last one is the whole design. It is asserted directly, twice.
 */
import {
    pullOrdersDelta,
    pullOrdersManifest,
    registerOrdersDescriptor,
} from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import {
    __resetLocalDbForTests,
    destroyLocalDb,
    getDb,
    initLocalDb,
} from "@/lib/db/index";
import {
    computeLaggedCursor,
    DEFAULT_PAGE_SIZE,
    MAX_PAGES_PER_CYCLE,
    readCursor,
    readRetentionCap,
    reconcileManifest,
    resetCursor,
    syncEntity,
} from "@/lib/db/syncEngine";
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

async function orderIds(): Promise<string[]> {
  const rows = await getDb()!.getAllAsync<{ id: string }>(
    "SELECT id FROM orders ORDER BY updated_at, id",
  );
  return rows.map((r) => r.id);
}

beforeAll(() => {
  registerOrdersDescriptor();
});

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

describe("cold sync", () => {
  it("pulls every row and advances the watermark to the last one", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1)),
      serverOrder("o2", isoAt(2)),
      serverOrder("o3", isoAt(3)),
    ];

    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    expect(result.error).toBeNull();
    expect(result.rowsWritten).toBe(3);
    expect(await countOrders()).toBe(3);

    const cursor = await readCursor("orders", LOCATION);
    expect(cursor.watermark).toBe(isoAt(3));
    expect(cursor.watermarkId).toBe("o3");
  });

  it("maps money into minor units without floating-point drift", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), { total_amount: 19.99, subtotal: 18.35 }),
    ];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const row = await getDb()!.getFirstAsync<{
      total_amount_minor: number;
      subtotal_minor: number;
    }>("SELECT total_amount_minor, subtotal_minor FROM orders");

    expect(row?.total_amount_minor).toBe(1999);
    expect(row?.subtotal_minor).toBe(1835);
  });

  it("keeps the server's exact value in payload for display", async () => {
    server.rows = [serverOrder("o1", isoAt(1), { total_amount: 19.99 })];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const row = await getDb()!.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM orders",
    );
    expect(JSON.parse(row!.payload).total_amount).toBe(19.99);
  });

  it("backfills rows pruned under an older, smaller retention cap", async () => {
    // 20 server orders, newest by created_at wins the prune.
    server.rows = Array.from({ length: 20 }, (_, i) =>
      serverOrder(`o${i + 1}`, isoAt(i + 1)),
    );

    const descriptor = ENTITIES.orders;
    const originalCap = descriptor.retention.maxRows;
    try {
      // First sync under a small cap: only the newest 5 survive, and the
      // watermark advances past the pruned ones (they can never re-fetch).
      (descriptor.retention as { maxRows: number | null }).maxRows = 5;
      await syncEntity(descriptor, "pos", supabase(), LOCATION);
      expect(await countOrders()).toBe(5);
      expect(await readRetentionCap("orders", LOCATION)).toBe(5);

      // Raise the cap: the next cycle must detect it and backfill to 20.
      (descriptor.retention as { maxRows: number | null }).maxRows = 20;
      const result = await syncEntity(descriptor, "pos", supabase(), LOCATION);
      expect(result.error).toBeNull();
      expect(await countOrders()).toBe(20);

      // Recorded cap matches the new value — no repeat reset next cycle.
      expect(await readRetentionCap("orders", LOCATION)).toBe(20);
    } finally {
      (descriptor.retention as { maxRows: number | null }).maxRows =
        originalCap;
    }
  });

  it("writes embedded items and payments in the same transaction", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), {
        order_items: [
          { id: "i1", item_name: "Burger", quantity: 2, unit_price: 9.5 },
          { id: "i2", item_name: "Fries", quantity: 1, unit_price: 3.25 },
        ],
        order_payments: [
          {
            id: "p1",
            payment_method: "cash",
            amount: 22.25,
            initiated_at: isoAt(1),
          },
        ],
      }),
    ];

    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const items = await getDb()!.getAllAsync<{ id: string; item_name: string }>(
      "SELECT id, item_name FROM order_items ORDER BY id",
    );
    expect(items.map((i) => i.item_name)).toEqual(["Burger", "Fries"]);

    const pay = await getDb()!.getFirstAsync<{ amount_minor: number }>(
      "SELECT amount_minor FROM order_payments",
    );
    expect(pay?.amount_minor).toBe(2225);
  });

  it("mirrors voided items — the void IS the tombstone", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), {
        order_items: [
          {
            id: "i1",
            item_name: "Burger",
            quantity: 1,
            is_voided: true,
            voided_at: isoAt(2),
          },
        ],
      }),
    ];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const item = await getDb()!.getFirstAsync<{ is_voided: number }>(
      "SELECT is_voided FROM order_items",
    );
    expect(item?.is_voided).toBe(1);
  });
});

describe("steady state — the whole point of a delta", () => {
  it("returns zero rows and writes nothing when nothing changed", async () => {
    server.rows = [serverOrder("o1", isoAt(1)), serverOrder("o2", isoAt(2))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.reset();
    const second = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    expect(second.wasEmpty).toBe(true);
    expect(second.rowsWritten).toBe(0);
    // ONE round trip, and it came back empty. Compare against re-fetching the
    // full 536-1108 ms embed every cycle, which is what happens today.
    expect(server.requestCount).toBe(1);
    expect(await countOrders()).toBe(2);
  });

  it("still records a successful check, so freshness does not go stale", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    await getDb()!.runAsync(
      "UPDATE sync_state SET last_success_at = ? WHERE entity = 'orders'",
      ["2020-01-01T00:00:00.000Z"],
    );

    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const row = await getDb()!.getFirstAsync<{ last_success_at: string }>(
      "SELECT last_success_at FROM sync_state WHERE entity = 'orders'",
    );
    expect(row!.last_success_at).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("picks up only what changed after the first sync", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.rows.push(serverOrder("o2", isoAt(5)));
    const second = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    expect(second.rowsWritten).toBe(1); // o2 only, not o1 again
    expect(await orderIds()).toEqual(["o1", "o2"]);
  });

  it("re-pulls a row whose updated_at moved, and upserts in place", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.rows[0] = serverOrder("o1", isoAt(9), { status: "voided" });
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    expect(await countOrders()).toBe(1);
    const row = await getDb()!.getFirstAsync<{ status: string }>(
      "SELECT status FROM orders",
    );
    expect(row?.status).toBe("voided");
  });
});

describe("keyset pagination", () => {
  it("pages through a large cold sync with no gap and no duplicate", async () => {
    server.rows = Array.from({ length: 25 }, (_, i) =>
      serverOrder(`o${String(i).padStart(3, "0")}`, isoAt(i)),
    );

    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
      { pageSize: 10 },
    );

    expect(result.pages).toBe(3); // 10 + 10 + 5
    expect(await countOrders()).toBe(25);
    expect(await orderIds()).toEqual(server.rows.map((r) => r.id));
  });

  /**
   * The tie case. Two rows sharing a millisecond are not hypothetical — two
   * stations writing in the same tick produce exactly this. Without the id
   * tiebreak, `gt` skips one forever and `gte` loops on the same page.
   */
  it("handles rows sharing a watermark: both land, and the loop terminates", async () => {
    const t = isoAt(5);
    server.rows = [
      serverOrder("a", t),
      serverOrder("b", t),
      serverOrder("c", t),
      serverOrder("d", isoAt(6)),
    ];

    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
      { pageSize: 2 },
    );

    expect(result.hitPageLimit).toBe(false);
    expect(await orderIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("does not drift when rows are inserted mid-pull", async () => {
    server.rows = Array.from({ length: 20 }, (_, i) =>
      serverOrder(`o${String(i).padStart(3, "0")}`, isoAt(i)),
    );

    // Page 1 of 2 lands, then the server gains a row in the ALREADY-READ range.
    // With OFFSET paging this shifts the window and skips a row; with keyset it
    // cannot, because the cursor is a value, not a position.
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION, {
      pageSize: 10,
    });
    server.rows.push(serverOrder("late", isoAt(3)));
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION, {
      pageSize: 10,
    });

    // "late" is behind the cursor so it is not picked up by the delta — that is
    // correct and expected; it is what the manifest/full resync is for. What
    // matters is that nothing already synced was LOST or duplicated.
    const ids = await orderIds();
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toHaveLength(20);
  });

  it("stops at the page cap and resumes exactly there next cycle", async () => {
    server.rows = Array.from({ length: MAX_PAGES_PER_CYCLE + 10 }, (_, i) =>
      serverOrder(`o${String(i).padStart(4, "0")}`, isoAt(i)),
    );

    const first = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
      { pageSize: 1 },
    );
    expect(first.hitPageLimit).toBe(true);
    expect(await countOrders()).toBe(MAX_PAGES_PER_CYCLE);

    const second = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
      { pageSize: 1 },
    );
    expect(second.rowsWritten).toBe(10);
    expect(await countOrders()).toBe(MAX_PAGES_PER_CYCLE + 10);
  });
});

describe("resumability — the crash case", () => {
  it("resumes at the interrupted page, losing nothing and duplicating nothing", async () => {
    server.rows = Array.from({ length: 9 }, (_, i) =>
      serverOrder(`o${i}`, isoAt(i)),
    );

    // Interrupt after page 1 of 3. Failing the SECOND request is the faithful
    // simulation of a process kill mid-pull: page 1 is committed and durable,
    // page 2 never happened.
    server.failNext = null;
    const originalFrom = server.from.bind(server);
    let calls = 0;
    (server as any).from = (table: string) => {
      calls += 1;
      if (calls === 2) server.failNext = new Error("process killed");
      return originalFrom(table);
    };

    const interrupted = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
      { pageSize: 3 },
    );
    expect(interrupted.error).toContain("process killed");
    expect(await countOrders()).toBe(3);

    // The cursor sits exactly at the end of the last COMMITTED page.
    const cursor = await readCursor("orders", LOCATION);
    expect(cursor.watermark).toBe(isoAt(2));
    expect(cursor.watermarkId).toBe("o2");

    // Relaunch: fresh handle, same file, restored network.
    (server as any).from = originalFrom;
    __resetLocalDbForTests();
    await initLocalDb();

    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION, {
      pageSize: 3,
    });

    const ids = await orderIds();
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9); // no duplicate from the redone page
    expect(ids).toEqual(server.rows.map((r) => r.id));
  });
});

describe("THE invariant — the watermark never outruns the data", () => {
  /**
   * If the cursor advances past rows that failed to apply, the engine will
   * never fetch them again: a silent, permanent hole that no retry heals. The
   * write and the cursor share one transaction precisely to make this
   * impossible, and this is the test that proves it.
   */
  it("leaves the cursor untouched when the write rolls back", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    const before = await readCursor("orders", LOCATION);
    expect(before.watermark).toBe(isoAt(1));

    // A malformed server row: created_at is NOT NULL locally and the descriptor
    // passes it through unsanitized (unlike item_name, which it coalesces). The
    // batch must roll back whole, cursor included.
    server.rows.push(
      serverOrder("o2", isoAt(2), { created_at: null as never }),
    );

    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    expect(result.error).toMatch(/watermark not advanced/);

    const after = await readCursor("orders", LOCATION);
    expect(after.watermark).toBe(isoAt(1)); // NOT isoAt(2)
    expect(await countOrders()).toBe(1); // o2 did not land

    // And the proof it is recoverable: fix the data, re-sync, o2 arrives.
    server.rows[1] = serverOrder("o2", isoAt(2));
    const retry = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );
    expect(retry.error).toBeNull();
    expect(await orderIds()).toEqual(["o1", "o2"]);
  });

  it("leaves the cursor untouched when the network fails", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.failNext = new Error("network down");
    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    expect(result.error).toContain("network down");
    const cursor = await readCursor("orders", LOCATION);
    expect(cursor.watermark).toBe(isoAt(1));

    // The failure is recorded where the freshness UI can see it.
    const row = await getDb()!.getFirstAsync<{ last_error: string }>(
      "SELECT last_error FROM sync_state WHERE entity = 'orders'",
    );
    expect(row?.last_error).toContain("network down");
  });
});

describe("station policy", () => {
  it("does nothing for orders on a kiosk, without error", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    const result = await syncEntity(
      ENTITIES.orders,
      "kiosk",
      supabase(),
      LOCATION,
    );
    expect(result.error).toBeNull();
    expect(result.rowsWritten).toBe(0);
    expect(server.requestCount).toBe(0); // not even a round trip
    expect(await countOrders()).toBe(0);
  });
});

describe("manifest reconcile — hard deletes", () => {
  it("does not remove a row that was merely voided (that rides the delta)", async () => {
    server.rows = [serverOrder("o1", isoAt(1)), serverOrder("o2", isoAt(2))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.rows[0] = serverOrder("o1", isoAt(3), { voided_at: isoAt(3) });
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const res = await reconcileManifest(ENTITIES.orders, supabase(), LOCATION);
    expect(res.deleted).toBe(0);
    expect(await countOrders()).toBe(2);
  });

  it("removes a row the server hard-deleted", async () => {
    server.rows = [serverOrder("o1", isoAt(1)), serverOrder("o2", isoAt(2))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    expect(await countOrders()).toBe(2);

    // A hard DELETE leaves no trace, so the delta cannot see it...
    server.rows = server.rows.filter((r) => r.id !== "o1");
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    expect(await countOrders()).toBe(2); // still here — expected

    // ...but the manifest catches it.
    const res = await reconcileManifest(ENTITIES.orders, supabase(), LOCATION);
    expect(res.deleted).toBe(1);
    expect(await orderIds()).toEqual(["o2"]);
  });

  it("cascades children when it removes an orphan", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), {
        order_items: [{ id: "i1", item_name: "Burger", quantity: 1 }],
      }),
      // A survivor is required: an EMPTY manifest is refused outright (see the
      // safety-valve test below), so deleting every server row would prove
      // nothing about cascade.
      serverOrder("o2", isoAt(2)),
    ];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.rows = server.rows.filter((r) => r.id !== "o1");
    const res = await reconcileManifest(ENTITIES.orders, supabase(), LOCATION);

    expect(res.deleted).toBe(1);
    const items = await getDb()!.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM order_items",
    );
    expect(items?.n).toBe(0);
  });

  /**
   * The safety valve. An empty manifest for a window we hold rows in is far
   * more likely to be a broken query, an RLS change or a filtered response than
   * a genuine mass deletion — and the cost of being wrong is wiping real
   * history. Refusing it is the right asymmetry.
   */
  it("refuses to act on an empty manifest", async () => {
    server.rows = [serverOrder("o1", isoAt(1)), serverOrder("o2", isoAt(2))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.rows = [];
    const res = await reconcileManifest(ENTITIES.orders, supabase(), LOCATION);

    expect(res.deleted).toBe(0);
    expect(await countOrders()).toBe(2);
  });

  it("records when it last ran", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    await reconcileManifest(ENTITIES.orders, supabase(), LOCATION);

    const row = await getDb()!.getFirstAsync<{ last_manifest_at: string }>(
      "SELECT last_manifest_at FROM sync_state WHERE entity = 'orders'",
    );
    expect(row?.last_manifest_at).toBeTruthy();
  });

  it("does not orphan rows beyond PostgREST's 1000-row response cap", async () => {
    // The un-paginated manifest returned only the first ~1000 ids, and the
    // reconcile then DELETED every local row beyond that as an "orphan".
    // This is the exact bug that emptied a live mirror to ~2600 of ~4000.
    server.rows = Array.from({ length: 1050 }, (_, i) =>
      serverOrder(`o${String(i + 1).padStart(4, "0")}`, isoAt(i + 1)),
    );
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);
    expect(await countOrders()).toBe(1050);

    const result = await reconcileManifest(
      ENTITIES.orders,
      supabase(),
      LOCATION,
    );
    expect(result.deleted).toBe(0);
    expect(await countOrders()).toBe(1050);
  });
});

describe("resetCursor", () => {
  it("forces a full re-pull without dropping what is on screen", async () => {
    server.rows = [serverOrder("o1", isoAt(1)), serverOrder("o2", isoAt(2))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    await resetCursor("orders", LOCATION);

    // Rows stay — the UI keeps rendering while the re-pull runs.
    expect(await countOrders()).toBe(2);
    expect((await readCursor("orders", LOCATION)).watermark).toBeNull();

    const again = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );
    expect(again.rowsWritten).toBe(2);
    expect(await countOrders()).toBe(2); // upsert, not duplicate
  });
});

describe("watermark lag — the late-commit skip", () => {
  /**
   * The bug this defends against, found by verification query A4:
   *
   * `orders.updated_at` is stamped by a BEFORE UPDATE trigger calling
   * `update_updated_at_column()`, which uses now() — TRANSACTION START time.
   * A row's timestamp is therefore assigned before it is visible. A long
   * transaction can commit a row whose updated_at is BEHIND a cursor that has
   * already moved past it, and that row is then never fetched again.
   *
   * Without the lag this test fails: "late" is silently and permanently absent.
   */
  it("does not skip a row that commits late with an earlier timestamp", async () => {
    // Real clock, because the lag is measured against it. Both rows sit inside
    // the 5s lag window, which is exactly the danger zone.
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

    // Txn B (started later, committed first) is visible; txn A is still open.
    server.rows = [serverOrder("committed-first", ago(1000))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    // Txn A now commits. Its updated_at is EARLIER than the row already synced,
    // because now() was stamped at transaction start.
    server.rows.push(serverOrder("committed-late", ago(2000)));
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    // Without the lag the cursor would sit at ago(1000) and this row — stamped
    // ago(2000) — would never satisfy `updated_at > cursor`. Permanently lost.
    expect((await orderIds()).sort()).toEqual(
      ["committed-first", "committed-late"].sort(),
    );
  });

  it("re-reads only the lag window, not the whole history", async () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

    // Old rows are far outside the lag window and must not be re-fetched.
    server.rows = [
      serverOrder("ancient", ago(60 * 60_000)),
      serverOrder("recent", ago(1000)),
    ];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    server.reset();
    const second = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    // The lag window re-reads `recent`, but `ancient` stays behind the cursor.
    expect(second.rowsWritten).toBeLessThanOrEqual(1);
    expect(await countOrders()).toBe(2);
  });

  it("still advances, so the cursor does not stall forever", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    // isoAt(1) is far in the past relative to real now(), so the lag boundary
    // is much newer and the cursor settles on the row itself.
    const cursor = await readCursor("orders", LOCATION);
    expect(cursor.watermark).toBe(isoAt(1));
    expect(cursor.watermarkId).toBe("o1");
  });

  it("takes the exact row cursor mid-backlog, not the lagged one", () => {
    // hasMore = true means we are catching up on history, far behind real time.
    // No in-flight transaction can hide ahead of us there, so paging must use
    // the precise (watermark, id) pair or a large cold sync would crawl.
    const seen = { value: isoAt(5), id: "o5" };
    const out = computeLaggedCursor(
      seen,
      { watermark: null, watermarkId: null },
      { caughtUp: false },
    );
    expect(out).toEqual(seen);
  });

  it("never regresses the cursor", () => {
    const current = { watermark: isoAt(100), watermarkId: "o100" };
    const out = computeLaggedCursor({ value: isoAt(90), id: "o90" }, current, {
      caughtUp: true,
      now: Date.parse(isoAt(95)),
      lagMs: 0,
    });
    expect(out.value).toBe(isoAt(100));
  });

  it("drops the tiebreak when the cursor is a lagged boundary", () => {
    // A lagged timestamp is not a real row, so it has no id to tie-break on.
    // applyKeyset reads a null id as inclusive (gte), which re-reads the
    // boundary rather than skipping it.
    const out = computeLaggedCursor(
      { value: isoAt(100), id: "o100" },
      { watermark: null, watermarkId: null },
      { caughtUp: true, now: Date.parse(isoAt(100)), lagMs: 60_000 },
    );
    expect(out.value).toBe(isoAt(99));
    expect(out.id).toBeNull();
  });
});

describe("descriptor ↔ schema agreement", () => {
  /**
   * Guards a whole class of silent bug: a descriptor that emits a column the
   * local schema does not have. The write boundary is atomic, so such a batch
   * rolls back and returns committed:false — meaning the cursor never advances
   * and the mirror stays permanently empty, with nothing but a console.warn to
   * show for it. A round-trip insert is the cheapest way to make that loud.
   */
  it("every column the orders descriptor emits actually exists", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), {
        order_items: [{ id: "i1", item_name: "Burger", quantity: 1 }],
        order_payments: [
          {
            id: "p1",
            status: "captured",
            payment_method: "card",
            amount: 10.89,
            initiated_at: isoAt(1),
            terminal_id: "t1",
            settlement_batch_id: "b1",
            split_portion_index: 0,
          },
        ],
      }),
    ];

    const result = await syncEntity(
      ENTITIES.orders,
      "pos",
      supabase(),
      LOCATION,
    );

    // committed, not merely "did not throw" — a missing column shows up here.
    expect(result.error).toBeNull();
    expect(result.rowsWritten).toBeGreaterThan(0);
  });

  /**
   * `status` is the AUTHORITATIVE payment state (payment_status enum). The
   * is_voided / is_returned / is_settled booleans are denormalized and can
   * disagree with it — the remote revenue index
   * (idx_order_payments_fees_location_period) keys on status, not on them.
   * This was missing from the first cut of the schema and is money-visible.
   */
  it("mirrors the authoritative payment status, not just the booleans", async () => {
    server.rows = [
      serverOrder("o1", isoAt(1), {
        order_payments: [
          { id: "p1", status: "refunded", amount: 10, initiated_at: isoAt(1) },
        ],
      }),
    ];
    await syncEntity(ENTITIES.orders, "pos", supabase(), LOCATION);

    const row = await getDb()!.getFirstAsync<{
      status: string;
      settlement_batch_id: string | null;
    }>("SELECT status, settlement_batch_id FROM order_payments");
    expect(row?.status).toBe("refunded");
  });
});

describe("descriptor query shape", () => {
  it("asks for the embed the mirror needs", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await pullOrdersDelta({
      supabase: supabase(),
      locationId: LOCATION,
      since: null,
      sinceId: null,
      limit: DEFAULT_PAGE_SIZE,
    });
    expect(server.lastSelect).toContain("order_items(*)");
    expect(server.lastSelect).toContain("order_payments(*)");
  });

  it("keeps the manifest id-only — it is a size optimization, not a fetch", async () => {
    server.rows = [serverOrder("o1", isoAt(1))];
    await pullOrdersManifest({
      supabase: supabase(),
      locationId: LOCATION,
      since: isoAt(0),
    });
    expect(server.lastSelect).toBe("id");
  });
});
