/**
 * "database is locked" must not drop a local write.
 *
 * On 2026-09-30 a burst of these (a connection orphaned by a Metro reload held
 * the file) failed item writes on the first hit: the lines lived only in
 * memory, never reached the server, and 4 of 7 kitchen sends never arrived.
 * The transaction rolls back whole, so commitLocalWrite retries it.
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import { __resetLamportForTests, commitLocalWrite } from "@/lib/db/outbox";
import { __resetDrainForTests } from "@/services/localFirst/outboxDrain";

const ISO = "2026-09-30T08:57:50.000Z";

function orderWrite(id: string) {
  return commitLocalWrite(
    [
      {
        sql: `INSERT OR IGNORE INTO orders (id, location_id, created_at, updated_at, _sync_status, _server_seen_at, payload)
              VALUES (?, 'loc-1', ?, ?, 'local', ?, '{}')`,
        args: [id, ISO, ISO, ISO],
      },
    ],
    [
      {
        id: `op-${id}`,
        op: "create_order",
        entity: "order",
        entityId: id,
        orderId: id,
        payload: { orderId: id },
      },
    ],
  );
}

async function counts(id: string) {
  const db = getDb()!;
  const rows = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM orders WHERE id = ?",
    [id],
  );
  const ops = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox WHERE entity_id = ?",
    [id],
  );
  return { rows: rows?.n ?? 0, ops: ops?.n ?? 0 };
}

/** Make the next `times` statements fail the way expo-sqlite reports a lock. */
function lockFor(times: number, message = "Error code : database is locked") {
  const db = getDb()!;
  const real = db.runAsync.bind(db);
  let left = times;
  return jest.spyOn(db, "runAsync").mockImplementation(((...args: any[]) => {
    if (left > 0) {
      left--;
      return Promise.reject(
        new Error(
          `Call to function 'NativeStatement.finalizeAsync' has been rejected.\n→ Caused by: ${message}`,
        ),
      );
    }
    return (real as any)(...args);
  }) as any);
}

beforeEach(async () => {
  __resetLamportForTests();
  __resetDrainForTests();
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("retries a locked write and commits the row and its op exactly once", async () => {
  lockFor(1);
  const res = await orderWrite("o-1");
  expect(res.ok).toBe(true);
  expect(await counts("o-1")).toEqual({ rows: 1, ops: 1 });
});

it("gives up after the retry budget and leaves nothing behind", async () => {
  lockFor(10);
  const res = await orderWrite("o-2");
  expect(res.ok).toBe(false);
  expect(res.error).toMatch(/database is locked/);
  jest.restoreAllMocks();
  expect(await counts("o-2")).toEqual({ rows: 0, ops: 0 });
}, 15_000);

it("does not retry other errors", async () => {
  const spy = lockFor(1, "UNIQUE constraint failed: orders.id");
  const res = await orderWrite("o-3");
  expect(res.ok).toBe(false);
  // One failing statement, no second attempt.
  expect(spy).toHaveBeenCalledTimes(1);
});
