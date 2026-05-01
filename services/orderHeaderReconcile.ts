/**
 * Wave 3.0d-5 — Order header reconcile (read-pull).
 *
 * Sibling to Wave 3.0f-3's cart-shape reconcile. Where cart-shape *pushes*
 * local→server for cart-shape mutations the operator owns (qty / modifiers /
 * void / presence), header reconcile *pulls* server→local for everything
 * else: kitchen statuses, payment status, paid_status, totals, refunds,
 * order-level status. Server is authoritative for those slices regardless of
 * who owns the cart, so we DO NOT gate on ownership.
 *
 * The merge engine itself already exists in
 * `useOrderStore.syncOrderFromBackendComplete(orderId)` — that function calls
 * `get_order_details`, applies kitchen/payment/paid_status rank guards,
 * preserves locally-advanced state, respects in-flight sync_status, and
 * writes via a plain set() mutation (not the broadcast envelope path). The
 * gap was purely the trigger: none of its 22 callsites fired on
 * connectivity recovery or AppState foreground.
 *
 * This module is a thin trigger + driver wrapper around that function.
 *
 * Dark-shipped behind EXPO_PUBLIC_ORDER_HEADER_RECONCILE=1.
 */

import { runWithDeadline } from '@/lib/network/runWithDeadline'
import { DEADLINES } from '@/lib/network/deadlines'

export type HeaderReconcileOutcome =
  | 'skipped_disabled'           // Feature flag off
  | 'skipped_no_dbid'            // Order has no db_order_id (draft, never synced)
  | 'skipped_terminal'           // Order is in a terminal state we don't bother refreshing
  | 'skipped_cooldown'           // Within 30s cooldown window
  | 'skipped_pending_updates'    // pendingBackendUpdates is fresh; let it flush first
  | 'skipped_fresh_bulk'         // Order was just hydrated by useOrdersQuery's bulk fetch
  | 'skipped_no_drift'           // Bulk summary RPC reported no drift vs local state
  | 'skipped_summary_failed'     // Bulk summary RPC errored — defer to next trigger
  | 'reconciled'                 // syncOrderFromBackendComplete was called and resolved
  | 'sync_failed'                // The inner sync threw

export interface HeaderReconcileResult {
  orderId: string
  outcome: HeaderReconcileOutcome
  error?: string
}

/**
 * Per-order rate limit. The wrapper cooldown is independent of (and longer
 * than) syncOrderFromBackendComplete's own 5s cooldown, so we don't double-
 * fire on the same trigger event.
 */
const RECONCILE_COOLDOWN_MS = 30_000

/**
 * Throttle between RPCs in the batch loop. For 30 orders, this caps the
 * burst at ~5 RPCs/sec (~6s end-to-end), keeping `get_order_details` (which
 * does 8 correlated subqueries per call) from saturating the Postgres pool
 * on a busy tablet foregrounding.
 */
const INTER_ORDER_DELAY_MS = 200

/**
 * If pendingBackendUpdates[orderId] is fresher than this, defer reconcile
 * (let the queued update flush first). Older than this and we reconcile
 * anyway — the queued update has probably dead-lettered and would otherwise
 * starve reconcile indefinitely.
 */
const PENDING_UPDATES_AGE_ESCAPE_MS = 60_000

/**
 * Orders hydrated by useOrdersQuery's bulk fetch within this window are
 * treated as already-fresh — reconcile would just re-fetch identical data.
 * useOrdersQuery already pulls items + payments + modifiers + discounts in
 * one round-trip on cold start; firing get_order_details for every order
 * 5 seconds later (when AppState/connection triggers fire) is the dominant
 * source of the per-order RPC storm. Drift writers (realtime updates,
 * pendingBackendUpdates enqueue) clear this stamp so this gate doesn't
 * suppress legitimate drift.
 */
const BULK_FETCH_FRESHNESS_MS = 90_000

const lastReconcileAt: Map<string, number> = new Map()

/**
 * Test seam — clears the per-order cooldown map so unit tests don't see
 * stale timestamps from earlier cases.
 */
export function _resetOrderHeaderReconcileForTests (): void {
  lastReconcileAt.clear()
}

function isFlagEnabled (): boolean {
  return (
    process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE === '1' ||
    process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE === 'true'
  )
}

function isReconcilable (order: any): boolean {
  if (!order) return false
  if (!order.db_order_id) return false
  // Voided / cancelled orders have nothing useful left to reconcile.
  if (order.order_status === 'voided' || order.order_status === 'cancelled') {
    return false
  }
  // Closed + fully Paid orders are terminal; broadcasts don't fire for them.
  if (order.order_status === 'closed' && order.paid_status === 'Paid') {
    return false
  }
  return true
}

/**
 * Pull server-authoritative slices for one order. Returns immediately with
 * a skipped-* outcome when gates fire; otherwise awaits the inner sync.
 */
export async function reconcileOrderHeader (
  orderId: string,
  options: { force?: boolean } = {}
): Promise<HeaderReconcileResult> {
  const { force = false } = options

  if (!isFlagEnabled()) {
    return { orderId, outcome: 'skipped_disabled' }
  }

  // Lazy-import to avoid circular deps with the order store.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrderStore } = require('@/stores/useOrderStore')
  const state = useOrderStore.getState()
  const order = state.ordersById?.[orderId]

  if (!order) {
    return { orderId, outcome: 'skipped_no_dbid' }
  }
  if (!order.db_order_id) {
    return { orderId, outcome: 'skipped_no_dbid' }
  }
  if (!isReconcilable(order)) {
    return { orderId, outcome: 'skipped_terminal' }
  }

  // Defer when there's a fresh queued local update — the queued update will
  // flush via its own path and broadcast back. Reconcile would race it.
  const queued = state.pendingBackendUpdates?.[orderId]
  if (queued && !force) {
    const age = Date.now() - (queued.timestamp ?? 0)
    if (age < PENDING_UPDATES_AGE_ESCAPE_MS) {
      return { orderId, outcome: 'skipped_pending_updates' }
    }
    // else: the queued update has been stuck for too long — probably dead-
    // lettered. Don't let it starve reconcile; proceed.
  }

  // Skip if useOrdersQuery's bulk fetch just delivered this order.
  // Realtime ingestion and pendingBackendUpdates enqueue clear the stamp,
  // so this only fires for orders that haven't drifted since the bulk fetch.
  if (!force) {
    const lastBulk = order._lastBulkFetchAt ?? 0
    if (lastBulk > 0 && Date.now() - lastBulk < BULK_FETCH_FRESHNESS_MS) {
      return { orderId, outcome: 'skipped_fresh_bulk' }
    }
  }

  if (!force) {
    const last = lastReconcileAt.get(orderId) ?? 0
    if (Date.now() - last < RECONCILE_COOLDOWN_MS) {
      return { orderId, outcome: 'skipped_cooldown' }
    }
  }
  lastReconcileAt.set(orderId, Date.now())

  try {
    await state.syncOrderFromBackendComplete(orderId)
    return { orderId, outcome: 'reconciled' }
  } catch (err: any) {
    if (__DEV__) {
      console.warn('[orderHeaderReconcile] sync failed', {
        orderId,
        err: err?.message ?? err
      })
    }
    return {
      orderId,
      outcome: 'sync_failed',
      error: err?.message ?? String(err)
    }
  }
}

interface OrderSummaryRow {
  id: string
  updated_at: string | null
  sync_version: number | null
  status: string | null
  payment_status: string | null
  check_status: string | null
}

/**
 * Map server payment_status enum to local OrderProfile.paid_status.
 * Local uses Title-Cased strings; DB uses lowercase enums. We do a
 * case-insensitive compare to side-step the divergence without committing
 * to a brittle full mapping table — only used for drift detection.
 */
function statusFieldsMatch (
  server: OrderSummaryRow,
  local: any
): boolean {
  const eq = (a: any, b: any): boolean => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    return String(a).toLowerCase() === String(b).toLowerCase()
  }
  return (
    eq(server.status, local.order_status) &&
    eq(server.payment_status, local.paid_status) &&
    eq(server.check_status, local.check_status)
  )
}

/**
 * Decide whether server summary differs from local state enough to justify
 * a full get_order_details refetch.
 *
 * Primary signal: sync_version. Bumped on every server mutation, so a
 * difference is a guaranteed drift indicator (and equality is a guaranteed
 * no-drift indicator for the rows the version covers).
 *
 * Secondary signal: status fields. Cheap to compare and catches drift the
 * sync_version can miss (e.g. denormalized payment status from a refund
 * trigger that didn't bump sync_version).
 */
function hasDrift (server: OrderSummaryRow, local: any): boolean {
  const localVersion = local.sync_version ?? null
  const serverVersion = server.sync_version ?? null
  if (localVersion != null && serverVersion != null) {
    if (serverVersion !== localVersion) return true
  } else {
    // Fall back to updated_at when either side lacks sync_version. Treat
    // updated_at-newer-than-local as drift; equal-or-older means no drift.
    const lt = local.updated_at ? Date.parse(local.updated_at) : 0
    const st = server.updated_at ? Date.parse(server.updated_at) : 0
    if (Number.isFinite(lt) && Number.isFinite(st) && st > lt + 500) {
      return true
    }
  }
  return !statusFieldsMatch(server, local)
}

interface CandidateGate {
  orderId: string
  outcome: HeaderReconcileOutcome | null
  order: any
}

/**
 * Apply per-order skip filters (mirrors reconcileOrderHeader's gates) without
 * firing the inner sync. Used by the bulk path to filter to a candidate set
 * before issuing the summary RPC.
 */
function gateCandidate (
  orderId: string,
  state: any
): CandidateGate {
  const order = state.ordersById?.[orderId]
  if (!order) return { orderId, outcome: 'skipped_no_dbid', order: null }
  if (!order.db_order_id) {
    return { orderId, outcome: 'skipped_no_dbid', order }
  }
  if (!isReconcilable(order)) {
    return { orderId, outcome: 'skipped_terminal', order }
  }
  const queued = state.pendingBackendUpdates?.[orderId]
  if (queued) {
    const age = Date.now() - (queued.timestamp ?? 0)
    if (age < PENDING_UPDATES_AGE_ESCAPE_MS) {
      return { orderId, outcome: 'skipped_pending_updates', order }
    }
  }
  const lastBulk = order._lastBulkFetchAt ?? 0
  if (lastBulk > 0 && Date.now() - lastBulk < BULK_FETCH_FRESHNESS_MS) {
    return { orderId, outcome: 'skipped_fresh_bulk', order }
  }
  const last = lastReconcileAt.get(orderId) ?? 0
  if (Date.now() - last < RECONCILE_COOLDOWN_MS) {
    return { orderId, outcome: 'skipped_cooldown', order }
  }
  return { orderId, outcome: null, order }
}

/**
 * Reconcile the header of every active order in the store using a single
 * bulk drift-check RPC.
 *
 * Strategy:
 *   1. Apply local gates (terminal/cooldown/pending/fresh-bulk) to filter
 *      to a candidate set without firing any RPCs.
 *   2. One `reconcile_orders_summary` RPC returns sync_version + status
 *      fields for all candidates (~60 bytes/order vs. ~3-10KB for the
 *      full per-order RPC).
 *   3. Compare each candidate against its server summary. Only orders that
 *      actually drifted get the full `syncOrderFromBackendComplete` pass.
 *   4. Mark cooldown for ALL candidates (drifted or not) so the next
 *      trigger doesn't re-issue the summary RPC immediately.
 *
 * For 100 orders with no drift, this collapses ~100 heavyweight RPCs into
 * 1 lightweight one. With drift on a handful of orders, only those incur
 * the full per-order fetch.
 *
 * Falls back to per-order behavior on RPC errors: candidates get
 * `skipped_summary_failed`, and the next trigger event will retry.
 */
export async function reconcileAllActiveOrdersHeader (): Promise<
  HeaderReconcileResult[]
> {
  if (!isFlagEnabled()) return []
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrderStore, getOrderStoreSupabaseClient } = require(
    '@/stores/useOrderStore'
  )
  const state = useOrderStore.getState()
  const orderIds = Object.keys(state.ordersById ?? {})
  const results: HeaderReconcileResult[] = []

  // Step 1 — local gating. Fast, in-memory.
  const candidates: { orderId: string; order: any }[] = []
  for (const orderId of orderIds) {
    const gated = gateCandidate(orderId, state)
    if (gated.outcome != null) {
      results.push({ orderId: gated.orderId, outcome: gated.outcome })
    } else {
      candidates.push({ orderId: gated.orderId, order: gated.order })
    }
  }

  if (candidates.length === 0) return results

  // Step 2 — single bulk RPC for all candidates.
  const supabase = getOrderStoreSupabaseClient()
  if (!supabase) {
    for (const { orderId } of candidates) {
      results.push({ orderId, outcome: 'skipped_summary_failed' })
    }
    return results
  }

  const dbOrderIds = candidates.map(c => c.order.db_order_id)

  let summaryRows: OrderSummaryRow[] = []
  try {
    const { data, error } = await runWithDeadline<OrderSummaryRow[]>(
      'reconcile_orders_summary',
      DEADLINES.read,
      async (signal: AbortSignal) =>
        await supabase
          .rpc('reconcile_orders_summary', { p_order_ids: dbOrderIds })
          .abortSignal(signal)
    )
    if (error) throw error
    summaryRows = data ?? []
  } catch (err: any) {
    if (__DEV__) {
      console.warn('[orderHeaderReconcile] summary RPC failed', {
        candidateCount: candidates.length,
        err: err?.message ?? err
      })
    }
    for (const { orderId } of candidates) {
      results.push({ orderId, outcome: 'skipped_summary_failed' })
    }
    return results
  }

  const summaryByDbId = new Map<string, OrderSummaryRow>()
  for (const row of summaryRows) {
    if (row?.id) summaryByDbId.set(row.id, row)
  }

  // Step 3 — drift check + selective full sync. Mark cooldown for ALL
  // candidates so we don't re-issue the summary RPC on the next debounced
  // trigger; only orders that actually drifted incur a full RPC.
  const drifted: { orderId: string; order: any }[] = []
  const now = Date.now()
  for (const { orderId, order } of candidates) {
    lastReconcileAt.set(orderId, now)
    const serverRow = summaryByDbId.get(order.db_order_id)
    if (!serverRow) {
      // Order isn't in the server response (deleted? RLS-filtered?). Treat
      // as no-drift here — actual deletion is handled by separate broadcast
      // listeners; we don't want to fire get_order_details on a missing row.
      results.push({ orderId, outcome: 'skipped_no_drift' })
      continue
    }
    if (hasDrift(serverRow, order)) {
      drifted.push({ orderId, order })
    } else {
      results.push({ orderId, outcome: 'skipped_no_drift' })
    }
  }

  // Step 4 — full per-order sync for drifted orders only, with the same
  // 200ms throttle the legacy loop used.
  for (let i = 0; i < drifted.length; i++) {
    const { orderId } = drifted[i]
    try {
      await state.syncOrderFromBackendComplete(orderId)
      results.push({ orderId, outcome: 'reconciled' })
    } catch (err: any) {
      if (__DEV__) {
        console.warn('[orderHeaderReconcile] sync failed', {
          orderId,
          err: err?.message ?? err
        })
      }
      results.push({
        orderId,
        outcome: 'sync_failed',
        error: err?.message ?? String(err)
      })
    }
    if (i < drifted.length - 1) {
      await new Promise(resolve => setTimeout(resolve, INTER_ORDER_DELAY_MS))
    }
  }

  if (__DEV__) {
    console.log('[orderHeaderReconcile] bulk reconcile complete', {
      total: orderIds.length,
      candidates: candidates.length,
      drifted: drifted.length,
      summarySize: summaryRows.length
    })
  }

  return results
}
