/**
 * Wave 2.1.1 — Structural guard for the `hydrateWorkspace` flip-away detection.
 *
 * Background:
 * Wave 2.1's flip-away detection lives inside `_handleOrderBroadcast`. That
 * works for the happy path (realtime broadcast lands on A from B's claim).
 * It does NOT cover three real-world paths:
 *
 *   1. Realtime channel was disconnected when B claimed → A misses the
 *      broadcast entirely. `useOrderSyncRecovery.ts` polls every 30s while
 *      the channel is down and fires a refetch on reconnect. The refetch
 *      result lands in `hydrateWorkspace`, NOT `_handleOrderBroadcast`.
 *
 *   2. Cold-start refetch via `useOrdersQuery` after a station switch — same
 *      catch-up code path.
 *
 *   3. Drafts owned by another station are silently pruned at
 *      `useOrdersQuery.ts:184-202`. From A's POV this is also a flip-away
 *      (the order disappears) and deserves a toast.
 *
 * Why a STRUCTURAL test (mirrors `broadcastMergeStationId.test.ts`):
 * `useOrdersQuery` transitively pulls in TanStack Query, the Supabase
 * client, deadline utilities, and `useOrderStore`. A behavioural test would
 * need to mock all of that for a single ~25-line surgical addition. Two-
 * station UAT under realtime-drop is the integration-level proof; this file
 * is the regression net so the addition can't be silently reverted.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const useOrdersQuerySource = readFileSync(
  join(__dirname, '..', 'hooks', 'pos', 'useOrdersQuery.ts'),
  'utf-8'
)

describe('useOrdersQuery hydrateWorkspace — Wave 2.1.1 flip-away on catch-up path', () => {
  it('imports `maybeFireTakeoverToast` from the dedicated dedup module', () => {
    // Reuses the same dedup `Set` as Wave 2.1's broadcast handler — so a fast
    // realtime broadcast and a slower hydrate refetch don't double-toast.
    expect(useOrdersQuerySource).toMatch(
      /import\s*{\s*maybeFireTakeoverToast\s*}\s*from\s*['"]@\/lib\/takeoverToast['"]/
    )
  })

  it('imports `usePaymentDetailSheetStore` for the auto-close on flip-away', () => {
    expect(useOrdersQuerySource).toMatch(
      /import\s*{\s*usePaymentDetailSheetStore\s*}\s*from\s*['"]@\/stores\/usePaymentDetailSheetStore['"]/
    )
  })

  it('snapshots ownership BEFORE the merge so `wasMine` is comparable to the post-merge `station_id`', () => {
    expect(useOrdersQuerySource).toMatch(/const _myStationId =/)
    expect(useOrdersQuerySource).toMatch(/const _isSameLocationRehydrate =/)
    expect(useOrdersQuerySource).toMatch(
      /const wasMine = prev\.station_id === _myStationId/
    )
  })

  it('skips flip-away detection on cold-start (different location or empty store) to avoid false positives', () => {
    // `_isSameLocationRehydrate` requires same locationId + non-empty
    // existing orders. Without this guard, every initial load would toast
    // for every order owned by the user's own station.
    expect(useOrdersQuerySource).toMatch(
      /state\.currentLocationId === locationId && state\.orderIds\.length > 0/
    )
  })

  it('skips terminal-state orders (void / completed / Closed check) — no point toasting orders the user already finished', () => {
    expect(useOrdersQuerySource).toMatch(/orderIsTerminal =/)
    expect(useOrdersQuerySource).toMatch(/prev\.order_status === "void"/)
    expect(useOrdersQuerySource).toMatch(/prev\.check_status === "Closed"/)
  })

  it('treats `prev mine + next absent` as flip-away (the silent-prune path at line ~184)', () => {
    // The remote-station-draft prune at `useOrdersQuery.ts:184-202` removes
    // orders entirely from `newOrdersById`. From the user's POV this is also
    // an ownership change — they should hear about it.
    expect(useOrdersQuerySource).toMatch(/!next \|\|/)
  })

  it('treats `prev mine + next.station_id mismatches` as flip-away (the standard claim case)', () => {
    expect(useOrdersQuerySource).toMatch(
      /next\.station_id != null && next\.station_id !== _myStationId/
    )
  })

  it('includes `station_id` in the early-return equality check (otherwise pure ownership flips would be skipped)', () => {
    // Without this, a hydrate where the only change is `station_id` would
    // hit the "nothing meaningful changed" early return and never write the
    // new ownership to the store — so `isOrderReadOnly` would never flip.
    expect(useOrdersQuerySource).toMatch(
      /prev\.station_id === next\.station_id/
    )
  })

  it('fires the toast queueMicrotask AFTER the `useOrderStore.setState` call so consumers see the read-only state', () => {
    // Order matters: setState first, side-effects second. Otherwise a
    // synchronous toast handler that re-reads the store (e.g. for "open the
    // order" deep-link from the toast) would see stale data.
    const setStateIdx = useOrdersQuerySource.indexOf(
      'useOrderStore.setState({'
    )
    const microtaskIdx = useOrdersQuerySource.indexOf(
      'queueMicrotask(() => maybeFireTakeoverToast'
    )
    expect(setStateIdx).toBeGreaterThan(0)
    expect(microtaskIdx).toBeGreaterThan(0)
    expect(microtaskIdx).toBeGreaterThan(setStateIdx)
  })

  it('force-closes the active payment sheet on flip-away when pinned to the same orderId', () => {
    // Same defense-in-depth as Wave 2.1: the user must not be left charging
    // a now-foreign order. `sheet.orderId === _activeOrderId` ensures we
    // only close the sheet if it's actually pinned to the flipped-away order.
    expect(useOrdersQuerySource).toMatch(
      /sheet\.isOpen && sheet\.orderId === _activeOrderId/
    )
  })
})
