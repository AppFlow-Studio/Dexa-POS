/**
 * teardownTableOrderPrefetch must clear the module-level in-flight maps so a
 * stale, still-pending prefetch promise can't outlive teardown and later apply
 * old order data to a freshly-seated table that reused the same id.
 *
 * Observable proof: while a sync is in flight, a second ensureOrderPrefetched
 * for the same id is DEDUPED (sync called once). After teardown clears the map,
 * a fresh call starts a NEW sync (sync called twice) — proving the map cleared.
 */
// uuid ships ESM and isn't in transformIgnorePatterns — stub it (pulled in
// transitively via useCoursingStore -> offlineSyncService).
jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

jest.mock("@/stores/useOrderStore", () => ({
  useOrderStore: { getState: jest.fn() },
}));

import {
  ensureOrderPrefetched,
  teardownTableOrderPrefetch,
} from "@/services/tableOrderPrefetch";
import { useOrderStore } from "@/stores/useOrderStore";

describe("tableOrderPrefetch teardown clears in-flight state", () => {
  let syncMock: jest.Mock;

  beforeEach(() => {
    // syncOrderFromDatabase never resolves -> the prefetch stays in-flight,
    // so the entry remains in _inFlightPrefetches until teardown clears it.
    syncMock = jest.fn(() => new Promise<string | null>(() => {}));
    (useOrderStore.getState as jest.Mock).mockReturnValue({
      ordersById: {},
      dbOrderIdIndex: {},
      orderIds: [],
      syncOrderFromDatabase: syncMock,
    });
  });

  afterEach(() => {
    teardownTableOrderPrefetch();
  });

  it("dedupes an in-flight prefetch, then teardown lets a new one start fresh", () => {
    ensureOrderPrefetched("o1");
    expect(syncMock).toHaveBeenCalledTimes(1);

    // Same id while in-flight -> deduped (returns the cached promise).
    ensureOrderPrefetched("o1");
    expect(syncMock).toHaveBeenCalledTimes(1);

    // Teardown clears _inFlightPrefetches / _inFlightOrderIds / _recentlyHydrated.
    teardownTableOrderPrefetch();

    // A fresh call now re-issues the sync, proving the map was cleared.
    ensureOrderPrefetched("o1");
    expect(syncMock).toHaveBeenCalledTimes(2);
  });
});
