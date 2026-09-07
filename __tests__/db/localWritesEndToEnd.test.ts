/**
 * End to end: tap → local row → drain → server, including a full offline
 * service period.
 *
 * This is the test that answers the actual complaint. Every assertion below
 * is about one of the two things that were reported broken:
 *
 *   "operations don't feel instant"  → the row exists before any network call
 *   "failed syncs, especially order  → the id on the wire is the id we minted,
 *    items and seatings"               and a retry cannot duplicate anything
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  pendingOpCount,
  __resetLamportForTests,
} from "@/lib/db/outbox";
import { __resetLocalSequencesForTests } from "@/lib/localOrderSequence";
import {
  addLocalItem,
  createLocalOrder,
  seatLocal,
} from "@/services/localFirst/localWrites";
import { makeOpHandlers } from "@/services/localFirst/opHandlers";
import {
  drainOnce,
  __resetDrainForTests,
} from "@/services/localFirst/outboxDrain";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const MERCHANT = "22222222-2222-4222-8222-222222222222";

/** A server that records what it was asked to do. */
function recordingServer(opts: { offline?: boolean } = {}) {
  const calls: { name: string; params: any }[] = [];
  const rows = { orders: new Set<string>(), items: new Set<string>(), sessions: new Set<string>() };
  let offline = opts.offline ?? false;

  return {
    calls,
    rows,
    goOnline: () => {
      offline = false;
    },
    client: {
      rpc: async (name: string, params: any) => {
        if (offline) {
          return { data: null, error: { message: "Network request failed" } };
        }
        calls.push({ name, params });
        if (name === "create_order_v4") {
          // Idempotent on the id, exactly like the real function.
          const existed = rows.orders.has(params.p_order_id);
          rows.orders.add(params.p_order_id);
          return {
            data: {
              success: true,
              order_id: params.p_order_id,
              order_number: params.p_order_number,
              already_existed: existed,
              order_number_reassigned: false,
            },
            error: null,
          };
        }
        if (name === "add_order_item_v5") {
          const existed = rows.items.has(params.p_item_id);
          rows.items.add(params.p_item_id);
          return {
            data: { order_item_id: params.p_item_id, already_existed: existed, sync_version: 1 },
            error: null,
          };
        }
        if (name === "seat_guests_v4") {
          const existed = rows.sessions.has(params.p_session_id);
          rows.sessions.add(params.p_session_id);
          if (params.p_order_id) rows.orders.add(params.p_order_id);
          return {
            data: {
              success: true,
              session_id: params.p_session_id,
              order_id: params.p_order_id,
              already_existed: existed,
            },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      },
    } as any,
  };
}

beforeEach(async () => {
  __resetLamportForTests();
  __resetLocalSequencesForTests();
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

describe("the row exists before the network is touched", () => {
  it("createLocalOrder returns a usable order with no server involved", async () => {
    const db = getDb()!;
    const result = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });

    expect(result.ok).toBe(true);
    // A real id and a PRINTABLE number, immediately (Decision 0.1).
    expect(result.value!.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.value!.orderNumber).toMatch(/^ORD-\d{8}-S1-\d{4}$/);
    expect(result.value!.displayNumber).toMatch(/^#S1-\d{4}$/);

    const row = await db.getFirstAsync<{ _sync_status: string }>(
      `SELECT _sync_status FROM orders WHERE id = ?`,
      [result.value!.orderId],
    );
    expect(row?._sync_status).toBe("local");
    expect(await pendingOpCount()).toBe(1);
  });

  it("seatLocal produces session AND order in one transaction", async () => {
    const db = getDb()!;
    const result = await seatLocal({
      tableIds: ["t-1", "t-2"],
      locationId: LOCATION,
      merchantId: MERCHANT,
      partySize: 4,
      createOrder: true,
      stationNumber: 1,
    });

    expect(result.ok).toBe(true);
    const { sessionId, orderId } = result.value!;

    // The pair that used to arrive from seat_guests_v3 and need rekeying into
    // ten structures. Both exist now, linked, before any network call — which
    // is what deletes isOrderTableStillSeating() and hydrateOrderFromSeat().
    const session = await db.getFirstAsync<{ order_id: string; status: string }>(
      `SELECT order_id, status FROM table_sessions WHERE id = ?`,
      [sessionId],
    );
    expect(session?.order_id).toBe(orderId);
    expect(session?.status).toBe("seated");

    const tables = await db.getAllAsync<{ table_id: string; is_primary: number }>(
      `SELECT table_id, is_primary FROM table_session_tables WHERE session_id = ? ORDER BY seated_position`,
      [sessionId],
    );
    expect(tables.map((t) => t.table_id)).toEqual(["t-1", "t-2"]);
    expect(tables[0].is_primary).toBe(1);

    // ONE op for the whole gesture — seat_guests_v4 is atomic server-side.
    expect(await pendingOpCount()).toBe(1);
  });
});

describe("a full offline service period converges on reconnect", () => {
  it("seats, rings up items, then syncs everything with the SAME ids", async () => {
    const server = recordingServer({ offline: true });
    const handlers = makeOpHandlers(server.client);

    // ── Offline. The tablet has no idea the server exists. ──
    const seated = await seatLocal({
      tableIds: ["t-12"],
      locationId: LOCATION,
      merchantId: MERCHANT,
      partySize: 2,
      createOrder: true,
      stationNumber: 1,
      tableNumber: "12",
    });
    expect(seated.ok).toBe(true);
    const { sessionId, orderId } = seated.value!;

    const burger = await addLocalItem({
      orderId: orderId!,
      locationId: LOCATION,
      itemName: "Burger",
      quantity: 1,
      unitPrice: 12.5,
    });
    const fries = await addLocalItem({
      orderId: orderId!,
      locationId: LOCATION,
      itemName: "Fries",
      quantity: 2,
      unitPrice: 4.25,
    });
    expect(burger.ok && fries.ok).toBe(true);

    // Drain while offline: nothing is lost, everything is retried.
    await drainOnce(handlers);
    expect(await pendingOpCount()).toBe(3);
    expect(server.calls).toHaveLength(0);

    // ── Reconnect. ──
    server.goOnline();
    // Backoff was applied to the seat op, so clear next_at to simulate time
    // passing rather than sleeping in a test.
    await getDb()!.runAsync(`UPDATE outbox SET next_at = NULL`);

    // Drain repeatedly: the seat op must land before the item ops, and the
    // group stops at the first failure, so this takes more than one pass.
    for (let i = 0; i < 5; i++) {
      __resetDrainForTests();
      await drainOnce(handlers);
    }

    expect(await pendingOpCount()).toBe(0);

    // THE assertion this whole project exists for: the ids the server got are
    // the ids the device minted at tap time. Nothing was rekeyed.
    expect(server.rows.sessions.has(sessionId)).toBe(true);
    expect(server.rows.orders.has(orderId!)).toBe(true);
    expect(server.rows.items.has(burger.value!.itemId)).toBe(true);
    expect(server.rows.items.has(fries.value!.itemId)).toBe(true);
  });

  it("a retried op cannot duplicate a row", async () => {
    const server = recordingServer();
    const handlers = makeOpHandlers(server.client);

    const order = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });
    const item = await addLocalItem({
      orderId: order.value!.orderId,
      locationId: LOCATION,
      itemName: "Coke",
      quantity: 1,
      unitPrice: 2,
    });

    for (let i = 0; i < 3; i++) {
      __resetDrainForTests();
      await drainOnce(handlers);
    }

    // Re-push the same ops by hand — the lost-response case.
    __resetDrainForTests();
    await handlers.create_order!({
      id: "replay-1",
      op: "create_order",
      entity: "order",
      entityId: order.value!.orderId,
      orderId: order.value!.orderId,
      payload: {
        merchantId: MERCHANT,
        locationId: LOCATION,
        orderType: "take_out",
        orderNumber: order.value!.orderNumber,
      },
      baseVersion: 0,
      attempts: 0,
      lamport: 1,
      deviceId: "dev",
      createdAt: new Date().toISOString(),
    });

    // One id in, one row out — no matter how many times it was sent.
    expect(server.rows.orders.size).toBe(1);
    expect(server.rows.items.size).toBe(1);
    expect(server.rows.items.has(item.value!.itemId)).toBe(true);
  });
});

describe("order numbers are per-station and monotonic", () => {
  it("does not reuse a number across orders on the same station", async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const r = await createLocalOrder({
        merchantId: MERCHANT,
        locationId: LOCATION,
        orderType: "take_out",
        stationNumber: 1,
      });
      numbers.add(r.value!.orderNumber);
    }
    // A collision here would surface as a unique_violation server-side and
    // force create_order_v4 to renumber — recoverable, but it must not be the
    // normal case.
    expect(numbers.size).toBe(25);
  });

  it("keeps stations from colliding with each other", async () => {
    const a = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });
    const b = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 2,
    });
    expect(a.value!.orderNumber).toContain("-S1-");
    expect(b.value!.orderNumber).toContain("-S2-");
    expect(a.value!.orderNumber).not.toBe(b.value!.orderNumber);
  });
});
