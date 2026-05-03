/**
 * Wave Cat-B (C1c): paymentService.ts wrap behavior.
 *
 * Locks in:
 * - PaymentRpcOutcome discriminated-union mapping
 * - DEADLINE_EXCEEDED → { kind: 'verifying', reason: 'deadline_exceeded' }
 * - 40001 / idempotency_in_flight → { kind: 'verifying', reason: 'idempotency_in_flight' }
 * - other errors → { kind: 'error' }
 * - successful response → { kind: 'success', data }
 * - idempotencyKey is threaded through to OrderService.processPayment as keyOverride
 */

const mockProcessPayment = jest.fn();

jest.mock("@/services/orderService", () => ({
  OrderService: {
    processPayment: (...args: unknown[]) => mockProcessPayment(...args),
  },
}));

jest.mock("@/stores/useOrderStore", () => ({
  getOrderStoreSupabaseClient: jest.fn(() => ({ rpc: jest.fn() })),
}));

jest.mock("@/lib/supabase", () => ({
  captureRpcError: jest.fn(),
}));

jest.mock("@/utils/money", () => ({
  round2: (n: number) => Math.round(n * 100) / 100,
}));

import {
    payForItems,
    payFullCard,
    payFullCash,
    paySplitPortion,
    type PaymentRpcOutcome,
    type ProcessPaymentV2Result,
} from "@/services/paymentService";

const KEY = "11111111-1111-4111-8111-111111111111";

const SUCCESS_DATA = {
  success: true,
  payment_id: "pay-1",
  payment_method: "card",
  amount_charged: 12.34,
  tip_amount: 0,
  total_collected: 12.34,
  change_given: 0,
  is_cash_priced: false,
  pricing_mode: "card",
  items_covered: [],
  order_amount_paid: 12.34,
  order_amount_due: 0,
  order_fully_paid: true,
} satisfies ProcessPaymentV2Result;

beforeEach(() => {
  mockProcessPayment.mockReset();
});

describe("paymentService — PaymentRpcOutcome mapping", () => {
  describe("payFullCard", () => {
    it("returns kind=success on a clean response", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: SUCCESS_DATA,
        error: null,
      });
      const outcome = (await payFullCard("order-1", 12.34, KEY)) as PaymentRpcOutcome<ProcessPaymentV2Result>;
      expect(outcome.kind).toBe("success");
      if (outcome.kind === "success") {
        expect(outcome.data.payment_id).toBe("pay-1");
      }
    });

    it("maps DEADLINE_EXCEEDED to verifying:deadline_exceeded and preserves the key", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: null,
        error: { code: "DEADLINE_EXCEEDED", message: "timed out" },
      });
      const outcome = await payFullCard("order-1", 12.34, KEY);
      expect(outcome.kind).toBe("verifying");
      if (outcome.kind === "verifying") {
        expect(outcome.reason).toBe("deadline_exceeded");
        expect(outcome.idempotencyKey).toBe(KEY);
      }
    });

    it("maps SQLSTATE 40001 to verifying:idempotency_in_flight", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: null,
        error: { code: "40001", message: "idempotency_in_flight" },
      });
      const outcome = await payFullCard("order-1", 12.34, KEY);
      expect(outcome.kind).toBe("verifying");
      if (outcome.kind === "verifying") {
        expect(outcome.reason).toBe("idempotency_in_flight");
      }
    });

    it("maps message-based idempotency_in_flight to verifying", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: null,
        error: {
          code: "P0001",
          message: "duplicate idempotency_in_flight detected",
        },
      });
      const outcome = await payFullCard("order-1", 12.34, KEY);
      expect(outcome.kind).toBe("verifying");
    });

    it("maps generic errors to kind=error", async () => {
      const err = { code: "P0001", message: "Order not found" };
      mockProcessPayment.mockResolvedValueOnce({ data: null, error: err });
      const outcome = await payFullCard("order-1", 12.34, KEY);
      expect(outcome.kind).toBe("error");
      if (outcome.kind === "error") {
        expect(outcome.error).toEqual(err);
      }
    });

    it("threads the supplied idempotencyKey to OrderService.processPayment as keyOverride", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: SUCCESS_DATA,
        error: null,
      });
      await payFullCard("order-1", 12.34, KEY);
      expect(mockProcessPayment).toHaveBeenCalledTimes(1);
      const [, , opts] = mockProcessPayment.mock.calls[0];
      expect(opts).toEqual({ keyOverride: KEY });
    });
  });

  describe("payFullCash", () => {
    it("threads the key + maps deadline → verifying", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: null,
        error: { code: "DEADLINE_EXCEEDED" },
      });
      const outcome = await payFullCash("order-1", 10.0, 20.0, KEY);
      expect(outcome.kind).toBe("verifying");
      const [, , opts] = mockProcessPayment.mock.calls[0];
      expect(opts).toEqual({ keyOverride: KEY });
    });
  });

  describe("paySplitPortion", () => {
    it("returns success and threads the key", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: SUCCESS_DATA,
        error: null,
      });
      const outcome = await paySplitPortion(
        "order-1",
        "card",
        25.0,
        KEY,
        2.0,
        undefined,
        undefined,
        2,
        1,
      );
      expect(outcome.kind).toBe("success");
      const [, , opts] = mockProcessPayment.mock.calls[0];
      expect(opts).toEqual({ keyOverride: KEY });
    });
  });

  describe("payForItems", () => {
    it("returns 40001 → verifying:idempotency_in_flight", async () => {
      mockProcessPayment.mockResolvedValueOnce({
        data: null,
        error: { code: "40001", message: "idempotency_in_flight" },
      });
      const outcome = await payForItems(
        "order-1",
        [{ order_item_id: "item-1", quantity: 1 }],
        "card",
        KEY,
      );
      expect(outcome.kind).toBe("verifying");
      if (outcome.kind === "verifying") {
        expect(outcome.reason).toBe("idempotency_in_flight");
      }
    });
  });

  describe("key reuse across retries", () => {
    it("when caller retries with the same idempotencyKey, processPayment is called twice with the same keyOverride", async () => {
      mockProcessPayment
        .mockResolvedValueOnce({ data: null, error: { code: "DEADLINE_EXCEEDED" } })
        .mockResolvedValueOnce({ data: SUCCESS_DATA, error: null });

      const outcome1 = await payFullCard("order-1", 12.34, KEY);
      expect(outcome1.kind).toBe("verifying");

      // Operator retries via the same journal entry → same key
      const outcome2 = await payFullCard("order-1", 12.34, KEY);
      expect(outcome2.kind).toBe("success");

      expect(mockProcessPayment).toHaveBeenCalledTimes(2);
      const opts1 = mockProcessPayment.mock.calls[0][2];
      const opts2 = mockProcessPayment.mock.calls[1][2];
      expect(opts1).toEqual({ keyOverride: KEY });
      expect(opts2).toEqual({ keyOverride: KEY });
    });
  });
});
