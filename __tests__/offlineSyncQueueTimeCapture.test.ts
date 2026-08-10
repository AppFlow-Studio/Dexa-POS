/**
 * Queue-time context capture.
 *
 * A queued operation replays minutes or hours after it was created. Any context
 * the executor reads from a live store at REPLAY time is whatever happens to be
 * true then — not what was true when the operator acted.
 *
 * Concrete failure this pins: `void_discount` queued no staff id, so the
 * executor fell back to `useEmployeeStore.loggedInEmployee` at replay. That
 * store is cleared on logout/PIN-lock (useEmployeeStore.ts:309), so a server
 * who voids a discount offline and then ends their shift produced an op that
 * either blocked forever ("No staff ID available") or attributed the void to
 * the next person to log in.
 *
 * These are structural assertions: the runtime path needs Supabase + a live
 * queue, which the other offline-sync suites also avoid for the same reason
 * (initOfflineSyncService calls NetInfo.configure, unmocked in jest-setup).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

const orderStoreSrc = readFileSync(
  join(repoRoot, 'stores', 'useOrderStore.ts'),
  'utf-8'
)
const syncInitSrc = readFileSync(
  join(repoRoot, 'services', 'offlineSyncInit.ts'),
  'utf-8'
)

/** Extract one `case "<name>": { ... }` block from the executor switch. */
function handlerBody (name: string): string {
  const start = syncInitSrc.indexOf(`case "${name}":`)
  if (start === -1) throw new Error(`handler ${name} not found`)
  return syncInitSrc.slice(start, start + 3000)
}

describe('void_discount — staff id captured at queue time', () => {
  it('every void_discount queueOperation call passes staffId', () => {
    // Find each queued void_discount and assert the params carry staffId.
    const blocks = orderStoreSrc.split('type: "void_discount"').slice(1)
    expect(blocks.length).toBeGreaterThan(0)

    for (const block of blocks) {
      // Look at the whole queueOperation call, not up to the first
      // `localOrderId:` — that key appears INSIDE params too.
      const call = block.slice(0, block.indexOf('} as any'))
      expect(call).toMatch(/staffId/)
    }
  })

  it('executor prefers the queued staffId over the live employee store', () => {
    const body = handlerBody('void_discount')
    // Assert on the resolution expression itself. Matching bare identifiers
    // over the whole handler picks up prose in comments, not code order.
    expect(body).toMatch(
      /const staffId\s*=\s*op\.params\.staffId\s*\?\?[\s\S]{0,120}?loggedInEmployee/
    )
  })

  it('still blocks (not fails) when no staff id can be resolved at all', () => {
    // Blocking preserves the retry budget; this is a transient app-state gap,
    // not a server rejection.
    const body = handlerBody('void_discount')
    expect(body).toMatch(/OpBlocked\(["']staff_id_unavailable["']\)/)
  })
})

describe('apply_discount — staff id travels on the discount payload', () => {
  it('captures applied_by_staff_profiles_id when the discount is created', () => {
    // apply_discount was already correct: the `applied` object embeds the staff
    // id at apply time and is queued whole. Pin it so it stays that way.
    expect(orderStoreSrc).toMatch(/applied_by_staff_profiles_id: staffId/)
  })

  it('executor reads the payload staff id before the live store', () => {
    const body = handlerBody('apply_discount')
    expect(body).toMatch(
      /discount\.applied_by_staff_profiles_id\s*\?\?[\s\S]{0,120}?loggedInEmployee/
    )
  })
})

describe('seat_guests — already used the queue-time pattern', () => {
  it('prefers op.params.staffId over the live store', () => {
    const body = handlerBody('seat_guests')
    expect(body).toMatch(/op\.params\.staffId\s*\?\?/)
  })
})
