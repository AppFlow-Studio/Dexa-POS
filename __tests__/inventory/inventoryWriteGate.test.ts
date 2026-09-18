/**
 * Phase 5 — the inventory write gate.
 *
 * Inventory reads come off the local mirror and work offline. Inventory WRITES
 * are refused until the outbox lands in Track B, because the rows' identities
 * are minted server-side and stock movements are not idempotent — a queued
 * "received 12 cases" replayed after a reconnect double-counts, and no receipt
 * exists that anyone would compare it against.
 *
 * Two things are asserted here, and the second is the one worth having:
 *
 *   1. Offline, every mutation is refused.
 *   2. It is refused by THROWING. The purchase-order screens are built around
 *      `await action(); showSuccess()` with a `catch` — so a gate that returned
 *      quietly would produce a green "Payment logged" for a payment that never
 *      happened. That failure mode is invisible in production and trivially
 *      catchable here.
 */
const mockGetRawIsOnline = jest.fn(() => true);

jest.mock("@/services/offlineSyncService", () => ({
  __esModule: true,
  getRawIsOnline: () => mockGetRawIsOnline(),
  getIsOnline: () => mockGetRawIsOnline(),
  subscribeOnlineStatus: () => () => {},
  queueOperation: jest.fn(),
}));

// The mock above must be registered before the store module is evaluated.
/* eslint-disable import/first */
import {
  InventoryOfflineError,
  useInventoryStore,
} from "@/stores/useInventoryStore";

/** Every action that reaches the server, with arguments it would accept. */
const MUTATIONS: [string, () => Promise<unknown>][] = [
  [
    "addVendor",
    () =>
      useInventoryStore
        .getState()
        .addVendor(
          {
            name: "V",
            contactName: "",
            email: null,
            phone: null,
            address: null,
            website: null,
          },
          "merchant-1",
          "loc-1",
        ),
  ],
  [
    "updateVendor",
    () =>
      useInventoryStore.getState().updateVendor("v-1", {
        name: "V",
        contactName: "",
        email: null,
        phone: null,
        address: null,
        website: null,
      }),
  ],
  ["deleteVendor", () => useInventoryStore.getState().deleteVendor("v-1")],
  [
    "addInventoryItem",
    () =>
      useInventoryStore.getState().addInventoryItem(
        {
          name: "Item",
          category: "",
          stockQuantity: 1,
          unit: "kg",
          unitType: "weight",
          reorderThreshold: 0,
          cost: 1,
          vendorId: null,
          locationId: "loc-1",
        },
        "loc-1",
      ),
  ],
  [
    "updateInventoryItem",
    () =>
      useInventoryStore
        .getState()
        .updateInventoryItem("i-1", { stockQuantity: 2 }, "loc-1"),
  ],
  [
    "deleteInventoryItem",
    () => useInventoryStore.getState().deleteInventoryItem("i-1"),
  ],
  [
    "createPurchaseOrder",
    () =>
      useInventoryStore
        .getState()
        .createPurchaseOrder({ vendorId: "v-1", status: "Draft", items: [] }),
  ],
  [
    "updatePurchaseOrder",
    () => useInventoryStore.getState().updatePurchaseOrder("po-1", {}),
  ],
  [
    "deletePurchaseOrder",
    () => useInventoryStore.getState().deletePurchaseOrder("po-1"),
  ],
  [
    "submitPurchaseOrder",
    () => useInventoryStore.getState().submitPurchaseOrder("po-1"),
  ],
  [
    "logDeliveryForPO",
    () =>
      useInventoryStore
        .getState()
        .logDeliveryForPO("po-1", { receivedItems: [] }),
  ],
  [
    "logPaymentForPO",
    () =>
      useInventoryStore
        .getState()
        .logPaymentForPO("po-1", { method: "Cash", amount: 10 }),
  ],
  [
    "cancelPurchaseOrder",
    () => useInventoryStore.getState().cancelPurchaseOrder("po-1"),
  ],
  [
    "addExternalExpense",
    () =>
      useInventoryStore.getState().addExternalExpense({
        totalAmount: 10,
        purchasedByEmployeeId: "e-1",
        purchasedByEmployeeName: "E",
        purchasedAt: new Date().toISOString(),
        items: [],
      }),
  ],
  [
    "removeExternalExpense",
    () => useInventoryStore.getState().removeExternalExpense("exp-1"),
  ],
];

beforeEach(() => {
  mockGetRawIsOnline.mockReturnValue(true);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("offline", () => {
  beforeEach(() => {
    mockGetRawIsOnline.mockReturnValue(false);
  });

  it.each(MUTATIONS)("refuses %s", async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(InventoryOfflineError);
  });

  it("refuses BEFORE touching Supabase, so nothing partial can land", async () => {
    const client = { from: jest.fn(), rpc: jest.fn() };
    useInventoryStore.getState().setSupabaseClient(client as never);

    await expect(
      useInventoryStore.getState().deleteInventoryItem("i-1"),
    ).rejects.toBeInstanceOf(InventoryOfflineError);

    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("names the action it refused, so a log says which button was pressed", async () => {
    await expect(
      useInventoryStore.getState().logPaymentForPO("po-1", {
        method: "Cash",
        amount: 10,
      }),
    ).rejects.toMatchObject({ action: "logPaymentForPO" });
  });

  it("carries an operator-facing message, not a stack trace", async () => {
    await expect(
      useInventoryStore.getState().deleteVendor("v-1"),
    ).rejects.toThrow(/offline/i);
  });
});

describe("online", () => {
  it("lets the gate through — the refusal is the offline case only", async () => {
    // No Supabase client registered, so each action falls straight through its
    // own `if (!supabase) return`. Reaching that is the proof the gate did not
    // fire; the assertion is simply that nothing threw.
    useInventoryStore.setState({ supabase: null });

    await expect(
      useInventoryStore.getState().deleteVendor("v-1"),
    ).resolves.toBeUndefined();
    await expect(
      useInventoryStore.getState().submitPurchaseOrder("po-1"),
    ).resolves.toBeUndefined();
  });
});

describe("local-only actions stay available offline", () => {
  /**
   * `decrementStockFromSale` is the optimistic decrement that follows a SALE,
   * not an inventory-management write — the server-side deduction rides the
   * order. Gating it would break stock display for orders taken offline, which
   * is the one thing the POS must keep doing.
   */
  it("does not gate the sale-driven stock decrement", () => {
    mockGetRawIsOnline.mockReturnValue(false);
    expect(() =>
      useInventoryStore.getState().decrementStockFromSale([]),
    ).not.toThrow();
  });
});
