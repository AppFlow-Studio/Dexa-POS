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

export type HeaderReconcileOutcome =
  | 'skipped_disabled'           // Feature flag off
  | 'skipped_no_dbid'            // Order has no db_order_id (draft, never synced)
  | 'skipped_terminal'           // Order is in a terminal state we don't bother refreshing
  | 'skipped_cooldown'           // Within 30s cooldown window
  | 'skipped_pending_updates'    // pendingBackendUpdates is fresh; let it flush first
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

/**
 * Reconcile the header of every active order in the store. Iterates over
 * `ordersById` (NOT `persistableOrderIds`, which can exclude read-only
 * displayed orders) and applies the terminal-state filter. A 200ms throttle
 * between calls caps the burst at ~5 RPCs/sec.
 */
export async function reconcileAllActiveOrdersHeader (): Promise<
  HeaderReconcileResult[]
> {
  if (!isFlagEnabled()) return []
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrderStore } = require('@/stores/useOrderStore')
  const state = useOrderStore.getState()
  const orderIds = Object.keys(state.ordersById ?? {})

  const results: HeaderReconcileResult[] = []
  for (let i = 0; i < orderIds.length; i++) {
    const r = await reconcileOrderHeader(orderIds[i])
    results.push(r)
    // Throttle between RPCs to bound the burst load on get_order_details.
    if (i < orderIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, INTER_ORDER_DELAY_MS))
    }
  }
  return results
}
