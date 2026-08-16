/**
 * Offline-sync failure model.
 *
 * The queue previously had none: `executeQueuedOperation` returned
 * `Promise<boolean>`, which cannot distinguish the four things that actually
 * happen to a queued operation. Everything downstream — retry pacing,
 * dead-lettering, the operator-facing banner — was reasoning about a single
 * `false`, and the dispatcher passed `null` as the error, so
 * `handleOperationFailure` classified EVERY failure as transient and every
 * dead-letter reported the retry counter ("Failed 10 times") instead of a cause.
 *
 * This module is the single source of truth for:
 *   1. What outcomes an operation can have               → `OpResult`
 *   2. How a raw backend error maps to one               → `classifyError`
 *   3. What the operator should DO about it              → `remedy`
 *
 * It replaces ~8 hand-written per-error-code escape hatches that were added
 * one at a time in response to production infinite-retry loops (`P0005`,
 * `23505`, `22P02`, "already paid", "already voided", "already closed",
 * "no unpaid items remaining").
 *
 * Pure functions. No I/O, no React, no store access — safe to unit test and
 * safe to import from both the service and the UI layer.
 */

import { isOwnershipError } from '@/lib/orderAccessControl'

// ============================================================================
// RESULT TYPE
// ============================================================================

/**
 * The outcome of executing one queued operation.
 *
 * - `success`  — backend state now matches intent. Remove from queue.
 *                Also used for idempotent no-ops (already applied): the
 *                desired state holds, which is what "success" means here.
 * - `blocked`  — prerequisites unmet (e.g. waiting on create_order). NOT a
 *                failure: the retry budget must not be charged, or an item op
 *                can dead-letter while its parent order is still syncing fine.
 * - `terminal` — the server rejected this permanently. Replaying the identical
 *                payload will fail identically. Dead-letter immediately.
 * - `retry`    — transient (network, 5xx, contention). Worth another attempt.
 */
export type OpResult =
  | { outcome: 'success'; detail?: string }
  | { outcome: 'blocked'; reason: string }
  | { outcome: 'terminal'; code: string; message: string; remedy: string }
  | { outcome: 'retry'; code: string; message: string; remedy: string }

/** Convenience constructors — keep handler call sites terse and consistent. */
export const OpOk = (detail?: string): OpResult => ({ outcome: 'success', detail })

export const OpBlocked = (reason: string): OpResult => ({
  outcome: 'blocked',
  reason
})

export const OpTerminal = (
  code: string,
  message: string,
  remedyText?: string
): OpResult => ({
  outcome: 'terminal',
  code,
  message,
  remedy: remedyText ?? remedyFor(code)
})

export const OpRetry = (
  code: string,
  message: string,
  remedyText?: string
): OpResult => ({
  outcome: 'retry',
  code,
  message,
  remedy: remedyText ?? remedyFor(code)
})

// ============================================================================
// ERROR CODE TAXONOMY
// ============================================================================

/**
 * Postgres SQLSTATE codes that are PERMANENT for a replayed operation.
 *
 * Critical detail: Supabase's `PostgrestError.code` is a STRING ("23503"),
 * not a number. The previous `isTransientError` only inspected `status` when
 * `typeof status === 'number'`, so every Postgres error fell through to its
 * `return true` default — making Postgres rejections structurally incapable of
 * being classified permanent. That is the mechanical reason a bad enum value
 * or an FK violation retried 44 times.
 */
const TERMINAL_PG_CODES: Record<string, string> = {
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23502': 'NOT_NULL_VIOLATION',
  '23514': 'CHECK_VIOLATION',
  '22P02': 'INVALID_INPUT',
  '22003': 'NUMERIC_OUT_OF_RANGE',
  '42501': 'PERMISSION_DENIED',
  '42703': 'UNDEFINED_COLUMN',
  '42883': 'UNDEFINED_FUNCTION',
  P0005: 'ORDER_MATH_INCONSISTENT'
}

/**
 * Postgres codes that are TRANSIENT — worth retrying.
 * `40001` (serialization_failure) is how `_idempotency_claim` surfaces an
 * in-flight duplicate claim; it resolves once the other attempt settles.
 */
const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure / idempotency_in_flight
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '57014', // query_canceled (statement timeout)
  '08000', // connection_exception
  '08006' // connection_failure
])

/**
 * Message fragments meaning "the desired state already holds".
 *
 * These are SUCCESS, not failure. A queued op replaying after its response was
 * lost, or another station getting there first, both land here — the intent is
 * satisfied either way. Folding these in is what removes the scattered
 * per-handler escape hatches.
 */
const IDEMPOTENT_SUCCESS_FRAGMENTS = [
  'already paid',
  'already been paid',
  'fully paid',
  'no unpaid items remaining',
  'already voided',
  'already closed',
  'check is closed',
  'already open',
  'not closed',
  'already freed',
  'already applied',
  'already exists',
  'duplicate key value'
]

/** Message fragments indicating a transport-level failure. */
const TRANSIENT_MESSAGE_FRAGMENTS = [
  'network',
  'timeout',
  'timed out',
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'fetch failed',
  'failed to fetch',
  'socket hang up',
  'aborted',
  'offline',
  'unreachable',
  'idempotency_in_flight'
]

/**
 * Message fragments indicating the row is simply gone. Permanent for a replay:
 * the target no longer exists, so the operation can never apply.
 */
const NOT_FOUND_FRAGMENTS = [
  'not found',
  'does not exist',
  'no rows returned',
  'no such order',
  'no such item'
]

// ============================================================================
// REMEDIES — the "how do I solve it" half of the report
// ============================================================================

/**
 * Operator-facing remediation for a code. Written for a server or cook mid-shift:
 * one clause, an action they can actually take, no jargon and no internals.
 */
const REMEDIES: Record<string, string> = {
  // Permanent — needs a human decision
  FOREIGN_KEY_VIOLATION:
    'Something it links to is missing. Refresh the order, then re-add.',
  NOT_NULL_VIOLATION: 'Some required detail is missing. Re-enter it and try again.',
  CHECK_VIOLATION: 'The server rejected these values. Edit the item and try again.',
  INVALID_INPUT: 'One of the values is invalid. Edit the item and try again.',
  NUMERIC_OUT_OF_RANGE: 'An amount is out of range. Check the price or quantity.',
  PERMISSION_DENIED: 'You lack permission. Ask a manager, or log out and back in.',
  UNDEFINED_COLUMN: 'App/server version mismatch. Report this to support.',
  UNDEFINED_FUNCTION: 'App/server version mismatch. Report this to support.',
  ORDER_MATH_INCONSISTENT:
    "The order's totals don't add up. Reopen the check to rebuild them.",
  NOT_FOUND: 'It no longer exists — likely voided on another station. Refresh.',
  KITCHEN_ITEMS_UNRESOLVED:
    'Those items did not reach the kitchen. Re-fire them from the order.',
  KITCHEN_STATUS_PARTIAL_UPDATE:
    'Some kitchen rows changed elsewhere. Refresh before retrying.',
  KITCHEN_TRACE_CONTRACT_MISMATCH:
    'App/server contract mismatch. Ask support to verify the KDS migration.',
  KITCHEN_NO_ACTIVE_ROUTE:
    'No KDS destination accepted these items. Check displays and routing.',
  OWNERSHIP_REJECTED: 'Another station owns this order. Take it over there first.',
  VALIDATION_REJECTED: 'The server rejected this. Edit the item, or remove it.',
  AUTH_EXPIRED: 'Your session expired. Log out and back in.',
  CONFLICT: 'Another station changed this first. Refresh, then redo it.',
  SCHEMA_VERSION_MISMATCH: 'This action is from an older app version. Redo it.',

  // Transient — usually resolves itself
  SERVER_ERROR: 'Server problem, not your device. It will retry automatically.',
  RATE_LIMITED: 'Too many requests. It will retry automatically.',
  NETWORK: 'Waiting for a better connection — no action needed.',
  TIMEOUT: 'The network is slow. It will retry automatically.',
  CONTENTION: 'Another station is editing this. It will retry automatically.',
  DEADLINE_EXCEEDED: 'Waiting for a better connection — no action needed.',
  SUSTAINED_BAD_WIFI: 'WiFi never recovered. Check the connection, then Retry.',

  // Queue-internal
  MAX_RETRIES: 'It kept failing. Tap Retry, or Remove if it is no longer needed.',
  UNSPECIFIED: 'Tap Retry. If it keeps failing, remove it and redo it.',
  UNKNOWN_ERROR: 'Unexpected problem. Tap Retry, or Remove and redo it.',
  BLOCK_COUNT_EXCEEDED: 'It never got what it was waiting for. Redo this action.',
  BLOCKED_PARENT_DEAD: 'A step before this failed. Fix that one first.',
  OPERATION_TTL_EXCEEDED: 'Too old to apply safely. Redo it if still needed.',
  ALREADY_APPLIED: 'Already saved. Safe to dismiss.'
}

/** Look up a remedy, falling back to a generic-but-actionable line. */
export function remedyFor (code: string | undefined): string {
  if (!code) return REMEDIES.UNSPECIFIED
  if (REMEDIES[code]) return REMEDIES[code]
  if (/^5\d{2}$/.test(code)) return REMEDIES.SERVER_ERROR
  if (/^4\d{2}$/.test(code)) return REMEDIES.VALIDATION_REJECTED
  return REMEDIES.UNSPECIFIED
}

// ============================================================================
// CLASSIFIER
// ============================================================================

function messageOf (error: any): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  return String(error.message ?? error.msg ?? error.error_description ?? error.error ?? '')
}

function containsAny (haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n))
}

/**
 * Map a raw error from Supabase / Postgres / fetch / a thrown JS Error onto an
 * `OpResult`.
 *
 * Ordering matters and is deliberate:
 *   1. Ownership   — a specific business rejection that must never retry.
 *   2. Idempotent  — "already done" is success; check BEFORE treating a
 *                    unique-violation as an error.
 *   3. Explicit PG codes, then HTTP status, then message shape.
 *   4. Unknown     — retry, but the caller applies a SHORT budget so an
 *                    unclassified permanent error costs ~3 attempts, not 44.
 *
 * Defaults to `retry` (never `terminal`) for genuinely unrecognized input:
 * wrongly retrying is recoverable, wrongly discarding an operator's work is not.
 */
export function classifyError (error: any, context?: { opType?: string }): OpResult {
  const message = messageOf(error)
  const lower = message.toLowerCase()

  // 1. Ownership — permanent, and has dedicated operator copy.
  if (isOwnershipError(null, error)) {
    return OpTerminal(
      'OWNERSHIP_REJECTED',
      message || 'Order owned by another station'
    )
  }

  const rawCode = error?.code ?? error?.status ?? error?.statusCode ?? error?.httpStatus
  const code = rawCode === undefined || rawCode === null ? '' : String(rawCode)

  // 2. Idempotent success — the desired state already holds.
  //    `23505` (unique violation) is the canonical "our write already landed".
  if (code === '23505' || containsAny(lower, IDEMPOTENT_SUCCESS_FRAGMENTS)) {
    return OpOk(`idempotent: ${message || code}`)
  }

  // 3a. Postgres terminal codes.
  if (TERMINAL_PG_CODES[code]) {
    return OpTerminal(TERMINAL_PG_CODES[code], message || `Postgres ${code}`)
  }

  // 3b. Postgres transient codes.
  if (TRANSIENT_PG_CODES.has(code)) {
    return OpRetry('CONTENTION', message || `Postgres ${code}`)
  }

  // 3c. P0001 — the generic RAISE EXCEPTION used by our RPCs for business-rule
  //     rejections. Not an infrastructure fault: replaying sends the identical
  //     payload into the identical rule. Terminal. (Idempotent "already…"
  //     variants were already captured as success in step 2.)
  if (code === 'P0001') {
    if (containsAny(lower, NOT_FOUND_FRAGMENTS)) {
      return OpTerminal('NOT_FOUND', message)
    }
    return OpTerminal('VALIDATION_REJECTED', message || 'Server rejected this action')
  }

  // 3d. HTTP status codes — numeric or numeric-string.
  const httpStatus = Number(code)
  if (Number.isFinite(httpStatus) && httpStatus >= 100 && httpStatus < 600) {
    if (httpStatus >= 500) return OpRetry('SERVER_ERROR', message || `HTTP ${httpStatus}`)
    if (httpStatus === 408) return OpRetry('TIMEOUT', message || 'Request timeout')
    if (httpStatus === 429) return OpRetry('RATE_LIMITED', message || 'Rate limited')
    if (httpStatus === 401 || httpStatus === 403) {
      return OpTerminal(
        httpStatus === 401 ? 'AUTH_EXPIRED' : 'PERMISSION_DENIED',
        message || `HTTP ${httpStatus}`
      )
    }
    if (httpStatus === 404) return OpTerminal('NOT_FOUND', message || 'Not found')
    if (httpStatus === 409) return OpTerminal('CONFLICT', message || 'Conflict')
    if (httpStatus >= 400) {
      return OpTerminal('VALIDATION_REJECTED', message || `HTTP ${httpStatus}`)
    }
  }

  // 4. Message-shape fallbacks (errors with no usable code).
  if (containsAny(lower, TRANSIENT_MESSAGE_FRAGMENTS)) {
    const isTimeout = lower.includes('timeout') || lower.includes('timed out')
    return OpRetry(isTimeout ? 'TIMEOUT' : 'NETWORK', message)
  }

  if (containsAny(lower, NOT_FOUND_FRAGMENTS)) {
    return OpTerminal('NOT_FOUND', message)
  }

  // 5. Unrecognized. Retry — but the dispatcher gives UNKNOWN_ERROR a short
  //    budget, so a permanent-but-unclassified error surfaces in ~3 attempts.
  return OpRetry(
    'UNKNOWN_ERROR',
    message || `Unrecognized failure${context?.opType ? ` in ${context.opType}` : ''}`
  )
}

/**
 * Normalize a legacy `boolean` handler return into an `OpResult`.
 *
 * Handlers are converted in batches; until a given one is converted it still
 * returns boolean. `false` becomes `retry`/`UNSPECIFIED` — the pre-existing
 * behavior — so the refactor is never in a broken half-state.
 */
export function fromLegacyBoolean (ok: boolean): OpResult {
  return ok
    ? OpOk()
    : OpRetry('UNSPECIFIED', 'Operation reported failure without a reason')
}

/** True when the result should charge the retry budget. */
export function chargesRetryBudget (result: OpResult): boolean {
  return result.outcome === 'retry'
}

/**
 * Codes that get a shortened retry budget. An unclassified error is retried in
 * case it's a blip, but must not burn the full budget on what may be permanent.
 */
export const SHORT_BUDGET_CODES = new Set(['UNKNOWN_ERROR', 'UNSPECIFIED'])
