/**
 * Pending/online order selectors — they key on order_source==='online' +
 * order_status, NOT order_type (QR orders transform to 'takeout'). Confirm the
 * "New" queue is pending-only, the badge count matches, and the board feed
 * excludes pos/declined while keeping completed for the Done column.
 *
 * useOrderStore is mocked as a one-shot selector-runner so we don't drag the
 * store's heavy native dependency chain (tcp-socket, etc.) into the test — the
 * selectors under test only read ordersById / orderIds.
 */
let mockStoreState: any;
jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: (selector: any) => selector(mockStoreState),
}));

// orderSelectors imports several sibling stores at module load (which pull
// native chains). The selectors under test don't use them — stub to no-ops.
jest.mock("@/stores/useSeatingStore", () => ({ useSeatingStore: () => ({}) }));
jest.mock("@/stores/useServiceChargeRulesStore", () => ({
  useServiceChargeRulesStore: () => ({}),
}));
jest.mock("@/stores/useSettingsStore", () => ({ useSettingsStore: () => ({}) }));
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: () => ({}),
}));
jest.mock("@/stores/useTableSessionStore", () => ({
  useTableSessionStore: () => ({}),
}));

import { renderHook } from "@testing-library/react-native";
import {
  useOnlineOrders,
  usePendingOnlineOrderCount,
  usePendingOnlineOrders,
} from "@/stores/selectors/orderSelectors";

function order(over: Record<string, any>) {
  return {
    items: [],
    opened_at: "2026-06-25T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  mockStoreState = {
    ordersById: {
      // QR dine-in transforms to order_type 'takeout' — must still match.
      onPending: order({
        id: "onPending",
        db_order_id: "onPending",
        order_source: "online",
        order_status: "pending",
        order_type: "takeout",
      }),
      onKitchen: order({
        id: "onKitchen",
        db_order_id: "onKitchen",
        order_source: "online",
        order_status: "sent_to_kitchen",
      }),
      onCompleted: order({
        id: "onCompleted",
        db_order_id: "onCompleted",
        order_source: "online",
        order_status: "completed",
      }),
      onDeclined: order({
        id: "onDeclined",
        db_order_id: "onDeclined",
        order_source: "online",
        order_status: "declined",
      }),
      posPending: order({
        id: "posPending",
        db_order_id: "posPending",
        order_source: "pos",
        order_status: "pending",
      }),
    },
    orderIds: [
      "onPending",
      "onKitchen",
      "onCompleted",
      "onDeclined",
      "posPending",
    ],
  };
});

describe("online order selectors", () => {
  it("usePendingOnlineOrders returns only online+pending (incl. QR), excludes pos/sent/declined", () => {
    const { result } = renderHook(() => usePendingOnlineOrders());
    expect(result.current.map((o) => o.id)).toEqual(["onPending"]);
  });

  it("usePendingOnlineOrderCount counts pending online orders only", () => {
    const { result } = renderHook(() => usePendingOnlineOrderCount());
    expect(result.current).toBe(1);
  });

  it("useOnlineOrders feeds the board: keeps pending/kitchen/completed, drops pos + declined", () => {
    const { result } = renderHook(() => useOnlineOrders());
    expect(result.current.map((o) => o.id).sort()).toEqual(
      ["onCompleted", "onKitchen", "onPending"].sort(),
    );
  });
});
