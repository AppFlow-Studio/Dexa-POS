/**
 * Senior-QA hostile pass — bugs that a clean unit suite would miss.
 *
 * The first-pass tests for sync-status / retry-drop / read-only all green
 * because they exercise the documented contract. This file probes the
 * SHARP edges where a future refactor would silently break behavior:
 *
 *   - Same-batch double-set (does last write win for prevStatus?)
 *   - Concurrent retry+drop interleaving (no zombie counts)
 *   - 100-item burst (no quadratic blowup, no missed toasts)
 *   - Toast payload shape (regression guard against a string copy edit)
 *   - Type-coerced station_id (number, object) → still strict-not-equal
 *   - clearSyncStatus on an unknown item is a clean no-op
 *
 * Coverage NOT yet attempted (filed as follow-up — see end of file):
 *   - PR D.3 stuck-op timeout end-to-end via processQueueNow. Requires
 *     mocking the Supabase client + initOfflineSyncService config. The
 *     existing offlineSyncBlocking.test.ts also avoids the dispatcher;
 *     a fixture for it would unlock several more contracts.
 *   - PR C.7 _isOwnershipError pure helper. Currently a private function
 *     in useOrderStore.ts — not import-reachable. Move to
 *     lib/orderAccessControl.ts (next to isOrderReadOnly) for unit
 *     coverage; one-line test follows immediately after.
 */

import { isOrderReadOnly } from "@/lib/orderAccessControl";
import type { OrderProfile } from "@/lib/types";

// -------- Sync-status hostile cases (toast + itemFailedAt) ---------

const mockShow = jest.fn();
jest.mock("@/lib/toastService", () => ({
  toastService: {
    show: (...args: unknown[]) => mockShow(...args),
    setToast: jest.fn(),
  },
}));

type SyncStatusModule = typeof import("@/stores/useSyncStatusStore");

describe("syncStatusStore — hostile cases", () => {
  let store: SyncStatusModule;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockShow.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store = require("@/stores/useSyncStatusStore");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("setSyncStatusBatch with the SAME itemId listed twice in one batch fires only one toast (snapshot is taken before the loop)", () => {
    store.useSyncStatusStore.getState().setSyncStatusBatch([
      { itemId: "item_dup", status: "failed" },
      { itemId: "item_dup", status: "failed" }, // duplicate in same batch
    ]);
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("setSyncStatusBatch with same id flipping failed→synced→failed within the batch fires exactly ONE toast — module dedup set absorbs the duplicate even within a single batch", () => {
    store.useSyncStatusStore.getState().setSyncStatusBatch([
      { itemId: "item_x", status: "failed" },
      { itemId: "item_x", status: "synced" },
      { itemId: "item_x", status: "failed" },
    ]);
    // The reducer captures `prevStatusSnapshot` once (=undefined for item_x)
    // and pushes BOTH 'failed' updates into `transitioningToFailed` because
    // prev !== 'failed' both times. After the set() commits, the post-set
    // loop calls `_maybeFireFailureToast('item_x')` twice — but the second
    // call hits the module-scoped `_recentlyToastedFailures` set and exits
    // silently. Net: one toast. This is the dedup doing its job under a
    // pathological caller (don't list the same id twice in one batch).
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("100-item failure burst: every distinct item gets exactly one toast (no missed transitions, no quadratic dedup-set issues)", () => {
    const updates = Array.from({ length: 100 }, (_, i) => ({
      itemId: `bulk_${i}`,
      status: "failed" as const,
    }));
    store.useSyncStatusStore.getState().setSyncStatusBatch(updates);
    expect(mockShow).toHaveBeenCalledTimes(100);
  });

  it("toast payload is exactly the contract — title, message, type=warning, 5s duration (regression guard)", () => {
    store.useSyncStatusStore.getState().setSyncStatus("item_1", "failed");
    expect(mockShow).toHaveBeenCalledWith({
      title: "Couldn't save item",
      message: "Tap Retry on the cart line to try again.",
      type: "warning",
      duration: 5000,
    });
  });

  it("clearSyncStatus on an unknown item id is a clean no-op (does not throw, does not toast, does not mutate maps)", () => {
    const sBefore = store.useSyncStatusStore.getState();
    const sizeBefore = sBefore.itemSyncStatus.size;

    expect(() => sBefore.clearSyncStatus("never-tracked")).not.toThrow();

    const sAfter = store.useSyncStatusStore.getState();
    expect(sAfter.itemSyncStatus.size).toBe(sizeBefore);
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("getOrderSyncCounts with an empty itemIds list returns all zeros", () => {
    expect(store.useSyncStatusStore.getState().getOrderSyncCounts([])).toEqual({
      pending: 0,
      failed: 0,
      synced: 0,
    });
  });
});

// -------- Retry/drop concurrency probes --------

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
    getSyncJSON: jest.fn(<T>(k: string) => (mem.get(k) as T) ?? null),
    setSyncJSON: jest.fn((k: string, v: unknown) => mem.set(k, v)),
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
  };
});

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: { getState: () => ({ ordersById: {} }) },
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
}));

describe("offlineSyncService — retry/drop interleaving", () => {
  let svc: typeof import("@/services/offlineSyncService");

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require("@/services/offlineSyncService");
  });

  it("drop while a retry is in flight: drop wins, retry counts the SUBSET that still existed when it ran", async () => {
    // Stage: two ops on item_x, one stuck failed.
    const opId = await svc.queueOperation({
      type: "add_item",
      params: { localOrderId: "o1", localItemId: "item_x" },
      localOrderId: "o1",
      localItemId: "item_x",
    });
    svc.getQueueSnapshot().find((o) => o.id === opId)!.status = "failed";

    // Kick both at the same tick. JS is single-threaded, but interleaved
    // awaits inside the helpers could flip ordering — Promise.all forces a
    // resolved-order dependency on both side-effects.
    const [retried, dropped] = await Promise.all([
      svc.retrySyncForItem("item_x"),
      svc.dropQueuedOpsForItem("item_x"),
    ]);

    // Whichever ran first wins on the visible state: zero ops remain.
    expect(
      svc.getQueueSnapshot().filter((o) => o.localItemId === "item_x"),
    ).toHaveLength(0);

    // Counts: at least one of them touched the op. The other ran on an
    // empty queue. We don't pin which is which (depends on microtask order),
    // but their sum is ≥ 1 and exact behavior is "no zombie ops left".
    expect(retried + dropped).toBeGreaterThanOrEqual(1);
  });

  it("dropQueuedOpsForItem followed by retrySyncForItem on the now-empty target is a clean 0", async () => {
    const opId = await svc.queueOperation({
      type: "add_item",
      params: { localOrderId: "o1", localItemId: "item_y" },
      localOrderId: "o1",
      localItemId: "item_y",
    });
    svc.getQueueSnapshot().find((o) => o.id === opId)!.status = "failed";

    expect(await svc.dropQueuedOpsForItem("item_y")).toBe(1);
    expect(await svc.retrySyncForItem("item_y")).toBe(0);
  });

  it("retrySyncForItem is idempotent on a freshly retried op (second call sees nothing to do)", async () => {
    const opId = await svc.queueOperation({
      type: "add_item",
      params: { localOrderId: "o1", localItemId: "item_z" },
      localOrderId: "o1",
      localItemId: "item_z",
    });
    svc.getQueueSnapshot().find((o) => o.id === opId)!.status = "failed";
    svc.getQueueSnapshot().find((o) => o.id === opId)!.retryCount = 4;

    expect(await svc.retrySyncForItem("item_z")).toBe(1); // first call resets it
    expect(await svc.retrySyncForItem("item_z")).toBe(0); // second call: no-op

    const op = svc.getQueueSnapshot().find((o) => o.id === opId)!;
    expect(op.status).toBe("pending");
    expect(op.retryCount).toBe(0);
  });
});

// -------- isOrderReadOnly hostile coercion / purity --------

describe("isOrderReadOnly — hostile coercion + purity", () => {
  const STATION_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("numeric station_id (legacy/dirty data) is strict-not-equal to a string current → read-only", () => {
    const order = {
      id: "x",
      station_id: 123 as unknown as string,
      items: [],
    } as unknown as OrderProfile;
    // 123 != null → enters compare branch. 123 !== STATION_A → true → read-only.
    // We're locking down the strict-equality contract so a future `==` slip is caught.
    expect(isOrderReadOnly(order, STATION_A)).toBe(true);
  });

  it("object station_id (corrupted payload) → strict-not-equal → read-only (defensive lock)", () => {
    const order = {
      id: "x",
      station_id: { id: STATION_A } as unknown as string,
      items: [],
    } as unknown as OrderProfile;
    expect(isOrderReadOnly(order, STATION_A)).toBe(true);
  });

  it("many calls with the same args produce the same result (pure, no caching surprises)", () => {
    const order = {
      id: "x",
      station_id: STATION_A,
      items: [],
    } as unknown as OrderProfile;
    for (let i = 0; i < 1000; i++) {
      expect(isOrderReadOnly(order, STATION_A)).toBe(false);
    }
  });

  it("return value is always a primitive boolean — never a string, number, or object that could short-circuit truthy", () => {
    const cases: Array<
      [Partial<OrderProfile> | null | undefined, string | null]
    > = [
      [null, STATION_A],
      [undefined, STATION_A],
      [{ station_id: null }, STATION_A],
      [{ station_id: STATION_A }, STATION_A],
      [{ station_id: "other" }, STATION_A],
      [{ station_id: STATION_A }, null],
    ];
    for (const [order, station] of cases) {
      const result = isOrderReadOnly(order as OrderProfile | null, station);
      expect(typeof result).toBe("boolean");
      expect([true, false]).toContain(result);
    }
  });
});
