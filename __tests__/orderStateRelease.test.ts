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

describe("clearInactiveOrders — voided orders are not pinned (source)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "stores", "useOrderStore.ts"),
    "utf8",
  );

  it("defines a terminal-dead status set for void/voided/cancelled", () => {
    expect(source).toContain("TERMINAL_DEAD_STATUSES");
    expect(source).toMatch(
      /TERMINAL_DEAD_STATUSES\s*=\s*new Set\(\[\s*"void",\s*"voided",\s*"cancelled",?\s*\]\)/,
    );
  });

  it("exempts terminal-dead orders from the unsynced-item / pending-payment keep-guards", () => {
    // The keep-guards must be gated behind `if (!isDeadTerminal)` so a voided
    // order whose items never synced can't pin itself in ordersById.
    expect(source).toContain(
      "const isDeadTerminal = TERMINAL_DEAD_STATUSES.has(status)",
    );
    expect(source).toContain("if (!isDeadTerminal) {");
  });

  it("gives voided/cancelled orders a shorter max-age than completed orders", () => {
    expect(source).toContain("VOIDED_ORDER_MAX_AGE_MS");
    // maxAge picks the voided window for dead-terminal orders, else the
    // completed window (whitespace-insensitive to survive reformatting).
    expect(source).toMatch(
      /const maxAge = isDeadTerminal\s*\?\s*VOIDED_ORDER_MAX_AGE_MS\s*:\s*COMPLETED_ORDER_MAX_AGE_MS;/,
    );
  });
});
