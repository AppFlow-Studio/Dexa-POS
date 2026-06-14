/**
 * Group A (memory audit): when an order leaves ordersById, its satellite state
 * must be released. useOrderStore is too heavy to load at runtime (mocked/
 * source-tested elsewhere), so this verifies two things:
 *  1. (runtime) the satellite store APIs releaseOrderState calls actually clear.
 *  2. (source) releaseOrderState is defined + wired into all three removal paths.
 */
jest.mock("uuid", () => {
  let n = 0;
  return { v4: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
});

import fs from "fs";
import path from "path";

describe("Group A — satellite store clear APIs (runtime)", () => {
  it("useCoursingStore.clearOrder removes the order entry", () => {
    const {
      useCoursingStore,
    } = require("@/stores/useCoursingStore") as typeof import("@/stores/useCoursingStore");
    useCoursingStore.setState({ byOrderId: { o1: {} as any, o2: {} as any } });
    useCoursingStore.getState().clearOrder("o1");
    expect(useCoursingStore.getState().byOrderId.o1).toBeUndefined();
    expect(useCoursingStore.getState().byOrderId.o2).toBeDefined();
  });

  it("useSeatingStore.clearOrder removes the order entry", () => {
    const {
      useSeatingStore,
    } = require("@/stores/useSeatingStore") as typeof import("@/stores/useSeatingStore");
    useSeatingStore.setState({ byOrderId: { o1: {} as any, o2: {} as any } });
    useSeatingStore.getState().clearOrder("o1");
    expect(useSeatingStore.getState().byOrderId.o1).toBeUndefined();
    expect(useSeatingStore.getState().byOrderId.o2).toBeDefined();
  });

  it("useSyncStatusStore.clearAllForOrder removes the items' sync entries", () => {
    const {
      useSyncStatusStore,
    } = require("@/stores/useSyncStatusStore") as typeof import("@/stores/useSyncStatusStore");
    useSyncStatusStore.getState().setSyncStatus("item-a", "synced");
    useSyncStatusStore.getState().setSyncStatus("item-b", "synced");
    expect(useSyncStatusStore.getState().itemSyncStatus.get("item-a")).toBe(
      "synced",
    );
    useSyncStatusStore.getState().clearAllForOrder(["item-a"]);
    expect(useSyncStatusStore.getState().itemSyncStatus.get("item-a")).toBeUndefined();
    expect(useSyncStatusStore.getState().itemSyncStatus.get("item-b")).toBe(
      "synced",
    );
  });
});

describe("Group A — releaseOrderState is defined + wired (source)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "stores", "useOrderStore.ts"),
    "utf8",
  );

  it("defines releaseOrderState that clears the item map + satellite stores", () => {
    expect(source).toContain("function releaseOrderState(");
    expect(source).toContain("quantitySyncGenerations.delete(item.id)");
    expect(source).toContain("useCoursingStore.getState()");
    expect(source).toContain("useSeatingStore.getState()");
    expect(source).toContain("clearAllForOrder(itemIds)");
  });

  it("extends _cleanupOrderModuleState to clear orderRefreshTimeouts + pendingItemsBlockStart", () => {
    expect(source).toContain("delete orderRefreshTimeouts[id]");
    expect(source).toContain("delete pendingItemsBlockStart[id]");
  });

  it("wires releaseOrderState into all three removal paths", () => {
    expect(source).toContain("releaseOrderState(existing, dbOrderId)");
    // both clearInactiveOrders + cleanupAbandonedDrafts iterate ordersToRelease
    const wiredLoops = source.match(/releaseOrderState\(order, key\)/g) ?? [];
    expect(wiredLoops.length).toBeGreaterThanOrEqual(2);
    // pendingBackendUpdates pruned on removal
    expect(source).toContain("delete state.pendingBackendUpdates[dbOrderId]");
    expect(source).toContain("delete draft.pendingBackendUpdates[id]");
  });
});
