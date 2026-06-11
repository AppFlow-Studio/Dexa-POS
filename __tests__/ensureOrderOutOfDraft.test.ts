/**
 * Perf A1 — OrderService.ensureOrderOutOfDraft three-way branch.
 *
 * The deployed update_order_status (verified identical on staging + prod)
 * raises P0001 for BOTH "Order is already in X status" (benign) and "Order
 * not found" (fatal). The helper must:
 *   1. SUCCESS → trust the RPC's returned row; issue NO verify SELECT.
 *   2. P0001 + verify SELECT resolves non-draft → ok (benign "already in").
 *   3. P0001 + verify SELECT errors (not-found) → NOT ok (preserves the
 *      retry → dead-letter visibility for missing orders).
 *   4. P0001 + verify SELECT returns draft → NOT ok (defer item sync).
 *   5. Any other RPC error → NOT ok; NO verify SELECT.
 */

// uuid ships ESM and isn't in transformIgnorePatterns — stub it (same
// workaround as orderService-applyServiceCharge.test.ts).
jest.mock("uuid", () => {
  let mockUuidSeq = 0;
  return {
    v4: () => {
      mockUuidSeq += 1;
      const tail = String(mockUuidSeq).padStart(12, "0");
      return `00000000-0000-4000-8000-${tail}`;
    },
  };
});

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

type RpcResult = { data: unknown; error: any };

function makeClient(
  rpcResult: RpcResult,
  selectResult?: { data: unknown; error: any },
) {
  const single = jest.fn(async () => selectResult);
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  const rpc = jest.fn(() => ({
    abortSignal: jest.fn(async () => rpcResult),
  }));
  return { client: { rpc, from } as any, from, single };
}

const ORDER_ID = "11111111-2222-4333-8444-555555555555";

describe("OrderService.ensureOrderOutOfDraft (Perf A1)", () => {
  it("success: trusts the RPC's returned row and issues NO verify SELECT", async () => {
    const { client, from } = makeClient({
      data: { id: ORDER_ID, status: "sent_to_kitchen" },
      error: null,
    });
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "sent_to_kitchen" as any,
    );
    expect(res.ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("P0001 + non-draft verify → ok (benign 'already in status')", async () => {
    const { client, from, single } = makeClient(
      {
        data: null,
        error: {
          code: "P0001",
          message: "Order is already in sent_to_kitchen status",
        },
      },
      { data: { status: "sent_to_kitchen" }, error: null },
    );
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "sent_to_kitchen" as any,
    );
    expect(res.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("orders");
    expect(single).toHaveBeenCalled();
  });

  it("P0001 + verify SELECT error (order not found) → NOT ok", async () => {
    const { client } = makeClient(
      {
        data: null,
        error: { code: "P0001", message: `Order not found: ${ORDER_ID}` },
      },
      {
        data: null,
        error: { code: "PGRST116", message: "0 rows" },
      },
    );
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "sent_to_kitchen" as any,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("P0001 + verify returns draft → NOT ok (defer item sync)", async () => {
    const { client } = makeClient(
      {
        data: null,
        error: { code: "P0001", message: "Order is already in draft status" },
      },
      { data: { status: "draft" }, error: null },
    );
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "sent_to_kitchen" as any,
    );
    expect(res.ok).toBe(false);
  });

  it("non-P0001 error → NOT ok, NO verify SELECT", async () => {
    const { client, from } = makeClient({
      data: null,
      error: { code: "57014", message: "statement timeout" },
    });
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "sent_to_kitchen" as any,
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("57014");
    expect(from).not.toHaveBeenCalled();
  });

  it("legacy 'already in' message without P0001 code still routes to verify", async () => {
    const { client, single } = makeClient(
      {
        data: null,
        error: { code: "XX000", message: "Order is already in preparing status" },
      },
      { data: { status: "preparing" }, error: null },
    );
    const res = await OrderService.ensureOrderOutOfDraft(
      client,
      ORDER_ID,
      "preparing" as any,
    );
    expect(res.ok).toBe(true);
    expect(single).toHaveBeenCalled();
  });
});
