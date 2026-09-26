/**
 * finalizeDineInPaymentClear — dual pricing + mixed tender.
 *
 * Prod (Charcoal Gardenia, Table 33, 2026-09-25): cash-priced cash + two card
 * payments left card-basis amount_due at the $3.38 cash/card spread while
 * cash_amount_due was 0, so auto-clear returned "siblings-due" and staff had to
 * close the table by hand.
 */

const mockDispatch = jest.fn();
let mockOrders: Record<string, any> = {};

jest.mock("@/services/offlineSyncInit", () => ({
  queueFailedOperation: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/offlineSyncService", () => ({
  getIsOnline: () => false,
}));
jest.mock("@/services/orderService", () => ({ OrderService: {} }));
jest.mock("@/stores/useEmployeeStore", () => ({
  useEmployeeStore: { getState: () => ({ loggedInEmployee: null }) },
}));
jest.mock("@/stores/useFloorPlanStore", () => ({
  useFloorPlanStore: { getState: () => ({}) },
}));
jest.mock("@/stores/useLocationConfigStore", () => ({
  useLocationConfigStore: {
    getState: () => ({ config: { dining: { autoClearTableOnPayment: true } } }),
  },
}));
jest.mock("@/stores/useOrderStore", () => ({
  getOrderStoreSupabaseClient: () => null,
  useOrderStore: { getState: () => ({ ordersById: mockOrders }) },
}));
jest.mock("@/stores/useTableSessionStore", () => ({
  useTableSessionStore: {
    getState: () => ({
      getSession: () => ({ id: "sess-1" }),
      dispatch: mockDispatch,
    }),
  },
}));

import { finalizeDineInPaymentClear } from "@/services/tables/finalizeDineInPaymentClear";

const paidItem = { quantity: 1, paidQuantity: 1, is_voided: false };

function setOrder(order: Record<string, any>) {
  mockOrders = {
    o1: { id: "o1", session_id: "sess-1", items: [paidItem], ...order },
  };
}

beforeEach(() => {
  mockDispatch.mockClear();
});

describe("finalizeDineInPaymentClear — dual pricing mixed tender", () => {
  it("clears when card-basis due is the cash/card spread but cash basis is settled", () => {
    setOrder({
      amount_due: 3.38,
      cash_amount_due: 0,
      payments: [
        { method: "cash", isCashPriced: true },
        { method: "card", isCashPriced: false },
      ],
    });
    expect(finalizeDineInPaymentClear({ tableId: "t1" })).toEqual({
      cleared: true,
    });
    expect(mockDispatch).toHaveBeenCalledWith("t1", { type: "CLEAR" });
  });

  it("still blocks a card-only short payment even if cash basis reads 0", () => {
    setOrder({
      amount_due: 3.38,
      cash_amount_due: 0,
      payments: [{ method: "card", isCashPriced: false }],
    });
    expect(finalizeDineInPaymentClear({ tableId: "t1" })).toEqual({
      cleared: false,
      reason: "siblings-due",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("still blocks when both bases are due", () => {
    setOrder({
      amount_due: 20,
      cash_amount_due: 19.2,
      payments: [{ method: "cash", isCashPriced: true }],
    });
    expect(finalizeDineInPaymentClear({ tableId: "t1" }).cleared).toBe(false);
  });

  it("items-level guard still blocks unpaid items", () => {
    setOrder({
      amount_due: 3.38,
      cash_amount_due: 0,
      payments: [{ method: "cash", isCashPriced: true }],
      items: [{ quantity: 2, paidQuantity: 1, is_voided: false }],
    });
    expect(finalizeDineInPaymentClear({ tableId: "t1" })).toEqual({
      cleared: false,
      reason: "unpaid-items",
    });
  });
});
