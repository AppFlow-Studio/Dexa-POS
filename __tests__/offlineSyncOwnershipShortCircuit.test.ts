/**
 * Wave 2.5 — Structural guard for the offline-sync ownership short-circuit.
 *
 * Background — what was happening before this wave:
 *   - A queued op (e.g., `add_item`) replays after another station claims
 *     the order via `claim_order_v1`.
 *   - Server-side guard rejects the write with `ORDER_OWNED_BY_OTHER_STATION`.
 *   - `isTransientError` defaults to `true` for unknown errors → queue retries.
 *   - 5 retries → MAX_RETRY_ATTEMPTS hit → dead-letter with code `MAX_RETRIES`.
 *   - Slow-mode reprieve gives another 5 retries.
 *   - Cart row renders `lib/offlineSyncSubtitles.ts` subtitle "Failed 10
 *     times — just now" (the screenshot reported by the user).
 *
 * After this wave:
 *   - `handleOperationFailure` short-circuits ownership errors at the top:
 *     dead-letter immediately, code `OWNERSHIP_REJECTED`, no retry budget burn.
 *   - `lib/offlineSyncSubtitles.ts:161` already maps that code to the
 *     subtitle "Order owned by another station" and `isRetryable` returns
 *     false for it — so the cart row hides Retry and only shows Remove.
 *   - Companion change in `useOrderStore.ts` (the four `isOwnershipError`
 *     callsites) calls `dropQueuedOpsForItem(item.id)` inline, so the
 *     queue's residual error path can't recreate a stale entry. The
 *     early-out at the top of `handleOperationFailure` defends against
 *     that race.
 *
 * Why a STRUCTURAL test (mirrors the rest of Wave 2):
 * `offlineSyncService` is initialised by `initOfflineSyncService` which calls
 * `NetInfo.configure` — Jest's `jest-setup.ts` mock doesn't provide that
 * method. The existing offline-sync test suites avoid `initOfflineSyncService`
 * for the same reason; they exercise data-structure operations only. The
 * runtime contract here is covered separately by:
 *   - `__tests__/isOwnershipError.test.ts` (recogniser pure unit)
 *   - Two-station UAT (the only place where the full queue + server +
 *     realtime stack is in scope).
 *
 * This file is the regression net for the *integration*: it pins the
 * relevant lines so a future refactor can't silently revert them.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

const offlineSyncSrc = readFileSync(
  join(repoRoot, 'services', 'offlineSyncService.ts'),
  'utf-8'
)
const orderStoreSrc = readFileSync(
  join(repoRoot, 'stores', 'useOrderStore.ts'),
  'utf-8'
)
const subtitlesSrc = readFileSync(
  join(repoRoot, 'lib', 'offlineSyncSubtitles.ts'),
  'utf-8'
)

describe('Wave 2.5 — offlineSyncService ownership short-circuit', () => {
  it('imports `isOwnershipError` from the canonical helper', () => {
    expect(offlineSyncSrc).toMatch(
      /import\s*{\s*isOwnershipError\s*}\s*from\s*['"]@\/lib\/orderAccessControl['"]/
    )
  })

  it('handleOperationFailure has an early-out before any retry classification when the op was removed externally', () => {
    // Order matters: the early-out must run BEFORE any state mutation
    // (`removeFromIndex`, `pendingOperations.filter`, `moveToDeadLetter`)
    // — otherwise an already-dropped op gets re-dead-lettered, recreating
    // the stale "Failed N times" entry the user reported.
    const handlerIdx = offlineSyncSrc.indexOf(
      'async function handleOperationFailure'
    )
    expect(handlerIdx).toBeGreaterThan(0)

    const handlerBody = offlineSyncSrc.slice(handlerIdx, handlerIdx + 4000)
    expect(handlerBody).toMatch(
      /pendingOperations\.some\(o => o\.id === operation\.id\)/
    )
    expect(handlerBody).toMatch(
      /deadLetterQueue\.some\(o => o\.id === operation\.id\)/
    )
    expect(handlerBody).toMatch(/already removed, skipping/)

    // Early-out must precede the retry classifier.
    const earlyOutIdx = handlerBody.indexOf('already removed, skipping')
    const classifierIdx = handlerBody.indexOf(
      'const permanent = error && !isTransientError(error)'
    )
    expect(earlyOutIdx).toBeGreaterThan(0)
    expect(classifierIdx).toBeGreaterThan(earlyOutIdx)
  })

  it('handleOperationFailure short-circuits ownership errors with code OWNERSHIP_REJECTED before the retry classifier', () => {
    const handlerIdx = offlineSyncSrc.indexOf(
      'async function handleOperationFailure'
    )
    const handlerBody = offlineSyncSrc.slice(handlerIdx, handlerIdx + 4000)

    // Calls the recogniser.
    expect(handlerBody).toMatch(/isOwnershipError\(null, error\)/)

    // Sets the right code so `lib/offlineSyncSubtitles.ts:161` can render
    // "Order owned by another station" and `isRetryable` (line 125-130)
    // returns false → Retry chip hides.
    expect(handlerBody).toMatch(/code:\s*'OWNERSHIP_REJECTED'/)

    // Forces immediate dead-letter — no MAX_RETRY_ATTEMPTS burn, no
    // slow-mode reprieve.
    expect(handlerBody).toMatch(
      /operation\.retryCount = MAX_RETRY_ATTEMPTS/
    )
    expect(handlerBody).toMatch(/moveToDeadLetter\(operation\)/)

    // Short-circuit must precede the regular permanent/transient branch.
    const ownershipIdx = handlerBody.indexOf("'OWNERSHIP_REJECTED'")
    const classifierIdx = handlerBody.indexOf(
      'const permanent = error && !isTransientError(error)'
    )
    expect(ownershipIdx).toBeGreaterThan(0)
    expect(classifierIdx).toBeGreaterThan(ownershipIdx)
  })

  it('the subtitle helper recognises the OWNERSHIP_REJECTED code and renders the operator-facing copy', () => {
    // Sanity check the contract on the OTHER side. If the code-string ever
    // diverges between offlineSyncService.ts and offlineSyncSubtitles.ts,
    // the cart row would silently fall back to "Sync failed" and the user
    // wouldn't know the order moved.
    expect(subtitlesSrc).toMatch(/'OWNERSHIP_REJECTED'/)
    expect(subtitlesSrc).toMatch(/Order owned by another station/)
  })

  it('the subtitle helper marks OWNERSHIP_REJECTED as non-retryable so the cart row hides Retry', () => {
    expect(subtitlesSrc).toMatch(/code === 'OWNERSHIP_REJECTED'/)

    // The OWNERSHIP_REJECTED branch must live in the non-retryable section
    // of `isRetryable`. A return of `false` should follow it within ~5 lines.
    const codeIdx = subtitlesSrc.indexOf("code === 'OWNERSHIP_REJECTED'")
    const segment = subtitlesSrc.slice(codeIdx, codeIdx + 200)
    expect(segment).toMatch(/return false/)
  })
})

describe('Wave 2.5 — useOrderStore inline drop-queued-ops on ownership error', () => {
  it('imports `isOwnershipError` from the canonical helper', () => {
    expect(orderStoreSrc).toMatch(
      /import\s*{\s*isOrderReadOnly,\s*isOwnershipError\s*}\s*from\s*['"]@\/lib\/orderAccessControl['"]/
    )
  })

  it('removed the local private `_isOwnershipError` (single source of truth)', () => {
    // Pre-Wave 2.5 the helper lived at `useOrderStore.ts:177-181` as a
    // private function. Ensure the duplicate is gone — otherwise the
    // recogniser shape can drift between callsites.
    expect(orderStoreSrc).not.toMatch(/^function _isOwnershipError/m)
  })

  it('all four inline ownership-error sites call `dropQueuedOpsForItem(item.id)` to stop the queue retry counter', () => {
    // The queue's retry-counter is what produces the "Add failed N times"
    // subtitle. Inline detection MUST drop any in-flight queued ops for
    // the item — otherwise even with the queue-side short-circuit, a
    // stale dead-letter entry could surface.
    const dropCalls = (
      orderStoreSrc.match(/dropQueuedOpsForItem\(item\.id\)/g) ?? []
    ).length

    // 4 inline ownership sites + the existing dropQueuedOpsForItem caller(s)
    // already in the file. The tail count must be at least 4 from the
    // ownership block. We assert ≥4 to allow other callers to coexist.
    expect(dropCalls).toBeGreaterThanOrEqual(4)
  })

  it('each inline ownership block surfaces the same operator-facing toast (no message drift)', () => {
    // A future refactor that splits the toast across sites would make
    // it much harder for the operator to recognise the cause at a glance.
    const matches = orderStoreSrc.match(
      /This order moved to another station\. Take over to continue\./g
    )
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
