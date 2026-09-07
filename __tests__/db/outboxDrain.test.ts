/**
 * Drain semantics — ordering and the three-way failure taxonomy.
 *
 * The properties here are the ones that decide whether a write survives bad
 * wifi: causal order within a check, and never confusing "the network blinked"
 * with "the server said no".
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  commitLocalWrite,
  pendingOpCount,
  __resetLamportForTests,
  type ClaimedOp,
} from "@/lib/db/outbox";
import {
  classifyError,
  drainOnce,
  errorText,
  outcomeFromError,
  __resetDrainForTests,
  type DrainOutcome,
  type OpHandlers,
} from "@/services/localFirst/outboxDrain";

const LOCATION = "loc-1";
const ISO = "2026-09-07T00:00:00.000Z";

async function seedOrder(id: string) {
  const db = getDb()!;
  await db.runAsync(
    `INSERT OR IGNORE INTO orders (id, location_id, created_at, updated_at, _sync_status, _server_seen_at, payload)
     VALUES (?, ?, ?, ?, 'local', ?, '{}')`,
    [id, LOCATION, ISO, ISO, ISO],
  );
}

async function enqueue(
  opId: string,
  orderId: string,
  op: "add_item" | "update_item_quantity" | "void_item" = "add_item",
  entityId = opId,
) {
  await commitLocalWrite(
    [],
    [{ id: opId, op, entity: "order_item", entityId, orderId, payload: {} }],
  );
}

beforeEach(async () => {
  __resetLamportForTests();
  __resetDrainForTests();
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
});

const ok = async (): Promise<DrainOutcome> => ({ kind: "synced" });

describe("drain ordering", () => {
  it("applies one order's ops in causal order", async () => {
    await seedOrder("o1");
    await enqueue("op-1", "o1", "add_item");
    await enqueue("op-2", "o1", "update_item_quantity");
    await enqueue("op-3", "o1", "void_item");

    const seen: string[] = [];
    const handlers: OpHandlers = {
      add_item: async (o) => (seen.push(o.id), { kind: "synced" }),
      update_item_quantity: async (o) => (seen.push(o.id), { kind: "synced" }),
      void_item: async (o) => (seen.push(o.id), { kind: "synced" }),
    };

    const stats = await drainOnce(handlers);

    // An update applied before its add would reference an item the server does
    // not have yet.
    expect(seen).toEqual(["op-1", "op-2", "op-3"]);
    expect(stats.synced).toBe(3);
    expect(await pendingOpCount()).toBe(0);
  });

  it("stops an order's group at the first transient failure", async () => {
    await seedOrder("o1");
    await enqueue("op-1", "o1", "add_item");
    await enqueue("op-2", "o1", "update_item_quantity");

    const seen: string[] = [];
    const handlers: OpHandlers = {
      add_item: async (o) => {
        seen.push(o.id);
        return { kind: "retry", error: "network" };
      },
      update_item_quantity: async (o) => (seen.push(o.id), { kind: "synced" }),
    };

    await drainOnce(handlers);

    // op-2 must NOT be pushed: the server would see a quantity update for an
    // item whose add is still unsent.
    expect(seen).toEqual(["op-1"]);
    expect(await pendingOpCount()).toBe(2);
  });

  it("does not let one stuck order block a different one", async () => {
    await seedOrder("o1");
    await seedOrder("o2");
    await enqueue("stuck", "o1", "add_item");
    await enqueue("fine", "o2", "add_item");

    const handlers: OpHandlers = {
      add_item: async (o) =>
        o.orderId === "o1"
          ? { kind: "retry", error: "timeout" }
          : { kind: "synced" },
    };

    const stats = await drainOnce(handlers);

    expect(stats.synced).toBe(1);
    expect(stats.retried).toBe(1);
  });
});

describe("failure taxonomy", () => {
  it("keeps a retried op queued, with backoff and the error recorded", async () => {
    const db = getDb()!;
    await seedOrder("o1");
    await enqueue("op-1", "o1");

    await drainOnce({ add_item: async () => ({ kind: "retry", error: "ETIMEDOUT" }) });

    const row = await db.getFirstAsync<{
      attempts: number;
      next_at: string | null;
      last_error: string;
      status: string;
    }>(`SELECT attempts, next_at, last_error, status FROM outbox WHERE id = 'op-1'`);

    expect(row?.attempts).toBe(1);
    expect(row?.next_at).toBeTruthy();
    expect(row?.last_error).toMatch(/ETIMEDOUT/);
    expect(row?.status).toBe("pending");
  });

  it("parks a rejection as failed and flags the row — never deletes it", async () => {
    const db = getDb()!;
    await seedOrder("o1");
    await enqueue("op-1", "o1", "add_item", "o1");

    await drainOnce({
      add_item: async () => ({ kind: "rejected", reason: "order is locked" }),
    });

    const op = await db.getFirstAsync<{ status: string }>(
      `SELECT status FROM outbox WHERE id = 'op-1'`,
    );
    // Still there: an operator must be able to see what did not apply.
    expect(op?.status).toBe("failed");
  });

  it("treats a THROWN handler as transient, not as a rejection", async () => {
    // The safe direction. An unexpected exception is more likely a network or
    // serialization fault than a permanent refusal, and retrying is safe
    // because every RPC is idempotent on the client-minted id.
    const db = getDb()!;
    await seedOrder("o1");
    await enqueue("op-1", "o1");

    await drainOnce({
      add_item: async () => {
        throw new Error("boom");
      },
    });

    const row = await db.getFirstAsync<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM outbox WHERE id = 'op-1'`,
    );
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
  });

  it("parks an op whose type has no handler rather than spinning forever", async () => {
    const db = getDb()!;
    await seedOrder("o1");
    await enqueue("op-1", "o1", "void_item");

    const stats = await drainOnce({ add_item: ok });

    expect(stats.skipped).toBe(1);
    const op = await db.getFirstAsync<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM outbox WHERE id = 'op-1'`,
    );
    expect(op?.status).toBe("failed");
    expect(op?.last_error).toMatch(/no handler/);
  });
});

describe("error classification", () => {
  it("treats server refusals as permanent", () => {
    for (const msg of [
      "ORDER_OWNED_BY_OTHER_STATION",
      "Access denied: User does not have access to location",
      "new row violates row-level security policy",
      "Order not found or access denied: abc",
      'invalid input syntax for type uuid: "local_order_123"',
      'null value violates not-null constraint',
    ]) {
      expect(classifyError(msg)).toBe("rejected");
    }
  });

  it("treats anything unrecognised as transient", () => {
    // The safe default: a redundant idempotent retry costs a round trip; a
    // wrongly-discarded write costs a guest's order.
    for (const msg of [
      "Network request failed",
      "fetch failed",
      "504 Gateway Timeout",
      "something nobody has seen before",
    ]) {
      expect(classifyError(msg)).toBe("retry");
    }
  });

  it("reads Supabase's plain-object errors, not just Error instances", () => {
    // PostgREST returns { message, code, details, hint } — String() on that is
    // "[object Object]", which matches no permanent pattern, so every server
    // refusal would have been retried forever. Regression guard.
    expect(errorText({ message: "ORDER_OWNED_BY_OTHER_STATION" })).toMatch(
      /ORDER_OWNED_BY_OTHER_STATION/,
    );
    expect(
      outcomeFromError({ message: "ORDER_OWNED_BY_OTHER_STATION" }).kind,
    ).toBe("rejected");
    expect(
      outcomeFromError({
        message: "permission denied for table orders",
        code: "42501",
      }).kind,
    ).toBe("rejected");
    // Still transient when the object describes a network fault.
    expect(outcomeFromError({ message: "Network request failed" }).kind).toBe(
      "retry",
    );
  });

  it("outcomeFromError carries the message through", () => {
    const rejected = outcomeFromError(new Error("Access denied: nope"));
    expect(rejected.kind).toBe("rejected");
    const retry = outcomeFromError(new Error("Network request failed"));
    expect(retry.kind).toBe("retry");
  });
});

describe("re-entrancy", () => {
  it("ignores an overlapping drain instead of pushing every op twice", async () => {
    await seedOrder("o1");
    await enqueue("op-1", "o1");

    let inFlight = 0;
    let maxConcurrent = 0;
    const handlers: OpHandlers = {
      add_item: async () => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return { kind: "synced" as const };
      },
    };

    const [a, b] = await Promise.all([
      drainOnce(handlers),
      drainOnce(handlers),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(a.attempted + b.attempted).toBe(1);
  });
});
