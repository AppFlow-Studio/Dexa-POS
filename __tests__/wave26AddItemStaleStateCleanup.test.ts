/**
 * Wave 2.6 — Structural guard for the stale-sync-state cleanup at the start
 * of `addItemToActiveOrder`'s new-item branch.
 *
 * Background (the bug):
 *   - `components/menu/ModifierScreen.tsx:1182` generates each cart item's
 *     local id via `generateCartItemId(baseItem.id, finalCustomizations)` —
 *     a DETERMINISTIC composite of `menuItemId` and the customizations
 *     object.
 *   - `useSyncStatusStore.itemSyncStatus` and `itemSyncErrors` are keyed by
 *     that local id, as is `offlineSyncService`'s pending + dead-letter
 *     queues (both persisted in MMKV).
 *   - When a previous order's add of <Admin brain, Mango/Syar/Djq> failed
 *     (e.g., from the cross-station ownership flow Wave 2.5 covers), its
 *     dead-letter op + 'failed' status stayed under the composite id.
 *   - Adding the same menu item with the same modifier combo on a fresh
 *     order produces the SAME local id → BillItem reads the stale state
 *     and renders "Add failed — Failed N times — N attempts just now"
 *     before the new sync even starts.
 *
 * The user reported this verbatim with a screenshot of order #S1-0016
 * (Draft) showing the stale failure UI on a freshly-added Admin brain.
 *
 * Fix (Wave 2.6):
 * Inside `addItemToActiveOrder`'s new-item branch, before the cart item is
 * pushed, call `useSyncStatusStore.clearSyncStatus(syncItemId)` and
 * `dropQueuedOpsForItem(syncItemId)`. Both are no-ops when no stale state
 * exists, so the fast path stays cheap; on the cross-order collision, they
 * wipe the carry-over.
 *
 * Why a STRUCTURAL test:
 * The order store is unloadable in jest. The fix is two surgical lines in
 * a 10K-line file. Two-station UAT (re-add Admin brain on a fresh order
 * after the prior failed) is the integration-level proof; this test pins
 * the source-level invariant so a refactor can't silently regress it.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const orderStoreSrc = readFileSync(
  join(__dirname, '..', 'stores', 'useOrderStore.ts'),
  'utf-8'
)

describe('Wave 2.6 — addItemToActiveOrder clears stale sync state on cross-order id collision', () => {
  it('clears `useSyncStatusStore` entries for the synthetic id BEFORE attaching the cart item', () => {
    // The clearSyncStatus call must run BEFORE the new cart item is added
    // to `updatedCart` (otherwise BillItem would still render the stale
    // 'failed' state for the brief render window between push and clear).
    const newItemBranchIdx = orderStoreSrc.indexOf(
      "// 4. New item: add to cart"
    )
    expect(newItemBranchIdx).toBeGreaterThan(0)

    const branchSlice = orderStoreSrc.slice(
      newItemBranchIdx,
      newItemBranchIdx + 2500
    )
    const clearIdx = branchSlice.indexOf(
      'useSyncStatusStore.getState().clearSyncStatus(syncItemId)'
    )
    const pushIdx = branchSlice.indexOf(
      'updatedCart = [...updatedCart, newCartItem]'
    )
    expect(clearIdx).toBeGreaterThan(0)
    expect(pushIdx).toBeGreaterThan(clearIdx)
  })

  it('drops any pending or dead-lettered ops for the synthetic id (otherwise the dead-letter UI re-fires `setSyncStatusBatch` from offlineSyncInit:441)', () => {
    // `services/offlineSyncInit.ts:441` writes
    // `${title} — ${subtitle}` into useSyncStatusStore.itemSyncErrors when
    // an op is dead-lettered. If the dead-lettered op for this id stays in
    // MMKV, the next time `onOperationFailed` runs (e.g., on app restart
    // re-loading the queue), it'll re-publish the stale subtitle. We must
    // drop the queued/dead-lettered op AS WELL AS clearing the live status.
    const newItemBranchIdx = orderStoreSrc.indexOf(
      "// 4. New item: add to cart"
    )
    const branchSlice = orderStoreSrc.slice(
      newItemBranchIdx,
      newItemBranchIdx + 2500
    )
    expect(branchSlice).toMatch(/dropQueuedOpsForItem\(syncItemId\)/)
  })

  it('only runs the cleanup on the new-item path, not the merge path (merging into a still-syncing item must not lose its in-flight status)', () => {
    // The merge branch at `:6111` updates the existing cart item's quantity
    // and sets `sync_status: 'pending'` — clearing useSyncStatusStore in
    // that path would race with an in-flight successful sync that fired
    // setSyncStatus('synced') just before the merge.
    const mergeBranchIdx = orderStoreSrc.indexOf(
      'if (mergeCandidate) {'
    )
    const newItemBranchIdx = orderStoreSrc.indexOf(
      "// 4. New item: add to cart"
    )
    expect(mergeBranchIdx).toBeGreaterThan(0)
    expect(newItemBranchIdx).toBeGreaterThan(mergeBranchIdx)

    const mergeBranchSlice = orderStoreSrc.slice(
      mergeBranchIdx,
      newItemBranchIdx
    )
    expect(mergeBranchSlice).not.toMatch(
      /useSyncStatusStore\.getState\(\)\.clearSyncStatus\(syncItemId\)/
    )
    expect(mergeBranchSlice).not.toMatch(
      /dropQueuedOpsForItem\(syncItemId\)/
    )
  })

  it('the cleanup is fire-and-forget (caught .catch on the dropQueuedOpsForItem promise) — must NOT block the optimistic add', () => {
    // The optimistic add is on the hot path (every tap). Awaiting
    // `dropQueuedOpsForItem` would gate the UI on an MMKV write. The .catch
    // handles the rare case where storage is full or corrupted so the user
    // sees an add-success even when cleanup fails.
    const newItemBranchIdx = orderStoreSrc.indexOf(
      "// 4. New item: add to cart"
    )
    const branchSlice = orderStoreSrc.slice(
      newItemBranchIdx,
      newItemBranchIdx + 2500
    )

    // No `await dropQueuedOpsForItem` — that would gate the optimistic add.
    expect(branchSlice).not.toMatch(/await dropQueuedOpsForItem\(syncItemId\)/)
    // Has the .catch chain.
    expect(branchSlice).toMatch(
      /dropQueuedOpsForItem\(syncItemId\)\s*\.catch\(/
    )
  })
})
