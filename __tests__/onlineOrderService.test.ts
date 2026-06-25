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
    async <T,>(
      _op: string,
      _ms: number,
      call: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>,
    ) => {
      const ac = new AbortController();
      return call(ac.signal);
    },
  ),
}));

import { OrderService } from "@/services/orderService";

function makeClient(rpcResult: { data: unknown; error: any }) {
  const abortSignal = jest.fn(async () => rpcResult);
  const rpc = jest.fn(() => ({ abortSignal }));
  return { client: { rpc } as any, rpc, abortSignal };
}

describe("OrderService online-order actions", () => {
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
