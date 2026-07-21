/**
 * Long-session soak test — proves the per-order satellite state that the memory
 * audit (Group A) found leaking stays BOUNDED under shift-scale churn, i.e. the
 * collections do NOT grow with cumulative order count. This is the "works as
 * fast on first launch and 5h later" invariant in CI form: a restaurant shift
 * opens/closes hundreds of orders + tables; the stores must return to baseline.
 *
 * Runtime-loadable small stores only (coursing/seating/sync-status). The heavy
 * useOrderStore is covered by orderStateRelease.test.ts (fan-out wiring) — here
 * we hammer the cleanup APIs that fan-out calls, at scale.
 */
jest.mock("uuid", () => {
  let n = 0;
  return { v4: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
});

const CYCLES = 500; // ~a busy shift's worth of order churn
const BURST = 10; // concurrent open orders at any moment

describe("long-session soak — satellite stores stay bounded under churn", () => {
  it("useCoursingStore.byOrderId returns to baseline after each open/clear burst", () => {
    const {
      useCoursingStore,
    } = require("@/stores/useCoursingStore") as typeof import("@/stores/useCoursingStore");
    useCoursingStore.setState({ byOrderId: {} });

    let maxSize = 0;
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const ids: string[] = [];
      for (let i = 0; i < BURST; i++) {
        const id = `course-${cycle}-${i}`;
        ids.push(id);
        useCoursingStore.setState((s) => ({
          byOrderId: { ...s.byOrderId, [id]: {} as any },
        }));
      }
      maxSize = Math.max(
        maxSize,
        Object.keys(useCoursingStore.getState().byOrderId).length,
      );
      for (const id of ids) useCoursingStore.getState().clearOrder(id);
      // baseline restored every cycle — independent of how many came before
      expect(Object.keys(useCoursingStore.getState().byOrderId)).toHaveLength(0);
    }
    // peak is bounded by the working set (BURST), NOT cumulative (CYCLES*BURST)
    expect(maxSize).toBeLessThanOrEqual(BURST);
  });

  it("useSeatingStore.byOrderId returns to baseline after each open/clear burst", () => {
    const {
      useSeatingStore,
    } = require("@/stores/useSeatingStore") as typeof import("@/stores/useSeatingStore");
    useSeatingStore.setState({ byOrderId: {} });

    let maxSize = 0;
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const ids: string[] = [];
      for (let i = 0; i < BURST; i++) {
        const id = `seat-${cycle}-${i}`;
        ids.push(id);
        useSeatingStore.setState((s) => ({
          byOrderId: { ...s.byOrderId, [id]: {} as any },
        }));
      }
      maxSize = Math.max(
        maxSize,
        Object.keys(useSeatingStore.getState().byOrderId).length,
      );
      for (const id of ids) useSeatingStore.getState().clearOrder(id);
      expect(Object.keys(useSeatingStore.getState().byOrderId)).toHaveLength(0);
    }
    expect(maxSize).toBeLessThanOrEqual(BURST);
  });

  it("useSyncStatusStore item maps stay bounded across hundreds of orders", () => {
    const {
      useSyncStatusStore,
    } = require("@/stores/useSyncStatusStore") as typeof import("@/stores/useSyncStatusStore");
    useSyncStatusStore.setState({
      itemSyncStatus: new Map(),
      itemSyncErrors: new Map(),
      itemFailedAt: new Map(),
    } as any);

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const itemIds: string[] = [];
      for (let i = 0; i < BURST; i++) {
        const itemId = `item-${cycle}-${i}`;
        itemIds.push(itemId);
        useSyncStatusStore.getState().setSyncStatus(itemId, "syncing");
        useSyncStatusStore.getState().setSyncStatus(itemId, "failed", "boom");
      }
      useSyncStatusStore.getState().clearAllForOrder(itemIds);
      expect(useSyncStatusStore.getState().itemSyncStatus.size).toBe(0);
      expect(useSyncStatusStore.getState().itemFailedAt.size).toBe(0);
    }
    // After 500 cycles × 10 items = 5000 distinct items touched, the maps are
    // empty — no per-item leak (the audit's useSyncStatusStore finding).
    expect(useSyncStatusStore.getState().itemSyncStatus.size).toBe(0);
    expect(useSyncStatusStore.getState().itemSyncErrors.size).toBe(0);
    expect(useSyncStatusStore.getState().itemFailedAt.size).toBe(0);
  });
});
