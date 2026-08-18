/**
 * send_to_kitchen — bounded self-re-queue.
 *
 * The handler re-queues its own unresolved items (step 4) and then returns
 * SUCCESS, so the original op is removed as successful. `queueFailedOperation`
 * does no dedupe and resets retryCount to 0, which means every normal safety
 * net keys off an op FAILING — and no op in this chain ever does:
 *
 *   MAX_RETRY_ATTEMPTS  → each generation starts at retryCount 0
 *   dead-letter         → nothing fails
 *   classifyError       → never invoked, there is no error
 *   Syncing panel       → no failures to display
 *   OPERATION_TTL_MS    → each generation is newly timestamped
 *
 * So an item whose db_order_item_id never materialises (its add dead-lettered,
 * it was voided mid-flight, or the registry mapping was lost on rekey) spawns
 * generations forever, two RPCs each, invisibly.
 *
 * These are structural assertions — exercising the runtime path needs Supabase
 * plus a live queue, which the sibling offline-sync suites also avoid because
 * `initOfflineSyncService` calls `NetInfo.configure` (unmocked in jest-setup).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

const syncInitSrc = readFileSync(
  join(repoRoot, 'services', 'offlineSyncInit.ts'),
  'utf-8'
)
const subtitlesSrc = readFileSync(
  join(repoRoot, 'lib', 'offlineSyncSubtitles.ts'),
  'utf-8'
)
const opResultSrc = readFileSync(
  join(repoRoot, 'lib', 'network', 'opResult.ts'),
  'utf-8'
)

const handler = (() => {
  const start = syncInitSrc.indexOf('case "send_to_kitchen":')
  // `fire_course` is the case that immediately follows. Slicing to a later
  // case would swallow fire_course/remove_course/set_item_seat and make these
  // assertions report on handlers this test does not cover.
  const end = syncInitSrc.indexOf('case "fire_course":', start)
  if (start === -1 || end === -1) throw new Error('handler not found')
  return syncInitSrc.slice(start, end)
})()

describe('send_to_kitchen re-queue is bounded', () => {
  it('declares a finite generation cap', () => {
    expect(syncInitSrc).toMatch(
      /const MAX_KITCHEN_REQUEUE_GENERATIONS\s*=\s*(\d+)/
    )
    const cap = Number(
      /const MAX_KITCHEN_REQUEUE_GENERATIONS\s*=\s*(\d+)/.exec(syncInitSrc)![1]
    )
    expect(cap).toBeGreaterThan(0)
    // A large cap would defeat the purpose — each generation costs two RPCs.
    expect(cap).toBeLessThanOrEqual(5)
  })

  it('reads the incoming generation and increments it', () => {
    expect(handler).toMatch(/op\.params\.requeueGeneration\s*\?\?\s*0/)
    expect(handler).toMatch(/generation\s*=\s*\(op\.params\.requeueGeneration/)
  })

  it('propagates the counter into the re-queued op', () => {
    // Without this the chain resets to 0 every pass and the cap never bites.
    const requeue = handler.slice(handler.indexOf('await queueFailedOperation'))
    expect(requeue).toMatch(/requeueGeneration:\s*generation/)
  })

  it('dead-letters instead of re-queueing once the cap is exceeded', () => {
    const guardIdx = handler.indexOf(
      'generation > MAX_KITCHEN_REQUEUE_GENERATIONS'
    )
    // Match the CALL, not the prose in the explanatory comment above it.
    const requeueIdx = handler.indexOf('await queueFailedOperation')
    expect(guardIdx).toBeGreaterThan(0)
    // The bail-out must be evaluated BEFORE the re-queue, or the loop
    // continues for one extra generation past the cap on every pass.
    expect(requeueIdx).toBeGreaterThan(guardIdx)
    expect(handler).toMatch(/OpTerminal\(\s*["']KITCHEN_ITEMS_UNRESOLVED["']/)
  })

  it('surfaces the unresolved items on the per-item chip', () => {
    // Dead-lettering silently would just trade an invisible loop for an
    // invisible drop — the operator has to know which items to re-fire.
    const guard = handler.slice(
      handler.indexOf('generation > MAX_KITCHEN_REQUEUE_GENERATIONS')
    )
    expect(guard).toMatch(/setSyncStatusBatch/)
    expect(guard).toMatch(/status:\s*["']failed["']/)
  })
})

describe('send_to_kitchen failure classification', () => {
  it('treats unresolved dependencies as blocked, not failed', () => {
    // Burning retry budget while waiting on a parent order/item is what made
    // kitchen sends dead-letter during a perfectly healthy sync.
    expect(handler).toMatch(/OpBlocked\(["']order_not_synced["']\)/)
    expect(handler).toMatch(/OpBlocked\(["']items_not_synced["']\)/)
  })

  it('classifies RPC errors instead of returning a bare false', () => {
    expect(handler).toMatch(/classifyError\(sendResult\.error/)
    expect(handler).toMatch(/isTerminalKitchenMutationError\(sendResult\.error/)
    expect(handler).toMatch(/classifyError\(err/)
  })

  it('leaves no bare `return false` in the handler', () => {
    // Every exit must carry a reason now — a bare false is exactly the lost
    // value that produced "Failed N times" with no cause.
    expect(handler).not.toMatch(/\breturn false\b/)
  })
})

describe('KITCHEN_ITEMS_UNRESOLVED is wired end to end', () => {
  it('has an operator-facing cause and remedy', () => {
    expect(subtitlesSrc).toMatch(/case 'KITCHEN_ITEMS_UNRESOLVED':/)
    expect(opResultSrc).toMatch(/KITCHEN_ITEMS_UNRESOLVED:/)
  })

  it('hides Retry — retrying re-runs the same unresolvable lookup', () => {
    const retryable = subtitlesSrc.slice(
      subtitlesSrc.indexOf('export function isRetryable')
    )
    expect(retryable).toMatch(/code === 'KITCHEN_ITEMS_UNRESOLVED'/)
  })
})
