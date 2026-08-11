/**
 * Wave A — server-truth Close-Table gate.
 *
 * Focus: the PROVEN-PAID invariant (the walked-money safety net) and the
 * reconcile driver. The invariant must never unlock "Sync & Clear" on a small
 * residual alone, and must reject the documented false-heal (a dup optimistic
 * payment doubling amount_paid → Partial→Paid).
 */

import type { OrderProfile } from "@/lib/types";

// --- mockable dependency state ---
const mockGetOrder = jest.fn();
const mockSync = jest.fn();
let mockFlagEnabled = true;
let mockOnline = true;

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: {
    getState: () => ({
      getOrder: mockGetOrder,
      syncOrderFromBackendComplete: mockSync,
    }),
  },
}));

jest.mock("@/stores/useLocationConfigStore", () => ({
  useLocationConfigStore: {
    getState: () => ({
      config: { dining: { syncAndClearEnabled: mockFlagEnabled } },
    }),
  },
}));

jest.mock("@/services/offlineSyncService", () => ({
  getIsOnline: () => mockOnline,
}));

jest.mock("@/lib/perf", () => ({
  markStart: jest.fn(),
  markEnd: jest.fn(),
}));

import {
  capturedCardSummary,
  isOrderProvenPaid,
  reconcileOrdersForClose,
} from "@/services/tables/serverPaidCloseGate";

function makeOrder(overrides: Partial<OrderProfile> = {}): OrderProfile {
  const base: any = {
    id: "order_1",
    db_order_id: "db-1",
    service_location_id: "loc-1",
    paid_status: "Paid",
    total_amount: 123.07,
    amount_paid: 123.07,
    amount_due: 0,
    check_status: "Closed",
    items: [],
    payments: [
      { id: "p1", amount: 61.54, status: "captured", sync_status: "synced", last4: "7687" },
      { id: "p2", amount: 61.53, status: "captured", sync_status: "synced", last4: "7088" },
    ],
  };
  return { ...base, ...overrides } as OrderProfile;
}

describe("isOrderProvenPaid — PROVEN-PAID invariant", () => {
  it("accepts a genuinely fully-captured, server-settled split check", () => {
    expect(isOrderProvenPaid(makeOrder())).toBe(true);
  });

  it("rejects null / undefined", () => {
    expect(isOrderProvenPaid(null)).toBe(false);
    expect(isOrderProvenPaid(undefined)).toBe(false);
  });

  it("USER EDGE CASE: an unpaid $0.01 custom item is NOT proven-paid", () => {
    // amount_due <= 0.01 but nothing was actually paid — the residual must
    // never unlock the clear on its own.
    const order = makeOrder({
      paid_status: "Unpaid",
      total_amount: 0.01,
      amount_paid: 0,
      amount_due: 0.01,
      payments: [],
    });
    expect(isOrderProvenPaid(order)).toBe(false);
  });

  it("rejects paid_status Partial even when the residual is tiny", () => {
    expect(
      isOrderProvenPaid(makeOrder({ paid_status: "Partial", amount_due: 0 })),
    ).toBe(false);
  });

  it("false-heal guard: rejects when an unsynced/pending local payment exists", () => {
    const order = makeOrder({
      payments: [
        { id: "p1", amount: 123.07, status: "captured", sync_status: "pending", last4: "7687" },
      ] as any,
    });
    expect(isOrderProvenPaid(order)).toBe(false);
  });

  it("rejects when captured payments do not cover the total", () => {
    expect(isOrderProvenPaid(makeOrder({ amount_paid: 61.54 }))).toBe(false);
  });

  it("rejects when there is no captured payment (only authorized/pre-auth)", () => {
    const order = makeOrder({
      payments: [{ id: "p1", amount: 123.07, status: "authorized", sync_status: "synced" }] as any,
    });
    expect(isOrderProvenPaid(order)).toBe(false);
  });

  it("rejects when amount_due exceeds the cent tolerance", () => {
    expect(isOrderProvenPaid(makeOrder({ amount_due: 0.5 }))).toBe(false);
  });

  it("accepts a one-cent rounding residual (<= epsilon)", () => {
    expect(isOrderProvenPaid(makeOrder({ amount_due: 0.01 }))).toBe(true);
  });
});

describe("capturedCardSummary", () => {
  it("lists distinct captured last-4s", () => {
    expect(capturedCardSummary(makeOrder())).toBe("••7687, ••7088");
  });
  it("returns empty string when there are no captured cards", () => {
    expect(capturedCardSummary(makeOrder({ payments: [] }))).toBe("");
  });
});

describe("reconcileOrdersForClose", () => {
  beforeEach(() => {
    mockGetOrder.mockReset();
    mockSync.mockReset();
    mockFlagEnabled = true;
    mockOnline = true;
  });

  it("returns disabled (no server read) when the runtime flag is off", async () => {
    mockFlagEnabled = false;
    mockGetOrder.mockReturnValue(makeOrder({ paid_status: "Partial" }));
    const r = await reconcileOrdersForClose(["order_1"]);
    expect(r.outcome).toBe("disabled");
    expect(r.allProvenPaid).toBe(false);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("fast-paths an already proven-paid order without a server read", async () => {
    mockGetOrder.mockReturnValue(makeOrder());
    const r = await reconcileOrdersForClose(["order_1"]);
    expect(r.outcome).toBe("already_paid");
    expect(r.allProvenPaid).toBe(true);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("reconciles and flips to proven-paid when the server says paid", async () => {
    const partial = makeOrder({
      paid_status: "Partial",
      amount_due: 123.07,
      amount_paid: 0,
      payments: [],
    });
    const paid = makeOrder();
    let synced = false;
    mockGetOrder.mockImplementation(() => (synced ? paid : partial));
    mockSync.mockImplementation(async () => {
      synced = true;
    });
    const r = await reconcileOrdersForClose(["order_1"], { force: true });
    expect(mockSync).toHaveBeenCalledWith("order_1", { force: true });
    expect(r.outcome).toBe("reconciled_paid");
    expect(r.allProvenPaid).toBe(true);
  });

  it("stays unpaid (void remains) when the server is genuinely unpaid", async () => {
    mockGetOrder.mockReturnValue(
      makeOrder({ paid_status: "Partial", amount_due: 50, amount_paid: 73, payments: [] }),
    );
    const r = await reconcileOrdersForClose(["order_1"], { force: true });
    expect(r.outcome).toBe("still_unpaid");
    expect(r.allProvenPaid).toBe(false);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("skips the server read when offline (degrades to today's behavior)", async () => {
    mockOnline = false;
    mockGetOrder.mockReturnValue(
      makeOrder({ paid_status: "Partial", amount_due: 123.07, amount_paid: 0, payments: [] }),
    );
    const r = await reconcileOrdersForClose(["order_1"]);
    expect(r.outcome).toBe("offline");
    expect(mockSync).not.toHaveBeenCalled();
  });
});
