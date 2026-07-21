/**
 * W1-1: queueOperation → persistSubsetCheck wiring (dev durability assertion).
 *
 * The checker itself lives in useOrderStore (registered at module init to
 * avoid the circular import); this suite locks in the offlineSyncService
 * side of the contract: order-scoped ops invoke the registered checker
 * synchronously with (localOrderId, opType); session/coursing/drawer ops and
 * ops without a localOrderId do not.
 */

jest.mock("uuid", () => ({
  v4: () => `uuid-${Math.random().toString(36).slice(2, 10)}`,
  v5: (name: string) => `v5-${name}`,
}));

jest.mock("@/lib/storage", () => {
  const mem = new Map<string, unknown>();
  return {
    storage: {
      getString: jest.fn((k: string) => mem.get(k) as string | undefined),
      set: jest.fn((k: string, v: unknown) => mem.set(k, v)),
      delete: jest.fn((k: string) => mem.delete(k)),
      contains: jest.fn((k: string) => mem.has(k)),
      getBoolean: jest.fn((k: string) => mem.get(k) as boolean | undefined),
      getNumber: jest.fn((k: string) => mem.get(k) as number | undefined),
    },
    getSyncJSON: jest.fn(() => null),
    setSyncJSON: jest.fn(),
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
  };
});

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: {
    getState: () => ({ ordersById: {} }),
  },
}));

jest.mock("@/lib/network/connectionQuality", () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn(),
  },
}));

jest.mock("@/lib/network/featureFlags", () => ({
  isBlockedAddItemEnabled: () => true,
  setBlockedAddItemEnabled: jest.fn(),
  isPersistMemoEnabled: () => true,
  setPersistMemoEnabled: jest.fn(),
}));

describe("queueOperation — persist subset check wiring", () => {
  let svc: typeof import("@/services/offlineSyncService");
  let checker: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    svc = require("@/services/offlineSyncService");
    checker = jest.fn();
    svc.registerPersistSubsetCheck(checker);
  });

  it("invokes the checker synchronously for order-scoped ops", async () => {
    await svc.queueOperation({
      type: "add_item",
      params: { name: "Burger" },
      localOrderId: "order_123",
      localItemId: "item_1",
    } as any);
    expect(checker).toHaveBeenCalledTimes(1);
    expect(checker).toHaveBeenCalledWith("order_123", "add_item");
  });

  it("covers payment and check-status ops", async () => {
    await svc.queueOperation({
      type: "process_payment",
      params: {},
      localOrderId: "order_123",
    } as any);
    await svc.queueOperation({
      type: "close_check",
      params: {},
      localOrderId: "order_123",
    } as any);
    expect(checker).toHaveBeenCalledTimes(2);
    expect(checker).toHaveBeenNthCalledWith(1, "order_123", "process_payment");
    expect(checker).toHaveBeenNthCalledWith(2, "order_123", "close_check");
  });

  it("does NOT invoke the checker for session-scoped ops", async () => {
    await svc.queueOperation({
      type: "seat_guests",
      params: {},
      localOrderId: "session_1",
    } as any);
    await svc.queueOperation({
      type: "record_cash_drawer_operation",
      params: {},
      localOrderId: "drawer_1",
    } as any);
    expect(checker).not.toHaveBeenCalled();
  });

  it("does NOT invoke the checker without a localOrderId", async () => {
    await svc.queueOperation({
      type: "add_item",
      params: {},
      localOrderId: "",
    } as any);
    expect(checker).not.toHaveBeenCalled();
  });

  it("no checker registered → queueOperation still works", async () => {
    jest.resetModules();
    const fresh: typeof import("@/services/offlineSyncService") = require("@/services/offlineSyncService");
    const id = await fresh.queueOperation({
      type: "add_item",
      params: {},
      localOrderId: "order_9",
      localItemId: "item_9",
    } as any);
    expect(typeof id).toBe("string");
  });
});
