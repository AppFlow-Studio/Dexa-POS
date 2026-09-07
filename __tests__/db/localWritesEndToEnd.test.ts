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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  it("createLocalOrder is idempotent — a second call cannot fail on the id", async () => {
    // REGRESSION: `ensureOrderCreated` is called from several places for the
    // same order (the eager-create effect and the add-item path). The first
    // version did a plain INSERT, so the second call died with
    // "UNIQUE constraint failed: orders.id" — rolling back the transaction and
    // leaving the order with NO row at all, which is far worse than the
    // duplicate it was meant to prevent. Reported from a real device.
    const first = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
      orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const second = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
      orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Same identity AND same number — a second call must not renumber either.
    expect(second.value!.orderId).toBe(first.value!.orderId);
    expect(second.value!.orderNumber).toBe(first.value!.orderNumber);

    const db = getDb()!;
    const rows = await db.getAllAsync(
      `SELECT id FROM orders WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
    );
    expect(rows).toHaveLength(1);
    // And exactly ONE create op, not two.
    expect(await pendingOpCount()).toBe(1);
  });

  it("mints a distinct row id per call — the caller must not double-add", async () => {
    // addLocalItem no longer accepts a caller-supplied item id: the CartItem's
    // id is a composite merge key, not a uuid, so it cannot be the row id.
    // Each call therefore mints a fresh row — which makes not calling it twice
    // for one cart line the CALLER's job (addItemToBackend guards on
    // db_order_item_id already being set).
    const order = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });
    const args = {
      orderId: order.value!.orderId,
      locationId: LOCATION,
      itemName: "Burger",
      quantity: 1,
      unitPrice: 10,
    };

    const first = await addLocalItem(args);
    const second = await addLocalItem(args);

    expect(first.ok && second.ok).toBe(true);
    expect(first.value!.itemId).not.toBe(second.value!.itemId);
    expect(first.value!.itemId).toMatch(UUID_RE);
    expect(second.value!.itemId).toMatch(UUID_RE);
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

describe("cart id vs row uuid", () => {
  /**
   * REGRESSION: a CartItem's id is a composite MERGE key
   * (`<menuItemId>|modifiers:…_<ts>_<rand>`) so re-tapping the same item
   * collapses into one line. The row id is a separate uuid minted in
   * addLocalItem. Binding matched cart lines on the ROW uuid, found nothing,
   * never set db_order_item_id — and every item stayed "draining" forever
   * even though the drain had already synced it.
   */
  it("binds the row uuid onto the line keyed by its CART id", async () => {
    const {
      markItemSyncedFromDrain,
      __flushItemBindingsForTests,
      useOrderStore,
    } = jest.requireActual("@/stores/useOrderStore");

    const CART_ID = "6c846d6a|modifiers:aaa:bbb_1788800267074_zku6eh0d4";
    const ROW_ID = "5cdf8324-9b5e-44a7-bf88-7502b35a9a53";

    useOrderStore.setState({
      ordersById: {
        o9: { id: "o9", db_order_id: "o9", items: [{ id: CART_ID }] },
      },
    });

    markItemSyncedFromDrain("o9", CART_ID, ROW_ID);
    __flushItemBindingsForTests();

    const item = useOrderStore.getState().ordersById.o9.items[0];
    // The line keeps its cart id AND gains the row id.
    expect(item.id).toBe(CART_ID);
    expect(item.db_order_item_id).toBe(ROW_ID);
  });

  it("does nothing when only the row uuid is known", async () => {
    // Proves the old behaviour was a no-op, not merely wrong.
    const {
      markItemSyncedFromDrain,
      __flushItemBindingsForTests,
      useOrderStore,
    } = jest.requireActual("@/stores/useOrderStore");

    const CART_ID = "cart|key_123";
    const ROW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    useOrderStore.setState({
      ordersById: {
        o10: { id: "o10", db_order_id: "o10", items: [{ id: CART_ID }] },
      },
    });

    markItemSyncedFromDrain("o10", ROW_ID, ROW_ID);
    __flushItemBindingsForTests();

    expect(
      useOrderStore.getState().ordersById.o10.items[0].db_order_item_id,
    ).toBeUndefined();
  });
});

describe("bindings are visible after a microtask", () => {
  /**
   * REGRESSION: the drain confirms an item, then binds db_order_item_id
   * through a MICROTASK-batched commit. The outbox therefore empties — and
   * the send-to-kitchen barrier returns — one tick BEFORE the cart line
   * carries its id. Reading the pre-barrier snapshot left the item looking
   * unbound, so it fell into `stragglerIds` and was queued to the legacy
   * path, which then logged "send_to_kitchen blocked on 1 item(s)" on every
   * single send.
   */
  it("a queued binding is applied by the next macrotask", async () => {
    const { markItemSyncedFromDrain, useOrderStore } = jest.requireActual(
      "@/stores/useOrderStore",
    );

    useOrderStore.setState({
      ordersById: {
        ord: { id: "ord", db_order_id: "ord", items: [{ id: "it1" }] },
      },
    });

    markItemSyncedFromDrain("ord", "it1", "row-it1");

    // Not yet — the batch is still queued.
    expect(
      useOrderStore.getState().ordersById.ord.items[0].db_order_item_id,
    ).toBeUndefined();

    // Exactly what the barrier now awaits before re-reading.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      useOrderStore.getState().ordersById.ord.items[0].db_order_item_id,
    ).toBe("row-it1");
  });
});

describe("drain binds item ids in ONE batch", () => {
  /**
   * The drain confirms items one at a time. Writing each straight into the
   * store produced a separate set() per item, and every one re-ran the
   * coursing and seating effects — which key off db_order_item_id and issue
   * their own RPCs. Six items meant six render passes and six course syncs:
   * a laggy table order whose course list appeared, vanished and reappeared
   * while items were still being added.
   */
  it("coalesces many item bindings into a single store commit", async () => {
    const {
      markItemSyncedFromDrain,
      __flushItemBindingsForTests,
      useOrderStore,
    } = jest.requireActual("@/stores/useOrderStore");

    useOrderStore.setState({
      ordersById: {
        o1: {
          id: "o1",
          db_order_id: "o1",
          items: [
            { id: "i1", quantity: 1 },
            { id: "i2", quantity: 1 },
            { id: "i3", quantity: 1 },
          ],
        },
      },
    });

    let commits = 0;
    const unsub = useOrderStore.subscribe(() => {
      commits++;
    });

    markItemSyncedFromDrain("o1", "i1", "row-1");
    markItemSyncedFromDrain("o1", "i2", "row-2");
    markItemSyncedFromDrain("o1", "i3", "row-3");
    __flushItemBindingsForTests();
    unsub();

    // ONE commit, not three.
    expect(commits).toBe(1);

    const items = useOrderStore.getState().ordersById.o1.items;
    expect(items.map((i: any) => i.db_order_item_id)).toEqual([
      "row-1",
      "row-2",
      "row-3",
    ]);
  });

  it("does not commit at all when nothing would change", async () => {
    const {
      markItemSyncedFromDrain,
      __flushItemBindingsForTests,
      useOrderStore,
    } = jest.requireActual("@/stores/useOrderStore");

    useOrderStore.setState({
      ordersById: {
        o2: {
          id: "o2",
          db_order_id: "o2",
          items: [{ id: "x1", db_order_item_id: "x1" }],
        },
      },
    });

    let commits = 0;
    const unsub = useOrderStore.subscribe(() => {
      commits++;
    });
    markItemSyncedFromDrain("o2", "x1", "x1");
    __flushItemBindingsForTests();
    unsub();

    // A no-op set() still notifies every subscriber — exactly the churn this
    // batching exists to remove.
    expect(commits).toBe(0);
  });
});

describe("id format guards the uuid columns", () => {
  /**
   * REGRESSION (real device): with LOCAL_WRITES_* on but CLIENT_IDS unset, the
   * store minted `order_1788799715753_z9hga7` and every query filtering a uuid
   * column by order id failed with
   *
   *     22P02  invalid input syntax for type uuid
   *
   * surfacing as "Failed to load seat assignments" / "Failed to load courses".
   * `NEEDS_UUID_IDS` derives the requirement from the flags so the bad
   * combination cannot be configured.
   */
  it("mints uuids whenever any local-write path is on", () => {
    const { mintStoreOrderId, mintStoreSessionId, NEEDS_UUID_IDS } =
      jest.requireActual("@/lib/localFirst/identity");

    if (!NEEDS_UUID_IDS) {
      // Flags off in this environment: the legacy shape is correct, and it
      // must NOT look like a uuid or the guard would be vacuous.
      expect(mintStoreOrderId()).toMatch(/^order_/);
      return;
    }
    expect(mintStoreOrderId()).toMatch(UUID_RE);
    expect(mintStoreSessionId()).toMatch(UUID_RE);
  });

  it("every id the local write API mints is a uuid", async () => {
    // These go straight into p_order_id / p_item_id / p_session_id, so a
    // non-uuid here is a guaranteed 22P02 at the database.
    const order = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });
    const item = await addLocalItem({
      orderId: order.value!.orderId,
      locationId: LOCATION,
      itemName: "X",
      quantity: 1,
      unitPrice: 1,
    });
    const seat = await seatLocal({
      tableIds: ["t-1"],
      locationId: LOCATION,
      merchantId: MERCHANT,
      partySize: 2,
      createOrder: true,
      stationNumber: 1,
    });

    expect(order.value!.orderId).toMatch(UUID_RE);
    expect(item.value!.itemId).toMatch(UUID_RE);
    expect(seat.value!.sessionId).toMatch(UUID_RE);
    expect(seat.value!.orderId).toMatch(UUID_RE);
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

  it("does not burn the sequence when the caller already allocated a number", async () => {
    // REGRESSION: startNewOrder mints a number for the optimistic order, then
    // createLocalOrder minted a SECOND — so every "New Order" advanced the
    // per-station counter by 2 and left a permanent gap in the day's numbering.
    const first = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });

    // Caller supplies its own number, exactly as the store does.
    const supplied = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
      orderId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      orderNumber: "ORD-20260907-S1-9999",
      displayNumber: "#S1-9999",
    });
    expect(supplied.value!.orderNumber).toBe("ORD-20260907-S1-9999");

    // The next allocation must follow `first`, not skip over the supplied one.
    const next = await createLocalOrder({
      merchantId: MERCHANT,
      locationId: LOCATION,
      orderType: "take_out",
      stationNumber: 1,
    });

    const seqOf = (n: string) => parseInt(n.split("-").pop()!, 10);
    expect(seqOf(next.value!.orderNumber)).toBe(
      seqOf(first.value!.orderNumber) + 1,
    );
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
