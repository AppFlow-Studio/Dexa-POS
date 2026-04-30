/**
 * Wave 2.1 — Structural guard for the broadcast-merge `station_id` propagation.
 *
 * Background:
 * `useOrderStore.ts._handleOrderBroadcast` rebuilds the local order via a
 * spread literal (`updatedOrder = { ...existingOrder, ... }`). Pre-Wave 2.1,
 * `station_id` was excluded from that build, so when `claim_order_v1` flipped
 * the field on the server, the broadcast landed but the local order kept its
 * stale `station_id`. `isOrderReadOnly()` then returned `false` for the source
 * station and the user kept editing a foreign order — only finding out via a
 * post-attempt `ORDER_OWNED_BY_OTHER_STATION` toast.
 *
 * Why a STRUCTURAL test instead of behavioural:
 * The order store is the largest module in the codebase (~10K LOC) and pulls
 * in 50+ transitive imports (Supabase, hardware services, OrderService). No
 * existing test loads `useOrderStore.ts` for a reason — the cost of mocking
 * the world for a one-line merge guarantee is not worth it. Two-station UAT
 * is the integration-level proof; this file is the regression net that
 * catches anyone deleting the line in a future refactor.
 *
 * The behaviour itself is exercised end-to-end by the Wave 2.1 UAT scenario
 * captured in the plan file. This test only asserts that the surgical
 * field-add survives in the source — if someone refactors the merge and drops
 * `station_id`, this test red-flags it before it hits staging.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const orderStoreSource = readFileSync(
  join(__dirname, '..', 'stores', 'useOrderStore.ts'),
  'utf-8'
)

describe('useOrderStore broadcast merge — Wave 2.1 station_id propagation', () => {
  it('includes `station_id: backendOrder.station_id` in the broadcast-merge spread', () => {
    expect(orderStoreSource).toContain(
      'station_id: backendOrder.station_id'
    )
  })

  it('imports `maybeFireTakeoverToast` from the dedicated dedup module', () => {
    // Regression guard: if someone reverts the extraction back to inline
    // module-scope helpers, the dedup unit-tests in
    // `takeoverToastDedup.test.ts` would silently stop covering the live
    // helper. Pin the import so reverts are loud.
    expect(orderStoreSource).toMatch(
      /import\s*{\s*maybeFireTakeoverToast\s*}\s*from\s*['"]@\/lib\/takeoverToast['"]/
    )
  })

  it('detects ownership-flip-away (was-mine && !is-mine) BEFORE the merge so post-merge can fire side effects', () => {
    // The flip detection must be computed off `localOrder` (pre-merge) so the
    // wasMine/isMine comparison is meaningful. If a future refactor moves it
    // INSIDE the set() callback against `existingOrder` post-mutation, this
    // test catches it.
    expect(orderStoreSource).toMatch(
      /const _priorStationId = localOrder\?\.station_id \?\? null/
    )
    expect(orderStoreSource).toMatch(
      /const _newStationId = backendOrder\.station_id \?\? null/
    )
    expect(orderStoreSource).toMatch(/const _flippedAway =/)
  })

  it('skips the toast when the order is in a terminal state (void / completed / Closed check)', () => {
    // We don't want to alarm the user that an order they finished has been
    // "taken over" — terminal-state guards short-circuit the flip-away check.
    expect(orderStoreSource).toMatch(/_orderIsTerminal =/)
    expect(orderStoreSource).toMatch(
      /localOrder\?\.order_status === 'void'/
    )
    expect(orderStoreSource).toMatch(
      /localOrder\?\.check_status === 'Closed'/
    )
  })

  it('force-closes the active payment sheet on flip-away when pinned to the same orderId', () => {
    // Defense against the user being left charging a foreign order with the
    // payment sheet still open. The check must verify the sheet is open
    // AND pinned to the order that just flipped — closing an unrelated sheet
    // would be a regression.
    expect(orderStoreSource).toContain('usePaymentDetailSheetStore')
    expect(orderStoreSource).toMatch(
      /sheet\.isOpen && sheet\.orderId === localOrderId/
    )
  })

  it('the flip-away check requires a non-null currentStationId (no false positives when station context is missing)', () => {
    // `isOrderReadOnly` short-circuits when `currentStationId == null`. The
    // flip-away detector must mirror this — otherwise a device without a
    // selected station would toast for every claim broadcast.
    expect(orderStoreSource).toMatch(/currentStationId != null/)
  })
})
