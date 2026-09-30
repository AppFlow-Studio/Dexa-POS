/**
 * Charcoal Gardenia S1-0011 (2026-09-25): a Vanilla Shake with the custom
 * modifier "Add espresso" never reached the server, and the $108.48 Castles
 * charge behind it was never recorded.
 *
 * The local-first flatten sent the custom modifier's sentinel ids
 * ("custom-modifiers" / "custom_mod_…"); add_order_item_v5 failed its uuid
 * cast (22P02), rolled the item back, and the drain parked the op as failed
 * forever. These tests pin every layer of the fix.
 */
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  commitLocalWrite,
  markRejected,
  requeueFailedOps,
  requeueFailedOpsForOrder,
  __resetLamportForTests,
  type ClaimedOp,
} from "@/lib/db/outbox";
import { sanitizeModifierRowsForRpc } from "@/lib/modifierRpc";
import {
  drainOnce,
  __resetDrainForTests,
  type OpHandlers,
} from "@/services/localFirst/outboxDrain";
import { makeOpHandlers } from "@/services/localFirst/opHandlers";

const LOCATION = "loc-1";
const ISO = "2026-09-25T20:45:00.000Z";
const REAL_UUID = "a24665d8-cb97-41e1-aabf-fdda12040eee";
const UUID_ERROR =
  'add_order_item_v5: invalid input syntax for type uuid: "custom-modifiers"';

const customRow = {
  modifier_group_id: "custom-modifiers",
  modifier_item_id: "custom_mod_1758833000000_ab12cd",
  modifier_group_name: "Custom",
  modifier_name: "Add espresso",
  price_modifier: 0,
  quantity: 1,
  is_no: false,
};

async function seedItemOp(
  opId: string,
  orderId: string,
  op: "add_item" | "update_item_quantity" = "add_item",
  payload: Record<string, unknown> = {},
) {
  await commitLocalWrite(
    [
      {
        sql: `INSERT OR IGNORE INTO orders (id, location_id, created_at, updated_at, _sync_status, _server_seen_at, payload)
              VALUES (?, ?, ?, ?, 'local', ?, '{}')`,
        args: [orderId, LOCATION, ISO, ISO, ISO],
      },
    ],
    [{ id: opId, op, entity: "order_item", entityId: opId, orderId, payload }],
  );
}

async function opRow(id: string) {
  return getDb()!.getFirstAsync<{ status: string; attempts: number }>(
    `SELECT status, attempts FROM outbox WHERE id = ?`,
    [id],
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
  jest.useRealTimers();
  await destroyLocalDb();
  __resetLocalDbForTests();
});

describe("sanitizeModifierRowsForRpc", () => {
  it("nulls every id that is not a uuid and keeps real ones", () => {
    const [custom, real] = sanitizeModifierRowsForRpc([
      customRow,
      { ...customRow, modifier_group_id: REAL_UUID, modifier_item_id: REAL_UUID },
    ]);
    expect(custom).toMatchObject({
      modifier_group_id: null,
      modifier_item_id: null,
      modifier_name: "Add espresso",
    });
    expect(real).toMatchObject({
      modifier_group_id: REAL_UUID,
      modifier_item_id: REAL_UUID,
    });
  });

  it("passes non-arrays through untouched", () => {
    expect(sanitizeModifierRowsForRpc(null)).toBeNull();
    expect(sanitizeModifierRowsForRpc(undefined)).toBeUndefined();
  });
});

describe("drain handlers sanitize at send time", () => {
  function fakeClient() {
    const calls: { fn: string; args: any }[] = [];
    const client = {
      rpc: jest.fn(async (fn: string, args: any) => {
        calls.push({ fn, args });
        return { data: {}, error: null };
      }),
    };
    return { client: client as any, calls };
  }

  it("add_item queued by an older build no longer sends sentinel ids", async () => {
    const { client, calls } = fakeClient();
    const handlers = makeOpHandlers(client);
    const op = {
      id: "op-1",
      op: "add_item",
      entity: "order_item",
      entityId: "11111111-1111-4111-8111-111111111111",
      payload: {
        orderId: "o1",
        menuItemId: REAL_UUID,
        quantity: 1,
        unitPrice: 8,
        itemName: "Vanilla Shake",
        modifiers: [customRow],
      },
      attempts: 0,
    } as unknown as ClaimedOp;

    await handlers.add_item!(op);

    expect(calls[0].fn).toBe("add_order_item_v5");
    expect(calls[0].args.p_modifiers).toEqual([
      expect.objectContaining({
        modifier_group_id: null,
        modifier_item_id: null,
        modifier_name: "Add espresso",
      }),
    ]);
  });

  it("replace_modifiers sanitizes too", async () => {
    const { client, calls } = fakeClient();
    const handlers = makeOpHandlers(client);
    await handlers.replace_modifiers!({
      id: "op-2",
      op: "replace_modifiers",
      entity: "order_item",
      entityId: "x",
      payload: { itemId: REAL_UUID, modifiers: [customRow] },
      attempts: 0,
    } as unknown as ClaimedOp);

    expect(calls[0].args.p_modifiers[0].modifier_group_id).toBeNull();
    expect(calls[0].args.p_modifiers[0].modifier_item_id).toBeNull();
  });
});

describe("healing ops parked by the uuid bug", () => {
  it("requeues a poisoned add_item regardless of attempts", async () => {
    await seedItemOp("op-shake", "o1", "add_item", { modifiers: [customRow] });
    // Rejected on several launches already — past the normal requeue ceiling.
    for (let i = 0; i < 5; i++) {
      await markRejected("op-shake", UUID_ERROR, { table: "orders", id: "o1" });
    }
    expect(await opRow("op-shake")).toMatchObject({ status: "failed", attempts: 5 });

    await requeueFailedOps();

    expect(await opRow("op-shake")).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("leaves other exhausted rejections parked", async () => {
    await seedItemOp("op-other", "o2");
    for (let i = 0; i < 5; i++) {
      await markRejected("op-other", "ORDER_OWNED_BY_OTHER_STATION", {
        table: "orders",
        id: "o2",
      });
    }

    await requeueFailedOps();

    expect(await opRow("op-other")).toMatchObject({ status: "failed" });
  });

  it("requeueFailedOpsForOrder only touches that order", async () => {
    await seedItemOp("op-a", "o1");
    await seedItemOp("op-b", "o2");
    await markRejected("op-a", "boom", { table: "orders", id: "o1" });
    await markRejected("op-b", "boom", { table: "orders", id: "o2" });

    expect(await requeueFailedOpsForOrder("o1")).toBe(1);

    expect(await opRow("op-a")).toMatchObject({ status: "pending" });
    expect(await opRow("op-b")).toMatchObject({ status: "failed" });
  });
});

describe("drain deadline", () => {
  it("turns a request that never answers into a retry and releases the drain", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    await seedItemOp("op-hang", "o1");

    const handlers: OpHandlers = {
      add_item: () => new Promise(() => {}),
    };
    const pass = drainOnce(handlers);
    await jest.advanceTimersByTimeAsync(25_000);
    const stats = await pass;

    expect(stats.retried).toBe(1);
    expect(await opRow("op-hang")).toMatchObject({ status: "pending", attempts: 1 });

    // The re-entrancy guard was released: a second pass is not a no-op.
    jest.useRealTimers();
    await getDb()!.runAsync(`UPDATE outbox SET next_at = NULL`);
    const second = await drainOnce({ add_item: async () => ({ kind: "synced" }) });
    expect(second.synced).toBe(1);
  });
});
