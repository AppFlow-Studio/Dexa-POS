/**
 * Refund recovery: after a successful refund, useOrderStore must be force-synced
 * from the DB and, if the table session is still in `paid` (left over from the
 * pre-refund payment) and amount_due > 0, REOPEN_CHECK must fire.
 *
 * The bug this guards against: after a cash refund the floor plan kept showing
 * "Clear & Close" and Pay for Items showed Collected $0 / PAYMENTS (0) because
 * neither store was resynced to backend authority.
 */

const mockSyncOrderFromBackendComplete = jest.fn();
const mockDispatchAction = jest.fn();
const mockGetSession = jest.fn();
const mockLoadFloorPlanStatus = jest.fn().mockResolvedValue(undefined);

let mockOrder: any = null;
let mockDbOrderIdIndex: Record<string, string> = {};

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: {
    getState: () => ({
      syncOrderFromBackendComplete: mockSyncOrderFromBackendComplete,
      get ordersById() {
        return mockOrder ? { [mockOrder.id]: mockOrder } : {};
      },
      get dbOrderIdIndex() {
        return mockDbOrderIdIndex;
      },
    }),
  },
}));

jest.mock("@/stores/useTableSessionStore", () => ({
  useTableSessionStore: {
    getState: () => ({
      getSession: mockGetSession,
      dispatchAction: mockDispatchAction,
    }),
  },
}));

jest.mock("@/stores/useFloorPlanStore", () => ({
  useFloorPlanStore: {
    getState: () => ({
      loadFloorPlanStatus: mockLoadFloorPlanStatus,
    }),
  },
}));

import { applyRefundRecovery } from "@/lib/refundRecovery";

beforeEach(() => {
  jest.useFakeTimers();
  mockSyncOrderFromBackendComplete.mockReset();
  mockDispatchAction.mockReset();
  mockGetSession.mockReset();
  mockLoadFloorPlanStatus.mockClear();
  mockOrder = null;
  mockDbOrderIdIndex = {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe("applyRefundRecovery", () => {
  it("force-syncs the order from the backend after refund", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "check_presented" });

    await applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" });

    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledWith("ord-1", {
      force: true,
    });
  });

  it("dispatches REOPEN_CHECK when the table is stuck at paid and amount_due > 0", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "paid" });
    mockDispatchAction.mockResolvedValue({ success: true });

    await applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" });

    expect(mockDispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "REOPEN_CHECK",
        tableId: "tbl-1",
        orderId: "ord-1",
        dbOrderId: "db-1",
      }),
    );
  });

  it("does NOT dispatch REOPEN_CHECK when the session is not at paid", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "check_presented" });

    await applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" });

    expect(mockDispatchAction).not.toHaveBeenCalled();
  });

  it("does NOT dispatch REOPEN_CHECK when amount_due is still ~0", async () => {
    // Edge case: partial refund that doesn't reopen the bill (still fully paid).
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 0 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "paid" });

    await applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" });

    expect(mockDispatchAction).not.toHaveBeenCalled();
  });

  it("resolves dbOrderIdIndex when the caller passes a db_order_id instead of local key", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockDbOrderIdIndex = { "db-1": "ord-1" };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "paid" });
    mockDispatchAction.mockResolvedValue({ success: true });

    await applyRefundRecovery({ orderId: "db-1", tableId: "tbl-1" });

    expect(mockDispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord-1", dbOrderId: "db-1" }),
    );
  });

  it("schedules a floor plan refresh when a tableId is provided", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue({ status: "check_presented" });

    await applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" });

    expect(mockLoadFloorPlanStatus).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(mockLoadFloorPlanStatus).toHaveBeenCalledTimes(1);
  });

  it("does NOT touch the table store when no tableId is provided (takeout/delivery)", async () => {
    mockOrder = { id: "ord-1", db_order_id: "db-1", amount_due: 21.52 };
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined);

    await applyRefundRecovery({ orderId: "ord-1" });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockDispatchAction).not.toHaveBeenCalled();
    expect(mockLoadFloorPlanStatus).not.toHaveBeenCalled();
  });

  it("swallows errors so refund flow downstream code still runs", async () => {
    mockSyncOrderFromBackendComplete.mockRejectedValue(new Error("network down"));

    await expect(
      applyRefundRecovery({ orderId: "ord-1", tableId: "tbl-1" }),
    ).resolves.toBeUndefined();
  });
});
