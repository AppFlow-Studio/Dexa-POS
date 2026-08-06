/**
 * Wave 3.0e — operator-facing subtitle helpers for dead-lettered ops.
 *
 * Pure functions, no React, no I/O. Single source of truth used by both:
 *   - per-item Retry chip on `components/bill/BillItem.tsx` (3.0e-1)
 *   - order-level OrderSyncBanner (3.0e-2)
 *
 * Subtitle copy is intentionally specific (attempt count + relative time +
 * root cause) so a server / cook can decide between Retry, edit, or escalate
 * without leaving the order processing screen.
 */

import { remedyFor } from '@/lib/network/opResult'
import type { OfflineOperation, OperationType } from '@/services/offlineSyncService'

// Item-bound op types — surface on per-item Retry chip via useSyncStatusStore.
export const ITEM_BOUND_OPS: ReadonlySet<OperationType> = new Set<OperationType>([
  'add_item',
  'update_item',
  'update_item_quantity',
  'replace_modifiers',
  'void_item',
  'remove_item',
  'update_item_status',
  'set_item_seat'
])

// Order-bound op types — surface on the inline OrderSyncBanner above the bill.
export const ORDER_BOUND_OPS: ReadonlySet<OperationType> = new Set<OperationType>([
  'send_to_kitchen',
  'close_check',
  'reopen_check',
  'update_order_status',
  'update_order_details',
  'fire_course',
  'apply_discount',
  'void_discount'
])

/**
 * Title for the per-item Retry chip / banner row. One short clause.
 */
export function deriveTitle (op: OfflineOperation): string {
  switch (op.type) {
    case 'add_item':
      return 'Add failed'
    case 'update_item':
    case 'update_item_quantity':
      return 'Item update failed'
    case 'replace_modifiers':
      return "Modifiers didn't save"
    case 'void_item':
    case 'remove_item':
      return "Remove didn't save"
    case 'update_item_status': {
      const status = (op.params as any)?.status as string | undefined
      switch (status) {
        case 'ready':
          return "Mark Ready didn't save"
        case 'served':
          return "Mark Served didn't save"
        case 'preparing':
          return "Mark Preparing didn't save"
        case 'sent':
          return "Send to Kitchen didn't save"
        default:
          return "Status update didn't save"
      }
    }
    case 'set_item_seat':
      return "Seat assignment didn't save"
    case 'send_to_kitchen':
      return 'Kitchen send pending'
    case 'close_check':
      return 'Closing check failed'
    case 'reopen_check':
      return 'Reopen check failed'
    case 'update_order_status':
      return "Order status didn't sync"
    case 'update_order_details':
      return "Customer details didn't save"
    case 'fire_course':
      return 'Course fire pending'
    case 'apply_discount':
      return "Discount didn't apply"
    case 'void_discount':
      return "Discount removal didn't save"
    default:
      return 'Sync pending'
  }
}

/**
 * Subtitle: root cause + attempt count + relative time.
 *
 * Format examples:
 *   "Network too slow — 10 attempts since 4:32pm"
 *   "Server rejected — needs review"
 *   "Failed 10 times — last try 2 min ago"
 */
export function deriveSubtitle (
  op: OfflineOperation,
  now: number = Date.now()
): string {
  const cause = describeCause(op)
  const attempts = describeAttempts(op, now)
  if (cause && attempts) return `${cause} — ${attempts}`
  return cause || attempts || 'Tap Retry'
}

/**
 * The action the operator should take, e.g. "Edit the item and try again, or
 * remove it." Rendered as a second line beneath the cause.
 *
 * Populated by `classifyError` at failure time. Falls back to a remedy derived
 * from the code so a line is always shown — an operator mid-shift needs to know
 * what to DO, not just that something broke.
 */
export function deriveRemedy (op: OfflineOperation): string {
  return op.lastError?.remedy ?? remedyFor(op.lastError?.code)
}

/**
 * Whether this op is still safe to retry. False for permanent server-side
 * rejections (4xx) — operator must edit or remove instead.
 */
export function isRetryable (op: OfflineOperation): boolean {
  // Authoritative: set by the classifier at failure time. Previously this
  // function had to guess from the code, and since every failure was labelled
  // `MAX_RETRIES` it always returned true — so permanently-rejected ops showed
  // a Retry button that could never succeed.
  if (op.isTerminal === true) return false

  const code = op.lastError?.code
  if (!code) return true
  // 4xx HTTP-shaped codes mean the server permanently rejected this op
  // (validation, auth, conflict). Retrying with the same payload won't help.
  if (/^4\d{2}$/.test(code)) return false
  // Permanent classes emitted by `classifyError`.
  if (
    code === 'VALIDATION_REJECTED' ||
    code === 'PERMISSION_DENIED' ||
    code === 'AUTH_EXPIRED' ||
    code === 'NOT_FOUND' ||
    code === 'CONFLICT' ||
    code === 'FOREIGN_KEY_VIOLATION' ||
    code === 'NOT_NULL_VIOLATION' ||
    code === 'CHECK_VIOLATION' ||
    code === 'INVALID_INPUT' ||
    code === 'NUMERIC_OUT_OF_RANGE' ||
    code === 'ORDER_MATH_INCONSISTENT' ||
    code === 'SCHEMA_VERSION_MISMATCH' ||
    // Retrying re-runs the same unresolvable item lookup. The operator must
    // re-fire the items from the order instead.
    code === 'KITCHEN_ITEMS_UNRESOLVED'
  ) {
    return false
  }
  // Postgres unique-violation = already applied. Retry is harmless but it
  // also means the op is effectively done — surface as retryable so the
  // user can dismiss the chip via tap.
  if (code === '23505') return true
  // Specific permanent classes we've seen in prod
  if (
    code === 'OWNERSHIP_REJECTED' ||
    code === 'BLOCK_COUNT_EXCEEDED' ||
    code === 'OPERATION_TTL_EXCEEDED' ||
    code === 'BLOCKED_PARENT_DEAD'
  ) {
    return false
  }
  // SUSTAINED_BAD_WIFI is technically retryable (network may have recovered
  // by the time the operator sees the chip), so leave it true. The user can
  // tap Retry; the next attempt will succeed if WiFi is back.
  return true
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Turn an internal block-reason slug into operator-readable text.
 *
 * A "BLOCKED" chip on its own tells the operator nothing — these reasons
 * explain what the operation is waiting for, which is almost always a parent
 * record that hasn't finished syncing.
 */
export function describeBlockReason (reason: string): string {
  switch (reason) {
    case 'order_not_synced':
    case 'order_id_unresolved':
      return 'the order to finish syncing'
    case 'item_not_synced':
    case 'no_local_order_id_for_item':
      return 'the item to finish syncing'
    case 'session_not_synced':
      return 'the table session to finish syncing'
    case 'staff_id_unavailable':
      return 'staff sign-in details'
    case 'supabase_client_unavailable':
      return 'the connection to finish starting up'
    default:
      return reason.replace(/_/g, ' ')
  }
}

/**
 * Short human cause for a failure ("Server rejected this", "Network
 * unavailable"). Exported so the settings → Syncing panel renders the exact
 * same wording as the inline bill banner — an operator should not have to
 * reconcile two different descriptions of the same failure.
 */
export function describeCause (op: OfflineOperation): string {
  const code = op.lastError?.code
  if (!code) return ''
  switch (code) {
    case 'DEADLINE_EXCEEDED':
      return 'Network too slow'
    case 'SUSTAINED_BAD_WIFI':
      return 'WiFi never recovered'
    case 'MAX_RETRIES':
      return `Failed ${op.retryCount} times`
    case 'PERMANENT':
      return 'Server rejected'
    case 'BLOCK_COUNT_EXCEEDED':
      return 'Stuck waiting on parent op'
    case 'OPERATION_TTL_EXCEEDED':
      return 'Op too old (24h+)'
    case 'BLOCKED_PARENT_DEAD':
      return 'Parent op failed'
    case 'OWNERSHIP_REJECTED':
      return 'Order owned by another station'
    case '23505':
    case 'ALREADY_APPLIED':
      return 'Already applied'
    // Codes emitted by `classifyError`. Without these the operator saw the
    // generic "Sync failed" for every one of them.
    case 'VALIDATION_REJECTED':
      return 'Server rejected this'
    case 'PERMISSION_DENIED':
      return 'Permission denied'
    case 'AUTH_EXPIRED':
      return 'Session expired'
    case 'NOT_FOUND':
      return 'No longer exists'
    case 'KITCHEN_ITEMS_UNRESOLVED':
      return 'Some items never reached the kitchen'
    case 'CONFLICT':
      return 'Changed on another station'
    case 'FOREIGN_KEY_VIOLATION':
      return 'Linked record missing'
    case 'NOT_NULL_VIOLATION':
      return 'Required detail missing'
    case 'CHECK_VIOLATION':
    case 'INVALID_INPUT':
      return 'Invalid value'
    case 'NUMERIC_OUT_OF_RANGE':
      return 'Amount out of range'
    case 'ORDER_MATH_INCONSISTENT':
      return "Order totals don't add up"
    case 'SCHEMA_VERSION_MISMATCH':
      return 'From an older app version'
    case 'SERVER_ERROR':
      return 'Server error'
    case 'RATE_LIMITED':
      return 'Server busy'
    case 'NETWORK':
      return 'Network unavailable'
    case 'TIMEOUT':
      return 'Timed out'
    case 'CONTENTION':
      return 'Another station is editing this'
    case 'UNKNOWN_ERROR':
    case 'UNSPECIFIED':
      return 'Unexpected problem'
    default:
      // Numeric HTTP-shaped codes
      if (/^5\d{2}$/.test(code)) return 'Server error'
      if (/^4\d{2}$/.test(code)) return 'Server rejected — review item'
      // Postgres serialization failure (in-flight idempotency claim)
      if (code === '40001') return 'Concurrent update — will retry'
      return 'Sync failed'
  }
}

function describeAttempts (op: OfflineOperation, now: number): string {
  const attempts = op.retryCount > 0 ? op.retryCount : 1
  const sinceMs =
    op.deadLetteredAtMs ?? new Date(op.timestamp).getTime()
  const rel = formatRelative(now - sinceMs)
  if (attempts === 1) return rel
  return `${attempts} attempts ${rel}`
}

/**
 * Render a delta as "since 4:32pm" for ≥ 1 hour, "X min ago" for < 1 hour,
 * "just now" for < 60 s. Keeps subtitle copy uniform.
 */
function formatRelative (deltaMs: number): string {
  if (deltaMs < 60_000) return 'just now'
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const date = new Date(Date.now() - deltaMs)
    const h = date.getHours() % 12 || 12
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ampm = date.getHours() >= 12 ? 'pm' : 'am'
    return `since ${h}:${mm}${ampm}`
  }
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
