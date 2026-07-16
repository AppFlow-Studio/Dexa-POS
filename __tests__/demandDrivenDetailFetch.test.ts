/**
 * W1-3 — Structural guard for the demand-driven detail-fetch wiring in
 * useOrderStore.ts (same pattern as broadcastMergeStationId.test.ts: the
 * order store is too heavy to load in Jest, so the behavioral contract is
 * unit-tested in orderDetailStaleness.test.ts and the STORE-SIDE wiring is
 * pinned here against source drift).
 *
 * The contract being pinned:
 * 1. All THREE broadcast change-signal triggers (status-rank advance,
 *    item_count mismatch, kitchen sync_version advance) route through the
 *    working-scope gate (`refreshOrMarkStale`) instead of calling
 *    `_debouncedOrderRefresh` directly.
 * 2. The two correctness-recovery refreshes (FIFO-bleed heal, pending-block
 *    timeout) stay UNGATED.
 * 3. The stale flag clears only on sync SUCCESS.
 * 4. Demand-side hydration exists at every working-scope entry: open
 *    (addToWorkingSet, before the duplicate early-return) and claim
 *    (applyLocalSuccess), and bypasses the 5s cooldown via force:true.
 * 5. Module-state cleanup drops the marker when an order leaves ordersById.
 * 6. The online-orders detail screen registers as a visible-detail consumer.
 */

import { readFileSync } from "fs";
import { join } from "path";

const orderStoreSource = readFileSync(
  join(__dirname, "..", "stores", "useOrderStore.ts"),
  "utf-8",
);
const onlineOrderScreenSource = readFileSync(
  join(__dirname, "..", "app", "(main)", "online-orders", "[orderId].tsx"),
  "utf-8",
);

describe("W1-3 — broadcast change-signal gate", () => {
  it("defines the gate off isInLocalWorkingScope with both key spaces", () => {
    expect(orderStoreSource).toMatch(
      /const eagerDetailAllowed = isInLocalWorkingScope\(\s*get\(\),\s*dbOrderId,\s*localOrderKey,?\s*\)/,
    );
    expect(orderStoreSource).toMatch(
      /const refreshOrMarkStale = \(\) => \{\s*if \(eagerDetailAllowed\) \{\s*get\(\)\._debouncedOrderRefresh\(dbOrderId\);\s*\} else \{\s*markOrderDetailStale\(dbOrderId\);/,
    );
  });

  it("routes all three change-signal triggers through the gate (none call _debouncedOrderRefresh directly)", () => {
    // Trigger 1: status-rank advance
    expect(orderStoreSource).toMatch(
      /if \(backendRank >= localRank && !isInMutationWindow\) \{\s*refreshOrMarkStale\(\);/,
    );
    // Trigger 2: item_count mismatch
    expect(orderStoreSource).toMatch(
      /localOrder\.items\.filter\(\(i\) => !i\.is_voided\)\.length\s*\) \{\s*refreshOrMarkStale\(\);/,
    );
    // Trigger 3: kitchen sync_version advance
    expect(orderStoreSource).toMatch(
      /if \(isKitchenSyncAdvance && !isInMutationWindow\) \{\s*refreshOrMarkStale\(\);/,
    );
  });

  it("keeps exactly the recovery paths + the gate itself as _debouncedOrderRefresh callers", () => {
    // If a future edit adds a NEW ungated eager call site (the disease this
    // ticket cures), this count flags it for review.
    const calls = orderStoreSource.match(
      /_debouncedOrderRefresh\(/g,
    )!.length;
    // 1 interface decl-adjacent usage? No — count actual call sites:
    //   FIFO-bleed heal, pending-block timeout, refreshOrMarkStale body,
    //   + the createDebouncedOrderRefresh factory/type/action plumbing.
    // Pin the exact source occurrences (call sites + declaration + wiring).
    const occurrences = orderStoreSource.match(/_debouncedOrderRefresh/g)!;
    expect(calls).toBe(3); // FIFO-bleed + block-timeout + gate body
    expect(occurrences.length).toBeGreaterThanOrEqual(calls);
  });
});

describe("W1-3 — staleness lifecycle", () => {
  it("clears the flag only on sync success (after lastOrderDetailSyncAt is stamped)", () => {
    expect(orderStoreSource).toMatch(
      /await detailSyncPromise;\s*lastOrderDetailSyncAt\.set\(detailSyncKey, Date\.now\(\)\);[\s\S]{0,400}?clearOrderDetailStale\(detailSyncKey\);/,
    );
  });

  it("hydrates on demand with force:true (cooldown must not eat the open-path fetch)", () => {
    expect(orderStoreSource).toMatch(
      /hydrateStaleOrderDetail: \(dbOrderId: string\) => \{\s*if \(!isOrderDetailStale\(dbOrderId\)\) return;\s*void get\(\)\.syncOrderFromBackendComplete\(dbOrderId, \{\s*force: true,?\s*\}\);/,
    );
  });

  it("hydrates on open — addToWorkingSet checks staleness BEFORE the duplicate early-return", () => {
    expect(orderStoreSource).toMatch(
      /addToWorkingSet: \(dbOrderId: string\) => \{[\s\S]{0,400}?get\(\)\.hydrateStaleOrderDetail\(dbOrderId\);\s*if \(get\(\)\._workingSetLookup\[dbOrderId\]\) return;/,
    );
  });

  it("hydrates on claim — applyLocalSuccess ends with the stale hydration", () => {
    expect(orderStoreSource).toMatch(
      /patchPreviousOrder\(dbOrderId, \{[\s\S]{0,200}?\}\);[\s\S]{0,300}?get\(\)\.hydrateStaleOrderDetail\(dbOrderId\);\s*\};/,
    );
  });

  it("drops the marker in _cleanupOrderModuleState when an order leaves ordersById", () => {
    expect(orderStoreSource).toMatch(
      /delete lastLocalMutationAt\[id\];[\s\S]{0,200}?clearOrderDetailStale\(id\);/,
    );
  });
});

describe("W1-3 — visible-detail consumer registration", () => {
  it("online-orders detail screen registers (and cleans up via the returned unregister)", () => {
    expect(onlineOrderScreenSource).toMatch(
      /import \{ registerVisibleOrderDetail \} from "@\/stores\/orderDetailStaleness"/,
    );
    expect(onlineOrderScreenSource).toMatch(
      /return registerVisibleOrderDetail\(visibleDbOrderId\);/,
    );
  });
});
