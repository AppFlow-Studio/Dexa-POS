/**
 * Refund-by-item crash resilience (regression for the S1-0002 USB refund crash).
 *
 * Two defects this guards against:
 *  1. Order totals were reconciled only ONCE after the whole per-payment loop,
 *     so a crash on item #2 stranded item #1's already-committed refund
 *     (order left payment_status=partial / amount_due unchanged). Fix: reconcile
 *     per successful item.
 *  2. A dead/wedged terminal mid-loop was treated like a clean decline and the
 *     loop kept firing refunds into the dead terminal. Fix: fail-fast on a
 *     transport-death error (isTerminalTransportDead) and stop the batch.
 */

// `uuid` ships ESM which jest does not transform by default; stub it (the IDs
// are not asserted here).
jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: () => "00000000-0000-5000-8000-000000000000",
}));

// react-native-tcp-socket constructs a NativeEventEmitter at import time (pulled
// in transitively via the Castles transport factory). It is unused on this path.
jest.mock("react-native-tcp-socket", () => ({
  __esModule: true,
  default: { createConnection: jest.fn(), createServer: jest.fn() },
}));

// Native USB binding — stub so the transport factory imports cleanly without a
// real native module. castles-service itself stays REAL so we exercise the real
// isTerminalTransportDead classifier.
jest.mock("@/modules/castles-usb", () => ({
  listDevices: jest.fn(),
  requestPermission: jest.fn(),
  open: jest.fn(),
  write: jest.fn(),
  close: jest.fn(),
  addDataListener: jest.fn(() => ({ remove: jest.fn() })),
  addErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  addDetachedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("@/services/orderService", () => ({
  OrderService: {
    createReversal: jest.fn(),
    updateReversalStatus: jest.fn(),
    applyRefundToPayment: jest.fn(),
    recordRefundItems: jest.fn(),
    updateOrderPaymentStatusAfterRefund: jest.fn(),
  },
}));

jest.mock("@/services/refundJournal", () => ({
  writeRefundJournal: jest.fn(() => "journal-id"),
  updateRefundJournal: jest.fn(),
  completeRefundJournal: jest.fn(),
  failRefundJournal: jest.fn(),
  // Deterministic key derivation so we can assert per-iteration vs trailing keys.
  toRefundStepKey: (base: string, step: string) => `${base}::${step}`,
}));

import { OrderService } from "@/services/orderService";
import { RefundService } from "@/services/refundService";
import {
  isTerminalTransportDead,
} from "@/services/terminals/castles-service";
import { CastlesEmptyResponseError } from "@/services/terminals/castlesConnectionSupervisor";
import { resolveRefundToast } from "@/components/previous-orders/refundOutcome";

const mocked = OrderService as unknown as {
  createReversal: jest.Mock;
  updateReversalStatus: jest.Mock;
  applyRefundToPayment: jest.Mock;
  recordRefundItems: jest.Mock;
  updateOrderPaymentStatusAfterRefund: jest.Mock;
};

function makeAllocationItem(orderItemId: string, total: number) {
  return {
    orderItemId,
    reason: "other",
    reasonDetail: "test",
    returnToInventory: false,
    paymentAllocations: [
      {
        paymentId: "p1",
        total,
        quantity: 1,
        unitPrice: total,
        subtotal: total - 1,
        tax: 1,
        paymentItemId: `pi-${orderItemId}`,
      },
    ],
  };
}

function makeContext() {
  return {
    payment: undefined,
    payments: [
      {
        paymentId: "p1",
        amount: 172.82,
        serviceCharge: 24.52,
        paymentMethod: "card",
        rrn: "rrn-orig",
        terminalId: "term-1",
      },
    ],
    locationId: "loc-1234",
    stationId: "sta-5678",
  } as any;
}

function makeRequest() {
  return {
    orderId: "order-1",
    reason: "other",
    reasonDetail: "test",
    initiatedBy: "user-1",
    payment_terminal_id: "term-1",
    refundType: { type: "item_return", items: [] },
  } as any;
}

const okTerminalResult = {
  success: true,
  terminalResponse: {
    GeneralResponse: { ResultCode: "00", Message: "APPROVED" },
    RRN: "rrn-refund",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  let revCounter = 0;
  mocked.createReversal.mockImplementation(async () => ({
    data: { id: `rev-${++revCounter}` },
    error: null,
  }));
  mocked.updateReversalStatus.mockResolvedValue({ error: null });
  mocked.applyRefundToPayment.mockResolvedValue({ error: null });
  mocked.recordRefundItems.mockResolvedValue({ error: null });
  mocked.updateOrderPaymentStatusAfterRefund.mockResolvedValue({ error: null });
});

function reconcileKeys(): string[] {
  return mocked.updateOrderPaymentStatusAfterRefund.mock.calls.map(
    (c: any[]) => c[2]?.keyOverride,
  );
}

describe("processItemReturn — crash resilience", () => {
  it("reconciles order totals per successful item (not only after the loop)", async () => {
    const service = new RefundService({} as any);
    (service as any).buildItemRefundAllocation = jest.fn().mockResolvedValue({
      totalRefund: 47.93,
      items: [makeAllocationItem("i1", 33.97), makeAllocationItem("i2", 13.96)],
    });
    (service as any).processTerminalRefund = jest
      .fn()
      .mockResolvedValue(okTerminalResult);

    await (service as any).processItemReturn(
      makeRequest(),
      makeContext(),
      [],
      "batch-key",
    );

    const keys = reconcileKeys();
    // One reconcile per item (unique per-iteration key derived from subKey)…
    expect(keys).toContain("batch-key::create_reversal_0::update_order_payment_status");
    expect(keys).toContain("batch-key::create_reversal_1::update_order_payment_status");
    // …plus the trailing reconcile (distinct key derived from parentBatchKey, so
    // idempotency dedup can't swallow it).
    expect(keys).toContain("batch-key::update_order_payment_status");
    // 2 items + 1 trailing = 3 total.
    expect(mocked.updateOrderPaymentStatusAfterRefund).toHaveBeenCalledTimes(3);
  }, 15000);

  it("stops the batch on a transport-death error (does not fire into a dead terminal)", async () => {
    const service = new RefundService({} as any);
    (service as any).buildItemRefundAllocation = jest.fn().mockResolvedValue({
      totalRefund: 57.93,
      items: [
        makeAllocationItem("i1", 33.97),
        makeAllocationItem("i2", 13.96),
        makeAllocationItem("i3", 10.0),
      ],
    });
    const terminal = jest
      .fn()
      .mockResolvedValueOnce(okTerminalResult)
      .mockResolvedValueOnce({
        success: false,
        error: "USB get_status request failed",
      });
    (service as any).processTerminalRefund = terminal;

    const result = await (service as any).processItemReturn(
      makeRequest(),
      makeContext(),
      [],
      "batch-key",
    );

    // Item #3 must NOT be attempted — terminal called exactly twice.
    expect(terminal).toHaveBeenCalledTimes(2);
    // Only item #1 succeeded.
    expect(result.data.reversals).toHaveLength(1);
    // Item #1 was reconciled per-iteration BEFORE the crash-equivalent stop, so
    // its refund is not stranded.
    expect(reconcileKeys()).toContain(
      "batch-key::create_reversal_0::update_order_payment_status",
    );
    // Operator-facing message names the partial completion.
    expect(result.data.error).toMatch(/Terminal went offline mid-refund/);
    expect(result.data.error).toMatch(/1 item refund\(s\) completed/);
  }, 15000);

  it("continues past a CLEAN decline (declines are not transport death)", async () => {
    const service = new RefundService({} as any);
    (service as any).buildItemRefundAllocation = jest.fn().mockResolvedValue({
      totalRefund: 57.93,
      items: [
        makeAllocationItem("i1", 33.97),
        makeAllocationItem("i2", 13.96),
        makeAllocationItem("i3", 10.0),
      ],
    });
    const terminal = jest
      .fn()
      .mockResolvedValueOnce(okTerminalResult)
      .mockResolvedValueOnce({ success: false, error: "Declined by issuer" })
      .mockResolvedValueOnce(okTerminalResult);
    (service as any).processTerminalRefund = terminal;

    const result = await (service as any).processItemReturn(
      makeRequest(),
      makeContext(),
      [],
      "batch-key",
    );

    // All three items attempted; the decline did not stop the batch.
    expect(terminal).toHaveBeenCalledTimes(3);
    expect(result.data.reversals).toHaveLength(2);
    expect(result.data.error).toMatch(/Declined by issuer/);
    expect(result.data.error).not.toMatch(/Terminal went offline/);
  }, 20000);

  it("returns kind:'error' (not success) when the terminal dies and nothing is refunded", async () => {
    const service = new RefundService({} as any);
    (service as any).buildItemRefundAllocation = jest.fn().mockResolvedValue({
      totalRefund: 33.97,
      items: [makeAllocationItem("i1", 33.97), makeAllocationItem("i2", 13.96)],
    });
    // First (and only attempted) terminal call dies → 0 reversals.
    (service as any).processTerminalRefund = jest
      .fn()
      .mockResolvedValue({ success: false, error: "USB get_status request failed" });

    const result = await (service as any).processItemReturn(
      makeRequest(),
      makeContext(),
      [],
      "batch-key",
    );

    // Must be a FAILURE so every consumer shows "Refund Failed", not success.
    expect(result.kind).toBe("error");
    expect(result.error).toMatch(/Terminal offline/);
    // Nothing was applied/recorded since nothing was refunded.
    expect(mocked.applyRefundToPayment).not.toHaveBeenCalled();
  });
});

describe("resolveRefundToast", () => {
  const opts = { successTitle: "Refund Successful", successMessage: "ok" };

  it("kind:error → failed (red), ok=false", () => {
    const r = resolveRefundToast({ kind: "error", error: "boom" } as any, opts);
    expect(r.ok).toBe(false);
    expect(r.toast.type).toBe("error");
    expect(r.toast.message).toBe("boom");
  });

  it("success with data.success===false → failed (red), ok=false", () => {
    const r = resolveRefundToast(
      { kind: "success", data: { success: false, error: "no items", reversals: [] } } as any,
      opts,
    );
    expect(r.ok).toBe(false);
    expect(r.toast.type).toBe("error");
    expect(r.toast.message).toBe("no items");
  });

  it("success with data.error (partial) → warning (yellow), ok=true", () => {
    const r = resolveRefundToast(
      { kind: "success", data: { success: true, error: "1 of 2 refunded", reversals: [{}] } } as any,
      opts,
    );
    expect(r.ok).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.toast.type).toBe("warning");
    expect(r.toast.message).toBe("1 of 2 refunded");
  });

  it("clean success → success (green)", () => {
    const r = resolveRefundToast(
      { kind: "success", data: { success: true, reversals: [{}] } } as any,
      opts,
    );
    expect(r.ok).toBe(true);
    expect(r.partial).toBe(false);
    expect(r.toast.type).toBe("success");
    expect(r.toast.title).toBe("Refund Successful");
  });

  it("verifying → treated as success (terminal already approved)", () => {
    const r = resolveRefundToast({ kind: "verifying", journalId: "j" } as any, opts);
    expect(r.ok).toBe(true);
    expect(r.toast.type).toBe("success");
  });
});

describe("isTerminalTransportDead", () => {
  it.each([
    "USB get_status request failed",
    "Response timed out after 120000ms. Buffer (0 chars)",
    "Transport closed before response was received",
    "Write failed: broken pipe",
    "controlTransfer failed",
    "Castles command queue is busy — a previous operation appears stuck.",
    "Port is not open",
  ])("treats %s as transport death", (msg) => {
    expect(isTerminalTransportDead(new Error(msg))).toBe(true);
  });

  it("treats CastlesEmptyResponseError as transport death", () => {
    expect(isTerminalTransportDead(new CastlesEmptyResponseError(120000))).toBe(
      true,
    );
  });

  it.each([
    "Declined by issuer",
    "Insufficient funds",
    "Card removed",
    "Approved",
  ])("treats %s as a normal (non-transport) outcome", (msg) => {
    expect(isTerminalTransportDead(new Error(msg))).toBe(false);
  });
});

describe("explicit refund classification", () => {
  it("keeps a full unsettled refund as refund instead of converting it to void", async () => {
    const service = new RefundService({} as any);
    const context = makeContext();
    context.payment = {
      ...context.payments[0],
      availableForRefund: 25,
      isVoidable: true,
    };
    (service as any).processTerminalRefund = jest
      .fn()
      .mockResolvedValue(okTerminalResult);
    (service as any).buildFullRefundItems = jest.fn().mockResolvedValue([]);

    const result = await (service as any).processFullPaymentRefund(
      makeRequest(),
      context,
      "journal-id",
      "refund-key",
    );

    expect(result.kind).toBe("success");
    expect(mocked.createReversal.mock.calls[0][1].reversal_type).toBe("refund");
    expect((service as any).processTerminalRefund.mock.calls[0][2]).toBe(false);
    expect(mocked.applyRefundToPayment.mock.calls[0][3]).toBe("refund");
  });

  it("classifies a custom amount equal to the balance as refund, not void", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };
    const service = new RefundService(client as any);
    const context = makeContext();
    context.payment = {
      ...context.payments[0],
      availableForRefund: 25,
      isVoidable: true,
    };
    (service as any).processTerminalRefund = jest
      .fn()
      .mockResolvedValue(okTerminalResult);

    const result = await (service as any).processPartialRefund(
      makeRequest(),
      context,
      25,
      "journal-id",
      "refund-key",
    );

    expect(result.kind).toBe("success");
    expect(mocked.createReversal.mock.calls[0][1].reversal_type).toBe("refund");
    expect((service as any).processTerminalRefund.mock.calls[0][2]).toBe(false);
    expect(mocked.applyRefundToPayment.mock.calls[0][3]).toBe("refund");
  });
});
