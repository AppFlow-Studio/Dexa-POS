/**
 * Drain handlers — the RPC contract.
 *
 * These assert the two things that decide whether identity actually survives:
 * that the client-minted id is what goes on the wire, and that a
 * `table_occupied` result is escalated rather than swallowed.
 */
import type { ClaimedOp } from "@/lib/db/outbox";
import {
  makeOpHandlers,
  type TableOccupiedConflict,
} from "@/services/localFirst/opHandlers";

function fakeClient(impl: (name: string, params: any) => any) {
  const calls: { name: string; params: any }[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string, params: any) => {
        calls.push({ name, params });
        return impl(name, params);
      },
    } as any,
  };
}

function op(overrides: Partial<ClaimedOp> = {}): ClaimedOp {
  return {
    id: "op-1",
    op: "add_item",
    entity: "order_item",
    entityId: "11111111-1111-4111-8111-111111111111",
    orderId: "22222222-2222-4222-8222-222222222222",
    payload: {},
    baseVersion: null,
    attempts: 0,
    lamport: 1,
    deviceId: "dev-a",
    createdAt: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("identity reaches the wire", () => {
  it("sends the client-minted order id and number to create_order_v4", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { success: true, order_id: "x" },
      error: null,
    }));
    const handlers = makeOpHandlers(client);

    const result = await handlers.create_order!(
      op({
        op: "create_order",
        entity: "order",
        entityId: "33333333-3333-4333-8333-333333333333",
        payload: {
          merchantId: "m",
          locationId: "l",
          orderType: "dine_in",
          orderNumber: "ORD-20260907-S1-0042",
        },
      }),
    );

    expect(result.kind).toBe("synced");
    expect(calls[0].name).toBe("create_order_v4");
    expect(calls[0].params.p_order_id).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(calls[0].params.p_order_number).toBe("ORD-20260907-S1-0042");
    // The op id doubles as the idempotency key.
    expect(calls[0].params.p_idempotency_key).toBe("op-1");
  });

  it("sends the client-minted item id and an explicit origin to v5", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { sync_version: 7 },
      error: null,
    }));
    const handlers = makeOpHandlers(client);

    const result = await handlers.add_item!(
      op({ payload: { orderId: "o1", quantity: 2, unitPrice: 9.5 } }),
    );

    expect(result).toEqual({ kind: "synced", syncVersion: 7 });
    expect(calls[0].name).toBe("add_order_item_v5");
    expect(calls[0].params.p_item_id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    // ORIGIN_CAPABLE_RPC only upgrades v3 -> v4, so v5 must pass this itself
    // or the station reprocesses its own broadcast as a phantom item.
    expect(calls[0].params.p_origin_id).toBe("op-1");
  });

  it("never falls back to an older RPC that would mint a second identity", async () => {
    // A missing v5 must be a loud, retryable failure. Downgrading to v4 would
    // create a SECOND server-side id for a row that already exists locally —
    // exactly the divergence this project removes.
    const { client, calls } = fakeClient(() => ({
      data: null,
      error: { message: "function add_order_item_v5 does not exist" },
    }));
    const handlers = makeOpHandlers(client);

    const result = await handlers.add_item!(op({ payload: { orderId: "o1", quantity: 1, unitPrice: 1 } }));

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("add_order_item_v5");
    // Unrecognised => transient => retried, not dropped.
    expect(result.kind).toBe("retry");
  });
});

describe("open items route to add_open_item_v5", () => {
  it("sends an open item to add_open_item_v5 with the client id, open fields, and TO GO", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { success: true, order_item_id: "x" },
      error: null,
    }));
    const handlers = makeOpHandlers(client);

    const result = await handlers.add_item!(
      op({
        payload: {
          orderId: "o1",
          quantity: 2,
          unitPrice: 7.5,
          itemName: "Custom Plate",
          isOpenItem: true,
          openItemName: "Custom Plate",
          openItemPrice: 7.5,
          isTaxExempt: false,
          isToGo: true,
          stationId: "st-1",
        },
      }),
    );

    expect(result.kind).toBe("synced");
    expect(calls).toHaveLength(1);
    // The whole bug: an open item must NOT go to add_order_item_v5 (no open
    // columns; the client cart id would land in p_menu_item_id → 22P02).
    expect(calls[0].name).toBe("add_open_item_v5");
    expect(calls[0].params.p_item_id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(calls[0].params.p_item_name).toBe("Custom Plate");
    expect(calls[0].params.p_unit_price).toBe(7.5);
    expect(calls[0].params.p_is_to_go).toBe(true);
    expect(calls[0].params.p_origin_id).toBe("op-1");
    expect(calls[0].params.p_idempotency_key).toBe("op-1");
    // add_open_item_v5 has no menu-item param — a fake uuid can't leak through.
    expect(calls[0].params.p_menu_item_id).toBeUndefined();
  });

  it("regular items still go to add_order_item_v5", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { sync_version: 3 },
      error: null,
    }));
    const handlers = makeOpHandlers(client);

    await handlers.add_item!(
      op({
        payload: {
          orderId: "o1",
          quantity: 1,
          unitPrice: 4,
          menuItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          isOpenItem: false,
        },
      }),
    );

    expect(calls[0].name).toBe("add_order_item_v5");
    expect(calls[0].params.p_menu_item_id).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });
});

describe("seat_guests conflict handling (§9.5)", () => {
  it("escalates table_occupied and rejects rather than retrying forever", async () => {
    const seen: TableOccupiedConflict[] = [];
    const { client } = fakeClient(() => ({
      data: {
        success: false,
        error: "table_occupied",
        occupied_by_session_id: "s-other",
        occupied_by_order_id: "o-other",
        occupied_table_id: "t12",
        requested_session_id: "s-mine",
        requested_order_id: "o-mine",
      },
      error: null,
    }));
    const handlers = makeOpHandlers(client, {
      onTableOccupied: (c) => seen.push(c),
    });

    const result = await handlers.seat_guests!(
      op({
        op: "seat_guests",
        entity: "table_session",
        entityId: "s-mine",
        payload: { tableIds: ["t12"], partySize: 4, createOrder: true },
      }),
    );

    // Retrying could never succeed, so it must not be a retry...
    expect(result.kind).toBe("rejected");
    // ...and a manager has to be told, or a real check with real food on it is
    // silently stranded.
    expect(seen).toHaveLength(1);
    expect(seen[0].occupiedBySessionId).toBe("s-other");
    expect(seen[0].requestedOrderId).toBe("o-mine");
  });

  it("treats a normal seat as synced", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { success: true, session_id: "s1", order_id: "o1" },
      error: null,
    }));
    const handlers = makeOpHandlers(client);

    const result = await handlers.seat_guests!(
      op({
        op: "seat_guests",
        entity: "table_session",
        entityId: "s1",
        payload: {
          tableIds: ["t1"],
          partySize: 2,
          createOrder: true,
          orderId: "o1",
          orderNumber: "ORD-20260907-S1-0001",
        },
      }),
    );

    expect(result.kind).toBe("synced");
    expect(calls[0].name).toBe("seat_guests_v4");
    expect(calls[0].params.p_session_id).toBe("s1");
    expect(calls[0].params.p_order_id).toBe("o1");
  });
});

describe("error classification through the handlers", () => {
  it("maps a server refusal to rejected", async () => {
    const { client } = fakeClient(() => ({
      data: null,
      error: { message: "ORDER_OWNED_BY_OTHER_STATION" },
    }));
    const handlers = makeOpHandlers(client);
    const result = await handlers.add_item!(op({ payload: { orderId: "o1", quantity: 1, unitPrice: 1 } }));
    expect(result.kind).toBe("rejected");
  });

  it("maps a network failure to retry", async () => {
    const { client } = fakeClient(() => {
      throw new Error("Network request failed");
    });
    const handlers = makeOpHandlers(client);
    const result = await handlers.add_item!(op({ payload: { orderId: "o1", quantity: 1, unitPrice: 1 } }));
    expect(result.kind).toBe("retry");
  });
});
