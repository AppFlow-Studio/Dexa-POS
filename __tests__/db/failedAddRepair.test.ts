/**
 * Test B on staging (2026-09-25): an add_item the server REJECTED could not be
 * repaired by editing the line, and after a reload the edit minted a second
 * row, so both rows reached the server once it healed ($7.08 there, $3.54 on
 * the tablet). These pin the outbox half of the fix.
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  __resetLamportForTests,
  amendPendingOpPayload,
  cancelPendingOpsForEntity,
  commitLocalWrite,
  findQueuedAddItemRow,
  markRejected,
  markRetry,
  unsyncedOpCountForOrder,
} from "@/lib/db/outbox";
import { __resetDrainForTests } from "@/services/localFirst/outboxDrain";

const LOCATION = "loc-1";
const ISO = "2026-09-25T20:45:00.000Z";
const ORDER = "o-s1-0003";
const ROW = "11111111-1111-4111-8111-111111111111";
const CART = "espresso|modifiers:_1758833000000_ab12cd";

async function seedAdd(opId = "op-add", payload: Record<string, unknown> = {}) {
  await commitLocalWrite(
    [
      {
        sql: `INSERT OR IGNORE INTO orders (id, location_id, created_at, updated_at, _sync_status, _server_seen_at, payload)
              VALUES (?, ?, ?, ?, 'local', ?, '{}')`,
        args: [ORDER, LOCATION, ISO, ISO, ISO],
      },
    ],
    [
      {
        id: opId,
        op: "add_item",
        entity: "order_item",
        entityId: ROW,
        orderId: ORDER,
        payload: {
          orderId: ORDER,
          quantity: 1,
          specialInstructions: "FAILTEST",
          cartItemId: CART,
          ...payload,
        },
      },
    ],
  );
}

async function op(id = "op-add") {
  const row = await getDb()!.getFirstAsync<{
    status: string;
    payload: string;
    next_at: string | null;
  }>(`SELECT status, payload, next_at FROM outbox WHERE id = ?`, [id]);
  return row ? { ...row, payload: JSON.parse(row.payload) } : null;
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

describe("editing a rejected add (bug 1)", () => {
  it("amends the parked add and requeues it", async () => {
    await seedAdd();
    await markRejected("op-add", "FAILTEST trigger", { table: "order_items", id: ROW });

    const amended = await amendPendingOpPayload(ROW, "add_item", {
      specialInstructions: "no sugar",
    });

    expect(amended).toBe(true);
    const row = await op();
    expect(row).toMatchObject({ status: "pending", next_at: null });
    expect(row!.payload.specialInstructions).toBe("no sugar");
    expect(row!.payload.cartItemId).toBe(CART);
  });

  it("requeues the row's other parked ops with it", async () => {
    await seedAdd();
    await commitLocalWrite([], [
      {
        id: "op-qty",
        op: "update_item_quantity",
        entity: "order_item",
        entityId: ROW,
        orderId: ORDER,
        payload: { orderId: ORDER, itemId: ROW, quantity: 2 },
      },
    ]);
    await markRejected("op-add", "FAILTEST trigger", { table: "order_items", id: ROW });
    await markRejected("op-qty", "Order item not found", { table: "order_items", id: ROW });

    await amendPendingOpPayload(ROW, "add_item", { specialInstructions: "ok" });

    expect((await op("op-qty"))!.status).toBe("pending");
    expect(await unsyncedOpCountForOrder(ORDER)).toEqual({ pending: 2, failed: 0 });
  });

  it("still refuses a pending add that was already attempted", async () => {
    await seedAdd();
    await markRetry("op-add", 0, "network timeout");

    expect(
      await amendPendingOpPayload(ROW, "add_item", { specialInstructions: "x" }),
    ).toBe(false);
    expect((await op())!.payload.specialInstructions).toBe("FAILTEST");
  });
});

describe("removing a rejected line unblocks payment", () => {
  it("drops the parked add, so no failed op remains", async () => {
    await seedAdd();
    await markRejected("op-add", "FAILTEST trigger", { table: "order_items", id: ROW });
    expect((await unsyncedOpCountForOrder(ORDER)).failed).toBe(1);

    const cancelled = await cancelPendingOpsForEntity(ROW);

    expect(cancelled).toEqual({ deleted: 1, hadUnsentCreate: true });
    expect(await unsyncedOpCountForOrder(ORDER)).toEqual({ pending: 0, failed: 0 });
  });

  it("keeps an attempted pending add (it may have landed)", async () => {
    await seedAdd();
    await markRetry("op-add", 0, "network timeout");

    expect(await cancelPendingOpsForEntity(ROW)).toEqual({
      deleted: 0,
      hadUnsentCreate: false,
    });
  });
});

describe("finding the row a cart line already has (bug 2)", () => {
  it("finds it by cart id, pending or failed", async () => {
    await seedAdd();
    expect(await findQueuedAddItemRow(ORDER, CART)).toBe(ROW);

    await markRejected("op-add", "FAILTEST trigger", { table: "order_items", id: ROW });
    expect(await findQueuedAddItemRow(ORDER, CART)).toBe(ROW);
  });

  it("does not match another line or another order", async () => {
    await seedAdd();
    expect(await findQueuedAddItemRow(ORDER, "latte|_other")).toBeNull();
    expect(await findQueuedAddItemRow("o-other", CART)).toBeNull();
  });
});
