import { OrderService } from "@/services/orderService";

/**
 * OrderService.acceptOnlineOrder / declineOnlineOrder — RPC contract.
 *
 * These wrap accept_online_order / decline_online_order, which return a JSON
 * envelope at HTTP 200 even on guard failures. Confirm they call the right RPC
 * with the right params and pass the envelope back verbatim (the hook does the
 * success/error branching).
 */

jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

// Bypass the deadline wrap — invoke the call directly with a no-op signal.
jest.mock("@/lib/network/runWithDeadline", () => ({
  runWithDeadline: jest.fn(
    async <T>(
      _op: string,
      _ms: number,
      call: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>,
    ) => {
      const ac = new AbortController();
      return call(ac.signal);
    },
  ),
}));

function makeClient(rpcResult: { data: unknown; error: any }) {
  const abortSignal = jest.fn(async () => rpcResult);
  const rpc = jest.fn(() => ({ abortSignal }));
  return { client: { rpc } as any, rpc, abortSignal };
}

describe("OrderService online-order actions", () => {
  it("getOnlineOrdersBoard sends the complete server date contract", async () => {
    const orderData = { id: "db-board-1", status: "completed" };
    const { client, rpc } = makeClient({
      data: [
        {
          order_id: "db-board-1",
          placed_at: "2026-07-26T04:10:00Z",
          is_in_range: true,
          item_count: 3,
          order_data: orderData,
        },
      ],
      error: null,
    });

    const result = await OrderService.getOnlineOrdersBoard(client, "loc-1", {
      preset: "yesterday",
      startDate: "2026-07-25",
      endDate: "2026-07-25",
    });

    expect(rpc).toHaveBeenCalledWith("get_online_orders_board_v1", {
      p_location_id: "loc-1",
      p_preset: "yesterday",
      p_start_date: "2026-07-25",
      p_end_date: "2026-07-25",
    });
    expect(result.data).toEqual([
      {
        orderId: "db-board-1",
        placedAt: "2026-07-26T04:10:00Z",
        isInRange: true,
        itemCount: 3,
        orderData,
      },
    ]);
  });

  it("acceptOnlineOrder calls accept_online_order with p_order_id and returns the envelope", async () => {
    const envelope = { success: true, order_id: "db-1", accepted_at: "t" };
    const { client, rpc } = makeClient({ data: envelope, error: null });

    const res = await OrderService.acceptOnlineOrder(client, "db-1");

    expect(rpc).toHaveBeenCalledWith("accept_online_order", {
      p_order_id: "db-1",
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });

  it("declineOnlineOrder passes p_order_id + p_reason", async () => {
    const envelope = { success: true, order_id: "db-2", declined_at: "t" };
    const { client, rpc } = makeClient({ data: envelope, error: null });

    const res = await OrderService.declineOnlineOrder(client, "db-2", "86'd");

    expect(rpc).toHaveBeenCalledWith("decline_online_order", {
      p_order_id: "db-2",
      p_reason: "86'd",
    });
    expect(res.data).toEqual(envelope);
  });

  it("declineOnlineOrder sends null reason when omitted", async () => {
    const { client, rpc } = makeClient({
      data: { success: true },
      error: null,
    });

    await OrderService.declineOnlineOrder(client, "db-3");

    expect(rpc).toHaveBeenCalledWith("decline_online_order", {
      p_order_id: "db-3",
      p_reason: null,
    });
  });

  it("cancelOnlineOrder passes p_order_id + enum reason + details", async () => {
    const envelope = { success: true, order_id: "db-5", cancelled_at: "t" };
    const { client, rpc } = makeClient({ data: envelope, error: null });

    const res = await OrderService.cancelOnlineOrder(
      client,
      "db-5",
      "ITEM_UNAVAILABLE",
      "out of buns",
    );

    expect(rpc).toHaveBeenCalledWith("cancel_online_order", {
      p_order_id: "db-5",
      p_reason: "ITEM_UNAVAILABLE",
      p_details: "out of buns",
    });
    expect(res.data).toEqual(envelope);
  });

  it("cancelOnlineOrder sends null details when omitted", async () => {
    const { client, rpc } = makeClient({
      data: { success: true },
      error: null,
    });

    await OrderService.cancelOnlineOrder(client, "db-6", "TOO_BUSY");

    expect(rpc).toHaveBeenCalledWith("cancel_online_order", {
      p_order_id: "db-6",
      p_reason: "TOO_BUSY",
      p_details: null,
    });
  });

  it("markOnlineOrderReady calls mark_online_order_ready with p_order_id and returns the envelope", async () => {
    const envelope = { success: true, order_id: "db-7", ready_at: "t" };
    const { client, rpc } = makeClient({ data: envelope, error: null });

    const res = await OrderService.markOnlineOrderReady(client, "db-7");

    expect(rpc).toHaveBeenCalledWith("mark_online_order_ready", {
      p_order_id: "db-7",
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });

  it("markOnlineOrderReady passes the success:false guard envelope back verbatim", async () => {
    const envelope = {
      success: false,
      error: "Order cannot be marked ready (current: completed)",
    };
    const { client } = makeClient({ data: envelope, error: null });

    const res = await OrderService.markOnlineOrderReady(client, "db-8");

    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });

  it("completeOnlineOrder calls complete_online_order with p_order_id and returns the envelope", async () => {
    const envelope = { success: true, order_id: "db-9", completed_at: "t" };
    const { client, rpc } = makeClient({ data: envelope, error: null });

    const res = await OrderService.completeOnlineOrder(client, "db-9");

    expect(rpc).toHaveBeenCalledWith("complete_online_order", {
      p_order_id: "db-9",
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });

  it("completeOnlineOrder passes the success:false guard envelope back verbatim", async () => {
    const envelope = {
      success: false,
      error: "Order cannot be marked done (current: preparing)",
    };
    const { client } = makeClient({ data: envelope, error: null });

    const res = await OrderService.completeOnlineOrder(client, "db-10");

    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });

  it("passes the success:false envelope back without throwing (HTTP 200 guard branch)", async () => {
    const envelope = {
      success: false,
      error: "Order is not in pending status (current: sent_to_kitchen)",
    };
    const { client } = makeClient({ data: envelope, error: null });

    const res = await OrderService.acceptOnlineOrder(client, "db-4");

    expect(res.error).toBeNull();
    expect(res.data).toEqual(envelope);
  });
});
