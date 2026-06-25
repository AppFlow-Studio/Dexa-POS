/**
 * useOnlineOrderActions — accept/decline outcome branching.
 *
 * Covers: offline gate (no false success), optimistic flip + rollback on
 * network error, benign "not pending → sent_to_kitchen" success, real
 * "not pending → declined" failure, and the per-order in-flight lock.
 */
import { renderHook } from "@testing-library/react-native";

// ── mocks ───────────────────────────────────────────────────────────────────
jest.mock("@/lib/perf", () => ({
  startInteraction: () => ({
    setAttributes: () => {},
    end: () => {},
    endAfterPaint: () => {},
    cancel: () => {},
  }),
}));

const mockGetIsOnline = jest.fn(() => true);
jest.mock("@/services/offlineSyncService", () => ({
  getIsOnline: () => mockGetIsOnline(),
}));

const mockAccept = jest.fn();
const mockDecline = jest.fn();
jest.mock("@/services/orderService", () => ({
  OrderService: {
    acceptOnlineOrder: (...a: any[]) => mockAccept(...a),
    declineOnlineOrder: (...a: any[]) => mockDecline(...a),
  },
}));

let mockOrder: any;
const patchCalls: Array<{ key: string; patch: any }> = [];
jest.mock("@/stores/useOrderStore", () => ({
  getOrderStoreSupabaseClient: () => ({}),
  useOrderStore: {
    getState: () => ({
      getOrder: (_id: string) => mockOrder,
      patchOrder: (key: string, patch: any) => {
        patchCalls.push({ key, patch });
        if (mockOrder) Object.assign(mockOrder, patch);
      },
      get ordersById() {
        return mockOrder ? { [mockOrder.id]: mockOrder } : {};
      },
      dbOrderIdIndex: {} as Record<string, string>,
    }),
  },
}));

import { useOnlineOrderActions } from "@/hooks/orders/useOnlineOrderActions";

function setOrder(over: Partial<any> = {}) {
  mockOrder = {
    id: "db-1",
    db_order_id: "db-1",
    order_status: "pending",
    sync_version: 5,
    ...over,
  };
}

beforeEach(() => {
  patchCalls.length = 0;
  mockGetIsOnline.mockReturnValue(true);
  mockAccept.mockReset();
  mockDecline.mockReset();
  setOrder();
});

describe("useOnlineOrderActions", () => {
  it("offline → no optimistic flip, no RPC, returns offline", async () => {
    mockGetIsOnline.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.acceptOrder("db-1");

    expect(res).toEqual({ ok: false, reason: "offline" });
    expect(mockAccept).not.toHaveBeenCalled();
    expect(patchCalls).toHaveLength(0);
    expect(mockOrder.order_status).toBe("pending");
  });

  it("accept success → optimistic sent_to_kitchen + sync_version bump, ok", async () => {
    mockAccept.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.acceptOrder("db-1");

    expect(res.ok).toBe(true);
    expect(patchCalls[0].patch).toEqual({
      order_status: "sent_to_kitchen",
      sync_version: 6,
    });
    expect(mockOrder.order_status).toBe("sent_to_kitchen");
  });

  it("network error → optimistic then rollback to original status + version", async () => {
    mockAccept.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.acceptOrder("db-1");

    expect(res).toEqual({ ok: false, reason: "network" });
    // first patch optimistic, last patch rolls back
    expect(patchCalls[0].patch.order_status).toBe("sent_to_kitchen");
    const last = patchCalls[patchCalls.length - 1].patch;
    expect(last).toEqual({ order_status: "pending", sync_version: 5 });
    expect(mockOrder.order_status).toBe("pending");
  });

  it("benign: accept on already sent_to_kitchen → success (no rollback to pending)", async () => {
    mockAccept.mockResolvedValue({
      data: {
        success: false,
        error: "Order is not in pending status (current: sent_to_kitchen)",
      },
      error: null,
    });
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.acceptOrder("db-1");

    expect(res.ok).toBe(true);
    expect(mockOrder.order_status).toBe("sent_to_kitchen");
    // never rolled back to pending
    expect(patchCalls.some((c) => c.patch.order_status === "pending")).toBe(
      false,
    );
  });

  it("real failure: accept on already declined → not ok, reconciles to declined", async () => {
    mockAccept.mockResolvedValue({
      data: {
        success: false,
        error: "Order is not in pending status (current: declined)",
      },
      error: null,
    });
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.acceptOrder("db-1");

    expect(res).toEqual({
      ok: false,
      reason: "already_declined_or_cancelled",
    });
    expect(mockOrder.order_status).toBe("declined");
  });

  it("in-flight lock blocks a concurrent second accept", async () => {
    let resolveFirst: (v: any) => void = () => {};
    mockAccept.mockReturnValue(
      new Promise((r) => {
        resolveFirst = r;
      }),
    );
    const { result } = renderHook(() => useOnlineOrderActions());

    const p1 = result.current.acceptOrder("db-1");
    const second = await result.current.acceptOrder("db-1");
    expect(second).toEqual({ ok: false, reason: "in_flight" });

    resolveFirst({ data: { success: true }, error: null });
    const first = await p1;
    expect(first.ok).toBe(true);
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it("decline success → optimistic declined, ok", async () => {
    mockDecline.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => useOnlineOrderActions());

    const res = await result.current.declineOrder("db-1", "out of stock");

    expect(res.ok).toBe(true);
    expect(mockDecline).toHaveBeenCalledWith({}, "db-1", "out of stock");
    expect(mockOrder.order_status).toBe("declined");
  });
});
