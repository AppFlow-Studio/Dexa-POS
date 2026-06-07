/**
 * Wave 2.7 — Structural guard for the per-order ownership recheck.
 *
 * Background:
 * Wave 2.1 (realtime broadcast) and Wave 2.1.1 (polling/reconnect refetch)
 * leave a real gap: realtime is up but a specific broadcast was missed, or
 * we're between `useOrderSyncRecovery` polling cycles. Local `station_id`
 * stays stale, the read-only banner doesn't render, and `_checkCartEditable`
 * trusts the stale snapshot — every cart action wastes a server round-trip
 * before Wave 2.5 dead-letters it.
 *
 * Wave 2.7 closes the gap with a per-order recheck that fires on:
 *   1. Order-processing screen focus (catches background → foreground).
 *   2. activeOrderId change (catches user-switches-orders).
 *   3. connectionQuality transitioning back to 'fast' from slow/probing
 *      (catches realtime-was-flaky cases).
 *
 * Throttled to one recheck per orderId per 5 seconds so a focus + order
 * change firing in the same tick doesn't double-probe.
 *
 * Why a STRUCTURAL test:
 * The order store is unloadable in jest. The hook subscribes to
 * `connectionQuality` (an EventEmitter-shaped singleton) and to expo-router's
 * useFocusEffect, neither of which has lightweight test fixtures here. The
 * runtime contract is covered by two-station UAT (background app → claim
 * from B → foreground A → flip fires). This file pins the source-level
 * invariants so a refactor can't silently regress them.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')
const read = (relPath: string): string =>
  readFileSync(join(repoRoot, relPath), 'utf-8')

const serviceSrc = read('services/orderOwnershipRecheck.ts')
const hookSrc = read(
  'hooks/orders/useActiveOrderOwnershipRecheck.ts'
)
const orderProcessingSrc = read('app/(main)/order-processing.tsx')
const billSectionSrc = read('components/bill/BillSection.tsx')
const orderStoreSrc = read('stores/useOrderStore.ts')
const ordersQuerySrc = read('hooks/pos/useOrdersQuery.ts')
const transformersSrc = read('utils/orderTransformers.ts')
const typesSrc = read('lib/types.ts')
const bannerSrc = read('components/order/ReadOnlyBanner.tsx')

describe('Wave 2.7 — orderOwnershipRecheck service shape', () => {
  it('exports `recheckOrderOwnership` returning a tight `OwnershipSnapshot`', () => {
    expect(serviceSrc).toMatch(
      /export async function recheckOrderOwnership\s*\(/
    )
    expect(serviceSrc).toMatch(/export type OwnershipSnapshot/)
    expect(serviceSrc).toMatch(/stationId:\s*string \| null/)
    expect(serviceSrc).toMatch(/stationName:\s*string \| null/)
    expect(serviceSrc).toMatch(/syncVersion:\s*number \| null/)
  })

  it('uses a single SELECT joined to `stations(station_name)` — no RPC, RLS already filters by merchant + location', () => {
    expect(serviceSrc).toMatch(
      /\.select\('id, station_id, sync_version, stations\(station_name\)'\)/
    )
    expect(serviceSrc).not.toMatch(/\.rpc\(/)
  })

  it('wraps the probe in `runWithDeadline` so a stalled SELECT trips the bad-wifi state machine', () => {
    expect(serviceSrc).toMatch(/runWithDeadline/)
    expect(serviceSrc).toMatch(/DEADLINES\.read/)
    expect(serviceSrc).toMatch(/'order_ownership_recheck'/)
  })

  it('normalizes the `stations` join (object for .single(), array otherwise)', () => {
    expect(serviceSrc).toMatch(/Array\.isArray\(row\.stations\)/)
  })

  it('returns null on error or missing row (caller treats as no-op)', () => {
    expect(serviceSrc).toMatch(/if \(error \|\| !data\) return null/)
  })
})

describe('Wave 2.7 — useActiveOrderOwnershipRecheck hook', () => {
  it('imports useFocusEffect from expo-router', () => {
    expect(hookSrc).toMatch(
      /import\s*{\s*useFocusEffect\s*}\s*from\s*['"]expo-router['"]/
    )
  })

  it('throttles per orderId at 5 seconds (a focus + order-change burst must not double-probe)', () => {
    expect(hookSrc).toMatch(/RECHECK_THROTTLE_MS = 5_000/)
    expect(hookSrc).toMatch(/_lastRecheckAt\[orderId\]/)
    expect(hookSrc).toMatch(/now - lastAt < RECHECK_THROTTLE_MS/)
  })

  it('skips offline drafts (no db_order_id → no server row to probe)', () => {
    expect(hookSrc).toMatch(/if \(!localOrder\?\.db_order_id\) return/)
  })

  it('subscribes to connectionQuality and only fires recheck on slow→fast transitions', () => {
    expect(hookSrc).toMatch(/connectionQuality\.subscribe/)
    expect(hookSrc).toMatch(/next === 'fast' && prior !== 'fast'/)
  })

  it('reuses `maybeFireTakeoverToast` from Wave 2.1 — same dedup window absorbs broadcast + recheck duplicates', () => {
    expect(hookSrc).toMatch(
      /import\s*{\s*maybeFireTakeoverToast\s*}\s*from\s*['"]@\/lib\/takeoverToast['"]/
    )
    expect(hookSrc).toMatch(/maybeFireTakeoverToast\(orderId, localOrder\)/)
  })

  it('writes the fresh ownership snapshot into ordersById whenever station_id OR station_name changed (not just on flip-away)', () => {
    // A station-name-only change (e.g., station was renamed) still needs to
    // refresh the local snapshot so the banner copy stays accurate, even
    // though no flip happened.
    expect(hookSrc).toMatch(/stationIdChanged \|\| stationNameChanged/)
    expect(hookSrc).toMatch(/useOrderStore\.setState/)
  })

  it('force-closes the active payment sheet on flip-away when pinned to the same orderId', () => {
    expect(hookSrc).toMatch(
      /sheet\.isOpen && sheet\.orderId === orderId/
    )
  })

  it('skips the toast when the order is in a terminal state (matches Wave 2.1 / 2.1.1 semantics)', () => {
    expect(hookSrc).toMatch(/orderIsTerminal =/)
    expect(hookSrc).toMatch(/order_status === 'void'/)
    expect(hookSrc).toMatch(/check_status === 'Closed'/)
  })

  it('flippedAway requires a non-null currentStationId (no false positives on devices without a selected station)', () => {
    expect(hookSrc).toMatch(/currentStationId != null/)
  })

  it('only toasts for an explicit foreign owner, not when an order becomes unowned', () => {
    expect(hookSrc).toMatch(
      /wasMine && newStationId != null && !isMine && !orderIsTerminal/
    )
    expect(orderStoreSrc).toMatch(
      /_priorStationId === currentStationId &&\s*_newStationId != null &&\s*_newStationId !== currentStationId/
    )
    expect(ordersQuerySrc).toMatch(
      /next\?\.station_id != null && next\.station_id !== _myStationId/
    )
    expect(ordersQuerySrc).not.toMatch(
      /!next \|\| \(next\.station_id != null && next\.station_id !== _myStationId\)/
    )
  })
})

describe('Wave 2.7 - table-session poll stability', () => {
  it('refreshes the dine-in table-to-order index after a broadcast upsert', () => {
    expect(orderStoreSrc).toMatch(
      /state\.dbOrderIdIndex\[dbOrderId\] = dbOrderId;[\s\S]*syncTableOrderIdIndexForOrder\(state, dbOrderId, existing\);/
    )
  })
})

describe('Wave 2.7 — station_name plumbing', () => {
  it('OrderProfile gained a `station_name` field with the same nullable shape as `station_id`', () => {
    // The pre-existing `_sourceStationName` is for the original creator and
    // never refreshed. Wave 2.7's `station_name` mirrors `station_id`
    // semantics — current owner, refreshed by broadcast / hydrate / recheck.
    expect(typesSrc).toMatch(
      /station_id\?:\s*string \| null[\s\S]*station_name\?:\s*string \| null/
    )
  })

  it('the broadcast merge propagates `station_name` next to `station_id` (Wave 2.1 redux)', () => {
    expect(orderStoreSrc).toMatch(
      /station_id: backendOrder\.station_id,[\s\S]*station_name: backendOrder\.station_name \?\? null,/
    )
  })

  it('transformBroadcastToOrder writes `station_name` so cold-start hydrate also surfaces it', () => {
    expect(transformersSrc).toMatch(/station_name: sourceStationName \|\| null/)
  })

  it('BillSection sources the banner label from `station_name` first, falling back to `_sourceStationName` for legacy orders', () => {
    expect(billSectionSrc).toMatch(
      /activeOrderForReadOnly\?\.station_name \?\?\s*activeOrderForReadOnly\?\._sourceStationName/
    )
  })

  it('ReadOnlyBanner copy reads "Currently owned by …" so the user knows it can change as the order is taken over', () => {
    expect(bannerSrc).toMatch(/Currently owned by \{stationLabel\}\. Take over to edit\./)
  })
})

describe('Wave 2.7 — order-processing screen mount', () => {
  it('mounts `useActiveOrderOwnershipRecheck()` at the top of the OrderProcessing component (covers focus + activeOrderId change)', () => {
    const fnIdx = orderProcessingSrc.indexOf('const OrderProcessing = () => {')
    expect(fnIdx).toBeGreaterThan(0)
    const body = orderProcessingSrc.slice(fnIdx, fnIdx + 1500)
    expect(body).toMatch(/useActiveOrderOwnershipRecheck\(\)/)
  })

  it('imports the hook from the canonical path', () => {
    expect(orderProcessingSrc).toMatch(
      /import\s*{\s*useActiveOrderOwnershipRecheck\s*}\s*from\s*['"]@\/hooks\/orders\/useActiveOrderOwnershipRecheck['"]/
    )
  })
})
