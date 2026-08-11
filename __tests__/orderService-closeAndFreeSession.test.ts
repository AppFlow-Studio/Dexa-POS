/**
 * OrderService.closeAndFreeSession — Wave B client wrapper test.
 *
 * Locks the RPC contract: the function name and param shape MUST match the
 * close_and_free_session SQL function (p_order_id, p_session_id, p_staff_id,
 * p_idempotency_key), and the {success, already_freed} response must be parsed
 * so the offline-queue executor can treat already_freed as idempotent success.
 * A param-name drift here would silently break the reliable table-free path.
 */

const mockKillSwitch = { isServiceChargeEnabled: true };
jest.mock("@/lib/serviceCharge", () => ({
  get isServiceChargeEnabled() {
    return mockKillSwitch.isServiceChargeEnabled;
  },
}));

// uuid ships ESM — stub it so importing OrderService doesn't SyntaxError.
jest.mock("uuid", () => {
  let seq = 0;
  return {
    v4: () => {
      seq += 1;
      return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
    },
  };
});

// Bypass the deadline wrap — invoke the call fn directly with a no-op signal.
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

type RpcCapture = { name: string; params: Record<string, any> };
function buildClient(response: { data: any; error: any }): {
  client: any;
  captures: RpcCapture[];
} {
  const captures: RpcCapture[] = [];
  const client = {
    rpc: (name: string, params: Record<string, any>) => {
      captures.push({ name, params });
      return { abortSignal: (_s: AbortSignal) => Promise.resolve(response) };
    },
  };
  return { client, captures };
}

describe("OrderService.closeAndFreeSession", () => {
  it("calls the close_and_free_session RPC with the exact param shape", async () => {
    const { client, captures } = buildClient({
      data: { success: true, already_freed: false },
      error: null,
    });
    await OrderService.closeAndFreeSession(
      client,
      "order-uuid",
      "session-uuid",
      "staff-uuid",
      "idem-key",
    );
    expect(captures).toHaveLength(1);
    expect(captures[0].name).toBe("close_and_free_session");
    expect(captures[0].params).toEqual({
      p_order_id: "order-uuid",
      p_session_id: "session-uuid",
      p_staff_id: "staff-uuid",
      p_idempotency_key: "idem-key",
    });
  });

  it("defaults optional staff/idempotency to null", async () => {
    const { client, captures } = buildClient({
      data: { success: true },
      error: null,
    });
    await OrderService.closeAndFreeSession(client, "o", "s");
    expect(captures[0].params.p_staff_id).toBeNull();
    expect(captures[0].params.p_idempotency_key).toBeNull();
  });

  it("returns success + already_freed=true (idempotent replay signal)", async () => {
    const { client } = buildClient({
      data: { success: true, already_freed: true },
      error: null,
    });
    const r = await OrderService.closeAndFreeSession(client, "o", "s", "staff");
    expect(r).toEqual({ success: true, already_freed: true });
  });

  it("maps a fresh free to success + already_freed=false", async () => {
    const { client } = buildClient({
      data: { success: true, already_freed: false },
      error: null,
    });
    const r = await OrderService.closeAndFreeSession(client, "o", "s");
    expect(r.success).toBe(true);
    expect(r.already_freed).toBe(false);
  });

  it("surfaces an RPC error as { success:false, error } (so the queue retries)", async () => {
    const { client } = buildClient({
      data: null,
      error: { message: "Order not fully paid (amount_due=5.00)" },
    });
    const r = await OrderService.closeAndFreeSession(client, "o", "s", "staff");
    expect(r.success).toBe(false);
    expect(r.error).toContain("not fully paid");
  });
});
