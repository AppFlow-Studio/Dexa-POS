/**
 * Wave A: assert that OrderDiscountService.applyDiscount /
 * OrderDiscountService.voidDiscount route through rpcWithIdempotency
 * with the v2 → v3 fallback shape (matching the v12 → v14 process_payment
 * precedent in services/orderService.ts). v3 is the SC-inclusive primary;
 * v2 is the SC-blind fallback for the rollback window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Spy on rpcWithIdempotency so we can capture (rpc, v1Name, v2Name, params, opts).
// Avoid requireActual: the real module pulls in 'uuid' (ESM-only build) which
// jest-expo doesn't transform. Stub only the exports we touch.
jest.mock("@/lib/network/idempotencyKey", () => ({
  rpcWithIdempotency: jest.fn(),
}));

// Pull in DEADLINES via mock too so orderDiscountService's import doesn't
// transitively crash on the same uuid ESM path.
jest.mock("@/lib/network/deadlines", () => ({
  DEADLINES: { hotMutation: 2500, read: 1500, sendToKitchen: 5000, paymentRpc: 8000 },
}));

import { rpcWithIdempotency } from "@/lib/network/idempotencyKey";
import { OrderDiscountService } from "@/services/orderDiscountService";

const mockedRpc = rpcWithIdempotency as jest.MockedFunction<
  typeof rpcWithIdempotency
>;

describe("OrderDiscountService — v2 → v3 fallback wiring", () => {
  const client = {} as SupabaseClient;

  beforeEach(() => {
    mockedRpc.mockReset();
    // Default to a successful v3-shaped response (the actual fields aren't
    // asserted here — we're testing the wrapper, not the RPC).
    mockedRpc.mockResolvedValue({
      data: {
        success: true,
        order_discount_id: "od_123",
        calculated_amount: 9.0,
      } as any,
      error: null,
    });
  });

  it("applyDiscount calls rpcWithIdempotency with v2 fallback + v3 primary", async () => {
    await OrderDiscountService.applyDiscount(client, {
      order_id: "o_1",
      staff_id: "s_1",
      discount_id: null,
      discount_name: "10% Off",
      discount_type: "percentage",
      discount_value: 10,
      source: "open",
      reason: null,
      applied_to_item_ids: null,
      approved_by_staff_id: "mgr_1",
    });

    expect(mockedRpc).toHaveBeenCalledTimes(1);
    const args = mockedRpc.mock.calls[0];
    // Signature: (client, rpc, v1Name, v2Name, params, opts)
    expect(args[0]).toBe(client);
    expect(args[1]).toBe("manage_order_discount");
    expect(args[2]).toBe("manage_order_discount_v2");
    expect(args[3]).toBe("manage_order_discount_v3");
    // params.p_action === 'apply'; key params are forwarded.
    expect(args[4]).toMatchObject({
      p_action: "apply",
      p_order_id: "o_1",
      p_staff_id: "s_1",
      p_discount_name: "10% Off",
      p_discount_type: "percentage",
      p_discount_value: 10,
      p_source: "open",
      p_approved_by_staff_id: "mgr_1",
    });
    // deadline opt is set.
    expect(args[5]).toHaveProperty("deadline");
  });

  it("voidDiscount calls rpcWithIdempotency with v2 fallback + v3 primary", async () => {
    await OrderDiscountService.voidDiscount(client, {
      order_id: "o_1",
      staff_id: "s_1",
      order_discount_id: "od_123",
      void_reason: "comp",
    });

    expect(mockedRpc).toHaveBeenCalledTimes(1);
    const args = mockedRpc.mock.calls[0];
    expect(args[1]).toBe("manage_order_discount");
    expect(args[2]).toBe("manage_order_discount_v2");
    expect(args[3]).toBe("manage_order_discount_v3");
    expect(args[4]).toMatchObject({
      p_action: "void",
      p_order_id: "o_1",
      p_staff_id: "s_1",
      p_order_discount_id: "od_123",
      p_void_reason: "comp",
    });
  });

  it("propagates RPC errors without throwing", async () => {
    mockedRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Permission denied", code: "42501" } as any,
    });

    const res = await OrderDiscountService.applyDiscount(client, {
      order_id: "o_1",
      staff_id: "s_1",
      discount_id: "preset_1",
      discount_name: "Senior 10%",
      discount_type: "percentage",
      discount_value: 10,
    });

    expect(res).toEqual({ success: false, error: "Permission denied" });
  });

  it("passes through v3 response shape including service_charge / sync_version", async () => {
    mockedRpc.mockResolvedValueOnce({
      data: {
        success: true,
        order_discount_id: "od_999",
        calculated_amount: 10,
        order: {
          id: "o_1",
          card_subtotal: 100,
          cash_subtotal: 100,
          discount_amount: 10,
          effective_subtotal: 90,
          effective_tax_amount: 7.2,
          effective_total: 115.2,
          card_tax_amount: 7.2,
          cash_tax_amount: 7.2,
          card_total: 115.2,
          cash_total: 115.2,
          total_amount: 115.2,
          amount_due: 115.2,
          cash_amount_due: 115.2,
          amount_paid: 0,
          service_charge: 18,
          service_charge_rate: 18,
          service_charge_applies_on: "pre_discount",
          service_charge_rule_id: "rule_1",
          service_charge_name: "Service Charge",
          sync_version: 42,
        },
      } as any,
      error: null,
    });

    const res = await OrderDiscountService.applyDiscount(client, {
      order_id: "o_1",
      staff_id: "s_1",
      discount_id: null,
      discount_name: "10% Off",
      discount_type: "percentage",
      discount_value: 10,
      approved_by_staff_id: "mgr_1",
    });

    expect(res.success).toBe(true);
    expect(res.order?.service_charge).toBe(18);
    expect(res.order?.card_total).toBe(115.2);
    expect(res.order?.sync_version).toBe(42);
    // Sanity: response satisfies the SC invariant.
    expect(res.order!.card_total).toBeCloseTo(
      res.order!.effective_subtotal +
        res.order!.card_tax_amount +
        (res.order!.service_charge ?? 0),
      2,
    );
  });
});
