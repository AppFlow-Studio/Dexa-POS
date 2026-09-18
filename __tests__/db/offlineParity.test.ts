/**
 * Offline parity: a mutation made with no network must reach the server, and
 * mean the same thing, as one made with a network.
 *
 * Creating an order, adding an item and seating a table were already
 * local-first. Everything you do to an item AFTERWARDS was not — those paths
 * addressed rows by `db_order_item_id`, which only the drain writes, so with
 * no network it is null forever and each of them fell through to the legacy
 * MMKV queue keyed by the CART id. That queue resolves ids through
 * `offlineIdRegistry`, which the local-first add path never populates, so
 * every one of those ops returned "item_not_synced" on each pass until it was
 * dead-lettered.
 *
 * The symptom on a tablet: quantity changes, voids, seat assignments and
 * kitchen sends made during an outage silently never happened, while the
 * screen showed the operator that they had.
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  __resetLamportForTests,
  backoffMs,
  markRetry,
  pendingOpCount,
  resetBackoffForReconnect,
} from "@/lib/db/outbox";
import {
  __resetUnsyncedSessionsForTests,
  hasUnsyncedSession,
} from "@/lib/localFirst/unsyncedSessions";
import { __resetLocalSequencesForTests } from "@/lib/localOrderSequence";
import {
  addLocalItem,
  createLocalOrder,
  editLocalItem,
  removeLocalItem,
  seatLocal,
  sendLocalToKitchen,
  setLocalItemSeat,
  updateLocalItemQuantity,
  voidLocalItem,
} from "@/services/localFirst/localWrites";
import { makeOpHandlers } from "@/services/localFirst/opHandlers";
import {
  __resetDrainForTests,
  drainOnce,
} from "@/services/localFirst/outboxDrain";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const MERCHANT = "22222222-2222-4222-8222-222222222222";
const TABLE = "33333333-3333-4333-8333-333333333333";

/** Records every RPC it is asked for, and can refuse them all. */
function recordingServer(
  opts: {
    offline?: boolean;
    /** Override one RPC's response, e.g. to simulate a partial kitchen send. */
    override?: (name: string, params: any) => { data: any; error: any } | null;
  } = {},
) {
  const calls: { name: string; params: any }[] = [];
  const offline = opts.offline ?? false;

  async function call(name: string, params: any) {
    if (offline) {
      return { data: null, error: { message: "Network request failed" } };
    }
    calls.push({ name, params });
    const overridden = opts.override?.(name, params);
    if (overridden) return overridden;

    if (name === "create_order_v4") {
      return {
        data: {
          success: true,
          order_id: params.p_order_id,
          order_number: params.p_order_number,
        },
        error: null,
      };
    }
    if (name === "add_order_item_v5") {
      return {
        data: { order_item_id: params.p_item_id, sync_version: 1 },
        error: null,
      };
    }
    if (name === "seat_guests_v4") {
      return {
        data: {
          success: true,
          session_id: params.p_session_id,
          order_id: params.p_order_id,
        },
        error: null,
      };
    }
    if (name === "send_order_to_kitchen_v1") {
      // The real function's count contract. `validateKitchenMutationResult`
      // rejects a response without it, so a fake that omitted it would prove
      // the opposite of what this file is testing.
      const n = params.p_order_item_ids.length;
      return {
        data: {
          success: true,
          requested_count: n,
          updated_count: n,
          kds_updated_count: n,
        },
        error: null,
      };
    }
    // The mutation RPCs this file exists to prove get called at all.
    return { data: { success: true }, error: null };
  }

  return {
    calls,
    names: () => calls.map((c) => c.name),
    client: {
      // `.abortSignal()` is chained by everything routed through
      // `runWithDeadline` — the kitchen send is. A bare promise has no such
      // method, so a fake without it makes that call throw AFTER the RPC has
      // been recorded, which makes the failure look like a pass.
      rpc: (name: string, params: any) => {
        const p: any = call(name, params);
        p.abortSignal = () => p;
        return p;
      },
    } as any,
  };
}

async function makeOrderWithItem() {
  const order = await createLocalOrder({
    merchantId: MERCHANT,
    locationId: LOCATION,
    orderType: "take_out",
    stationNumber: 1,
  });
  const item = await addLocalItem({
    orderId: order.value!.orderId,
    locationId: LOCATION,
    itemName: "Burger",
    quantity: 1,
    unitPrice: 10,
    cartItemId: "cart|burger_1",
  });
  return { orderId: order.value!.orderId, itemId: item.value!.itemId };
}

beforeEach(async () => {
  __resetLamportForTests();
  __resetLocalSequencesForTests();
  __resetDrainForTests();
  __resetUnsyncedSessionsForTests();
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
});

describe("mutations made offline still reach the server", () => {
  it("a quantity change is queued against the ROW id, not the cart id", async () => {
    const { orderId, itemId } = await makeOrderWithItem();

    const res = await updateLocalItemQuantity({ orderId, itemId, quantity: 3 });
    expect(res.ok).toBe(true);

    // The local row is already correct — that is what the operator sees.
    const db = getDb()!;
    const row = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM order_items WHERE id = ?`,
      [itemId],
    );
    expect(row?.quantity).toBe(3);

    // And the server gets told, in causal order, once there is a network.
    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toEqual([
      "create_order_v4",
      "add_order_item_v5",
      "update_order_item_quantity_v3",
    ]);
    const qty = server.calls[2].params;
    expect(qty.p_order_item_id).toBe(itemId);
    expect(qty.p_quantity).toBe(3);
    expect(await pendingOpCount()).toBe(0);
  });

  it("a void and a seat assignment both address the row", async () => {
    const { orderId, itemId } = await makeOrderWithItem();
    await voidLocalItem({ orderId, itemId, reason: "Guest changed mind" });
    await setLocalItemSeat({ orderId, itemId, seatNumber: 2 });

    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toEqual([
      "create_order_v4",
      "add_order_item_v5",
      "void_order_item",
      "set_item_seat",
    ]);
    expect(server.calls[2].params.p_order_item_id).toBe(itemId);
    expect(server.calls[3].params.p_seat_number).toBe(2);
  });

  it("a kitchen send carries the row ids and lands AFTER the items", async () => {
    // The failure this replaces: offline, no item had a db_order_item_id, so
    // the whole batch was declared "stragglers" and handed to a queue that
    // cannot resolve a cart id. The send reported "queued" and the kitchen
    // received nothing, ever.
    const { orderId, itemId } = await makeOrderWithItem();

    await sendLocalToKitchen({
      orderId,
      itemIds: [itemId],
      orderStatus: "sent_to_kitchen",
      itemStatus: "sent",
    });

    const db = getDb()!;
    const row = await db.getFirstAsync<{ kitchen_status: string }>(
      `SELECT kitchen_status FROM order_items WHERE id = ?`,
      [itemId],
    );
    expect(row?.kitchen_status).toBe("sent");

    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    // Causal order is the whole point: the item must exist before it is routed.
    expect(server.names()).toEqual([
      "create_order_v4",
      "add_order_item_v5",
      "send_order_to_kitchen_v1",
    ]);
    expect(server.calls[2].params.p_order_item_ids).toEqual([itemId]);
    // Drained, not parked: the send is done, not merely attempted.
    expect(await pendingOpCount()).toBe(0);
  });

  it("parks a send the server could not fully apply instead of looping", async () => {
    // KITCHEN_ITEMS_UNRESOLVED means some of those items are not on the server
    // and re-sending the same list resolves the same subset. Classified as
    // unrecognised it would read as transient and retry forever, invisibly.
    const { orderId, itemId } = await makeOrderWithItem();
    await sendLocalToKitchen({
      orderId,
      itemIds: [itemId],
      orderStatus: "sent_to_kitchen",
      itemStatus: "sent",
    });

    const short = recordingServer({
      override: (name) =>
        name === "send_order_to_kitchen_v1"
          ? {
              data: {
                success: true,
                requested_count: 1,
                updated_count: 0,
                kds_updated_count: 0,
              },
              error: null,
            }
          : null,
    });

    const stats = await drainOnce(makeOpHandlers(short.client));
    expect(stats.rejected).toBe(1);
    const db = getDb()!;
    const parked = await db.getFirstAsync<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM outbox WHERE op = 'send_to_kitchen'`,
    );
    expect(parked?.status).toBe("failed");
    expect(parked?.last_error).toContain("KITCHEN_ITEMS_UNRESOLVED");
  });
});

describe("an item removed before it syncs does not come back", () => {
  it("cancels the unsent add instead of pushing it and undoing it", async () => {
    const { orderId, itemId } = await makeOrderWithItem();
    expect(await pendingOpCount()).toBe(2); // create_order + add_item

    const res = await removeLocalItem({ orderId, itemId });
    expect(res.ok).toBe(true);
    expect(res.value!.cancelledBeforeSend).toBe(true);

    const db = getDb()!;
    const rows = await db.getAllAsync(
      `SELECT id FROM order_items WHERE id = ?`,
      [itemId],
    );
    expect(rows).toHaveLength(0);

    // Only the order's create is left — no add, and no remove to undo it.
    expect(await pendingOpCount()).toBe(1);
    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toEqual(["create_order_v4"]);
  });

  it("sends a real remove once the add has been attempted", async () => {
    // An attempted op may have landed despite a lost response, so its create
    // must stand and be undone properly rather than quietly dropped.
    const { orderId, itemId } = await makeOrderWithItem();
    const db = getDb()!;
    const addOp = await db.getFirstAsync<{ id: string; attempts: number }>(
      `SELECT id, attempts FROM outbox WHERE op = 'add_item'`,
    );
    await markRetry(addOp!.id, addOp!.attempts, "Network request failed");

    const res = await removeLocalItem({ orderId, itemId });
    expect(res.value!.cancelledBeforeSend).toBe(false);

    const ops = await db.getAllAsync<{ op: string }>(
      `SELECT op FROM outbox ORDER BY created_at ASC, rowid ASC`,
    );
    expect(ops.map((o) => o.op)).toEqual([
      "create_order",
      "add_item",
      "remove_item",
    ]);
  });
});

describe("an edit before the add is sent rewrites the add", () => {
  it("folds the change in rather than queueing a correction", async () => {
    const { orderId, itemId } = await makeOrderWithItem();

    const res = await editLocalItem({
      orderId,
      itemId,
      quantity: 4,
      specialInstructions: "no onions",
    });
    expect(res.ok).toBe(true);
    expect(res.value!.amended).toBe(true);

    // Still two ops — the add now simply says something different.
    expect(await pendingOpCount()).toBe(2);
    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toEqual(["create_order_v4", "add_order_item_v5"]);
    expect(server.calls[1].params.p_quantity).toBe(4);
    expect(server.calls[1].params.p_special_instructions).toBe("no onions");
  });

  it("queues a real update once the add is already on its way", async () => {
    const { orderId, itemId } = await makeOrderWithItem();
    const db = getDb()!;
    const addOp = await db.getFirstAsync<{ id: string; attempts: number }>(
      `SELECT id, attempts FROM outbox WHERE op = 'add_item'`,
    );
    await markRetry(addOp!.id, addOp!.attempts, "Network request failed");

    const res = await editLocalItem({ orderId, itemId, quantity: 4 });
    expect(res.value!.amended).toBe(false);

    const ops = await db.getAllAsync<{ op: string }>(
      `SELECT op FROM outbox ORDER BY created_at ASC, rowid ASC`,
    );
    expect(ops.map((o) => o.op)).toContain("update_item_quantity");
  });
});

describe("reconnect means now", () => {
  it("clears the backoff that offline failures accumulated", async () => {
    // Every offline write used to run a full drain, so each op collected
    // attempts and an exponentially later `next_at`. On reconnect the drain
    // then claimed NOTHING for up to five minutes — read by an operator as
    // sync being broken rather than merely slow.
    await makeOrderWithItem();
    const db = getDb()!;
    const ops = await db.getAllAsync<{ id: string; attempts: number }>(
      `SELECT id, attempts FROM outbox`,
    );
    for (const op of ops) await markRetry(op.id, 8, "Network request failed");

    expect(backoffMs(9)).toBeGreaterThan(60_000);
    const parked = await db.getAllAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox WHERE next_at IS NOT NULL`,
    );
    expect(parked[0].n).toBe(2);

    const cleared = await resetBackoffForReconnect();
    expect(cleared).toBe(2);

    // Eligible immediately — and attempts are preserved, because they are the
    // history, not the schedule.
    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toEqual(["create_order_v4", "add_order_item_v5"]);
  });
});

describe("a table seated offline is not treated as free", () => {
  it("guards the session until the drain confirms it", async () => {
    const seated = await seatLocal({
      tableIds: [TABLE],
      locationId: LOCATION,
      merchantId: MERCHANT,
      partySize: 2,
      createOrder: true,
      stationNumber: 1,
    });
    expect(seated.ok).toBe(true);
    const sessionId = seated.value!.sessionId;

    // Until the server has it, a snapshot that omits this table is a stale
    // read — not a freed table. This is what stops the floor plan clearing a
    // session with guests sitting at it.
    expect(hasUnsyncedSession(sessionId)).toBe(true);

    const server = recordingServer();
    await drainOnce(makeOpHandlers(server.client));
    expect(server.names()).toContain("seat_guests_v4");
    expect(hasUnsyncedSession(sessionId)).toBe(false);
  });

  it("keeps guarding a session whose seat could not be pushed", async () => {
    const seated = await seatLocal({
      tableIds: [TABLE],
      locationId: LOCATION,
      merchantId: MERCHANT,
      partySize: 2,
      createOrder: false,
      stationNumber: 1,
    });
    const offline = recordingServer({ offline: true });
    await drainOnce(makeOpHandlers(offline.client));
    expect(hasUnsyncedSession(seated.value!.sessionId)).toBe(true);
  });
});
