# Offline Sync — Failure Model Rebuild

## Problem (root cause, not symptoms)

The queue has **no failure model**. `executeQueuedOperation` returns `Promise<boolean>`,
which cannot express the four things that actually happen:

| What happened | What the system sees |
|---|---|
| Succeeded | `true` |
| Waiting on a dependency (not a failure) | `false` |
| Transient failure — retry is correct | `false` |
| Permanent rejection — retry is futile | `false` |

Three consequences, all reported by the user:

1. **"It doesn't say why it failed."** `describeCause()` reads `op.lastError.code`.
   `lastError` is only set in `handleOperationFailure(op, error)`, and the dispatcher
   passes `null` for every `return false` path (`offlineSyncService.ts:2539`). So the
   only branch that ever runs is the fallback: `code: "MAX_RETRIES"` →
   **"Failed 10 times"**, which is the retry counter describing itself, not the error.
   A top-level `catch` at `offlineSyncInit.ts:3882-3885` swallows every *thrown*
   error from all ~30 handlers and returns bare `false` — the largest single leak.

2. **"10 retries instantly."** `const permanent = error && !isTransientError(error)`
   with `error === null` → `permanent === false`, *always*. Every terminal error
   (400/403/404, FK violation, invalid enum) is classified transient and retried the
   full budget. Worse: slow-mode reprieve resets `retryCount` 3× → **up to 44
   executions** of an op doomed on attempt 1. Backoff is computed by
   `scheduleAutoRetry` then bypassed — the 3s debounce, 10s NetInfo poll, and 60s
   periodic sync all call bare `processQueue()`, so effective spacing is ~3s.

3. **Dead Retry buttons.** `isRetryable()` sees `MAX_RETRIES` → returns `true`, so
   permanently-rejected ops show a Retry the operator can tap forever.

Evidence the team already hit this: ~8 hand-written per-error escape hatches
(`P0005`, `23505`, `22P02`, "already paid", "already voided", "already closed"),
each commented "would loop forever otherwise". `markOperationBlocked` is the right
abstraction, wired at **1 of ~128** `return false` sites because `boolean` couldn't
express "not failed, just waiting".

## Scope

**In:** the failure model — result type, classifier, dispatcher, handler conversion,
operator-facing reporting, retry pacing.

**Out (deliberately):** priority ordering, idempotency keys, payment journaling,
dead-letter storage, bundling. These are sound; changing them adds risk without
addressing the report. The O(n²) `pendingOperations.find()` scans are real but are a
*perf* issue — noted at the bottom, not bundled into a correctness fix.

## Design

### 1. `OpResult` — the type that carries the truth

```ts
export type OpResult =
  | { outcome: 'success' }
  | { outcome: 'blocked'; reason: string }              // dependency wait, no retry burn
  | { outcome: 'terminal'; code: string; message: string; remedy?: string }
  | { outcome: 'retry'; code: string; message: string; remedy?: string }
```

Handlers keep returning `boolean` during migration — the dispatcher normalizes
`true → success`, `false → retry{code:'UNSPECIFIED'}`. This keeps every unconverted
handler working while batches land, so the refactor is never in a broken half-state.

### 2. `classifyError(error)` — one classifier replacing ~8 escape hatches

Maps a raw Supabase/Postgres/JS error to `{ outcome, code, message, remedy }`:

- **Terminal (Postgres):** `23503` FK violation, `23502` not-null, `22P02` invalid
  input/enum, `42501` RLS denied, `P0005` order-math, `P0001` raises matching
  already-applied shapes.
- **Terminal (HTTP):** 400, 401, 403, 404, 409, 422.
- **Idempotent-success:** `23505`, "already paid", "already voided", "already closed",
  "no unpaid items remaining" → `success`, not failure. Folds the existing hatches in.
- **Transient:** 5xx, 408, 429, `40001`, network/timeout/fetch-failed.
- **Unknown:** `retry` but with a **short budget** (see §5) — an unclassified permanent
  error costs ~3 attempts, not 44.

Critical fix: current `isTransientError` only inspects `status` when
`typeof status === "number"`. Supabase `PostgrestError.code` is a *string*
(`"23503"`), so it always falls through to `return true`. The classifier must handle
string codes — this is why Postgres errors are structurally unable to be terminal today.

### 3. Remedy strings — "how to solve"

Each code maps to an operator-actionable line, rendered under the cause:

| Cause | Remedy |
|---|---|
| Server rejected — invalid data | "Edit the item and try again, or remove it." |
| Permission denied | "Log out and back in, or ask a manager." |
| Order owned by another station | "Take over the order on this station first." |
| Order/item no longer exists | "Refresh the order. It was likely voided elsewhere." |
| Network too slow | "Waiting for a better connection — no action needed." |
| Server error | "Server problem, not your device. Retry in a moment." |
| Already applied | "Already saved. Safe to dismiss." |

### 4. Dispatcher rewire (`processQueue` + `handleOperationFailure`)

- Consume `OpResult`; stop passing `null`.
- `blocked` → existing side-channel path (no `retryCount++`).
- `terminal` → dead-letter **immediately**, `retryCount` untouched, `lastError` set
  from the classifier.
- `retry` → `retryCount++`, set `lastError` *every* attempt (so a mid-flight op can
  already report a cause, not just at dead-letter).
- `success` → clear `slowModeRetryCount` (never reset today — a recovered op keeps a
  consumed reprieve budget permanently).

### 5. Retry pacing

- Add `nextAttemptAtMs`; `getReadyOperations()` skips ops whose backoff hasn't
  elapsed. This is what makes backoff *real* — currently computed then bypassed.
- `MAX_RETRY_ATTEMPTS` 10 → 5. **Only safe after the above**, because it will finally
  apply solely to genuinely transient failures.
- `UNKNOWN_ERROR_MAX_ATTEMPTS = 3` for unclassified errors.
- Slow-mode reprieve preserved (it's correct for real bad-WiFi) but only reachable
  from `retry`, never from `terminal`.

### 6. UI

`describeCause` gains the new codes; `deriveSubtitle` appends the remedy.
`isRetryable` keys off `outcome: 'terminal'` rather than guessing from `MAX_RETRIES`,
so dead Retry buttons disappear. `onOperationFailed` already pushes into
`useSyncStatusStore` for item-bound ops — it starts carrying a real message.

## Steps

- [ ] 1. `OpResult` type + `classifyError` + remedy table (+ unit tests for the
      classifier: Postgres string codes, HTTP numerics, idempotent-success shapes)
- [ ] 2. Dispatcher: consume `OpResult`, thread `lastError`, clear `slowModeRetryCount`
- [ ] 3. Replace top-level `catch` at `offlineSyncInit.ts:3882` with classified result
      (single highest-value change — unblocks reporting for all 30 handlers at once)
- [ ] 4. Convert handlers in batches, verifying after each:
      (a) payments + preauth + refund, (b) items, (c) order/check/session, (d) rest
- [ ] 5. Convert dependency-wait `return false` sites → `blocked`
- [ ] 6. UI: cause + remedy in `OrderSyncBanner` and per-item chip
- [ ] 7. Retry pacing: `nextAttemptAtMs`, constants retune
- [ ] 8. `npx tsc --noEmit` + `npm test`

## Verification

- Existing suites must stay green: `offlineSyncBlocking`, `offlineSyncOwnershipShortCircuit`,
  `offlineSyncRetryDrop`, `offlineSyncSubtitles`. Note `offlineSyncOwnershipShortCircuit`
  asserts on the *source string* `'const permanent = error && !isTransientError(error)'`
  — that line is being replaced, so the test must be updated to assert the new
  behavior rather than the old text.
- New classifier tests for each terminal/transient/idempotent class.
- `__seedDeadLetter` dev helper to eyeball banner copy without burning retries.

**I cannot verify on-device.** Typecheck + tests prove the logic; real terminal/
printer/bad-WiFi behavior needs your tablet. I'll state plainly what was and wasn't
verified.

## Risk

Payment handlers are the dangerous surface — a mis-parsed error could turn a real
failure into a discarded payment. Mitigation: payment paths keep their existing
explicit checks (`check_recent_payment`, journal complete/fail) untouched; the
classifier only replaces the *retry-vs-dead-letter decision*, never the
duplicate-charge guards. Payments are batch (a) so they get scrutiny while context
is freshest.

## Review

### Done

- `lib/network/opResult.ts` (new) — `OpResult` type, `classifyError`, remedy table.
- Dispatcher (`offlineSyncService.ts`) — consumes `OpResult`; terminal failures
  dead-letter on attempt 1; `lastError` set on every attempt and no longer
  overwritten with the `MAX_RETRIES` placeholder; `nextAttemptAtMs` makes backoff
  real; `MAX_RETRY_ATTEMPTS` 10 → 5; `slowModeRetryCount` cleared on manual retry;
  fixed a leaked 30s timer per attempt in `executeWithTimeout`.
- Executor (`offlineSyncInit.ts`) — top-level `catch` now classifies instead of
  returning bare `false`; payments, items, discounts, check-status converted;
  dependency waits return `blocked` instead of burning retries.
- UI — bill banner, per-item chip, **settings → Syncing** (both panels) now show
  cause + remedy; `Retry` hidden on terminal ops; blocked ops explain what
  they're waiting for.

### Verified

- `npx tsc --noEmit` — clean.
- `npm test` — **1382 passed, 30 failed**. The 30 failures are in 11 suites that
  fail **identically on a clean stash** (confirmed by stashing and re-running):
  order-calculator, connectionQuality, paymentService.idempotency, wave22/24/26,
  hydrateWorkspaceFlipAway, clearTableServedTransition, tableReopenCheckWiring,
  broadcastMergeStationId, useOnlineOrderActions. Pre-existing drift, not caused
  by this work. Net: **+28 new passing tests, 0 regressions**.
- `npx eslint` on changed files — 0 errors (30 pre-existing warnings in untouched
  regions of the two large files).
- `offlineSyncOwnershipShortCircuit.test.ts` updated: it asserted on the literal
  source text of the line this work replaced. Rewrote those two assertions
  against the new expression and added a behavioral test alongside.

### NOT verified — needs the device

Everything above is static + unit-level. None of this has run against a real
backend, terminal, or bad-WiFi tablet. Specifically unproven:
- Real Supabase error shapes matching the classifier's assumptions (the taxonomy
  is built from the codes handled in this repo, not from captured prod payloads).
- Payment replay under genuine network loss.
- Banner/panel layout with real copy at tablet scale.

Suggested first check: `__seedDeadLetter({ type: 'add_item', localOrderId: 'order_x',
lastError: { code: 'INVALID_INPUT', message: 'bad enum' } })` from the Metro
console, then open settings → Syncing.

### Deliberately not done

- Remaining ~20 lower-traffic handlers (preauth, refund, loyalty, coursing,
  drawer, session) still return `boolean`. They are **not broken** — the legacy
  bridge maps `false → retry`, and the top-level `catch` already classifies their
  thrown errors, so they benefit from the fix without conversion. Converting them
  is mechanical follow-up, best done when someone is next in that code.
- O(n²) `pendingOperations.find()` scans inside `areDependenciesSatisfied` /
  `findCollapseTarget`. Real at the 500-op cap, but a perf issue, not a
  correctness one — bundling it here would have widened the blast radius.
