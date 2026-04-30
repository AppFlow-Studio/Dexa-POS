/**
 * Wave 3.0f-3 — Cart-shape reconcile.
 *
 * "What I see is what happens." When connectivity recovers (slow→fast) or the
 * app foregrounds, we walk every owned draft order, diff the local cart shape
 * against the server, and queue the existing per-RPC ops to bring the server
 * in line with what the operator sees on the screen.
 *
 * Strict scoping (per Wave 3.0f plan):
 *   - Only acts on orders this station OWNS (station_id == null OR matches
 *     currentStationId). Other stations' orders are read-refreshed only —
 *     never pushed.
 *   - Only touches CART SHAPE (qty, presence, modifiers, void state). Totals,
 *     status, payments, refunds remain server-derived/append-only.
 *
 * Reuses every existing op type — no new server RPCs. The reconcile produces
 * the same write traffic the user would have produced if every original
 * RPC had succeeded.
 *
 * Dark-shipped behind EXPO_PUBLIC_CART_SHAPE_RECONCILE=1.
 */

import { isOrderReadOnly } from '@/lib/orderAccessControl'
import { OrderService } from '@/services/orderService'
import { queueOperation } from '@/services/offlineSyncService'
import type { CartItem } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReconcileResult {
  orderId: string
  outcome:
    | 'skipped_unowned'   // Owned by another station — read-refresh only
    | 'skipped_no_dbid'   // Order not yet created on server
    | 'skipped_no_diff'   // Local matches server, nothing to do
    | 'skipped_disabled'  // Feature flag off / no client / no station id
    | 'fetch_failed'      // Server fetch errored — bail safely
    | 'reconciled'        // One or more divergences queued
  divergences: number
  queuedOpIds: string[]
}

/**
 * Per-order rate limit. Reconciles fire on slow→fast and foreground events
 * which can both trigger within a short window — debounce so we don't double-
 * fetch.
 */
const RECONCILE_COOLDOWN_MS = 30_000
const lastReconcileAt: Map<string, number> = new Map()

/**
 * Module-scoped Supabase client setter. Keeps the reconcile pure (no React
 * imports) and matches the pattern used by useSeatingStore et al.
 */
let _supabaseClient: SupabaseClient | null = null
export function setCartShapeReconcileSupabaseClient (
  client: SupabaseClient | null
): void {
  _supabaseClient = client
}

/**
 * Test seam — clears the per-order cooldown map so unit tests don't see
 * stale timestamps from earlier cases.
 */
export function _resetCartShapeReconcileForTests (): void {
  lastReconcileAt.clear()
  _supabaseClient = null
}

interface ServerItemSnapshot {
  id: string
  quantity: number
  is_voided: boolean
  modifierFingerprint: string
}

interface ReconcileContext {
  orderId: string
  currentStationId: string | null
  /** Lazy access to avoid circular deps. */
  getOrder: () => any
}

function isFlagEnabled (): boolean {
  return (
    process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE === '1' ||
    process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE === 'true'
  )
}

/**
 * Stable hash of a modifier set. Same shape on local vs server → same string.
 */
function fingerprintModifiers (mods: any): string {
  if (!mods) return ''
  const flat: Array<{ k: string; v: number }> = []
  if (Array.isArray(mods)) {
    // Server-side shape: array of { modifier_item_id, modifier_group_name, ... }
    for (const m of mods) {
      const id =
        m?.modifier_item_id ??
        m?.id ??
        `${m?.modifier_group_name ?? ''}:${m?.modifier_name ?? ''}`
      flat.push({ k: String(id), v: Number(m?.quantity ?? 1) })
    }
  } else if (typeof mods === 'object') {
    // Local CartItem.customizations shape: { modifiers: [...], addOns: [...] }
    for (const group of mods.modifiers ?? []) {
      for (const opt of group.options ?? []) {
        flat.push({ k: `${group.categoryId}:${opt.id}`, v: opt.isNo ? 0 : 1 })
      }
    }
    for (const a of mods.addOns ?? []) {
      flat.push({ k: `addon:${a.id}`, v: 1 })
    }
  }
  flat.sort((a, b) => a.k.localeCompare(b.k))
  return flat.map(f => `${f.k}=${f.v}`).join('|')
}

function snapshotServerItems (rows: any[] | null | undefined): Map<string, ServerItemSnapshot> {
  const out = new Map<string, ServerItemSnapshot>()
  if (!rows) return out
  for (const row of rows) {
    if (!row?.id) continue
    out.set(row.id, {
      id: row.id,
      quantity: Number(row.quantity ?? 0),
      is_voided: Boolean(row.is_voided),
      modifierFingerprint: fingerprintModifiers(
        row.order_item_modifiers ?? row.modifiers
      )
    })
  }
  return out
}

function localItemFingerprint (item: CartItem): string {
  return fingerprintModifiers(item.customizations)
}

/**
 * Diff one local item against its server counterpart and queue the smallest
 * op that brings server in line with local. Returns the queued op id, or
 * null if no divergence.
 */
async function reconcileOneItem (
  ctx: ReconcileContext,
  local: CartItem,
  server: ServerItemSnapshot | undefined
): Promise<string | null> {
  // Item exists locally but not on server. Most likely an add_item that never
  // landed. Queue add_item via the existing op shape.
  if (!server) {
    if (!local.db_order_item_id) {
      // Not yet synced — queue add_item with full item data.
      return queueOperation({
        type: 'add_item',
        params: {
          itemData: local,
          localOrderId: ctx.orderId
        },
        localOrderId: ctx.orderId,
        localItemId: local.id
      })
    }
    // Has db_order_item_id but server doesn't show the row — possibly voided
    // by another station, or a sync race. Don't push; let broadcast / explicit
    // refresh sort it out.
    return null
  }

  // Quantity drift — the original symptom.
  if (Number(local.quantity ?? 0) !== server.quantity) {
    const { toUpdateQuantityKey } = require('@/lib/network/idempotencyKey')
    return queueOperation({
      type: 'update_item_quantity',
      params: {
        orderItemId: server.id,
        quantity: local.quantity,
        keyOverride: toUpdateQuantityKey(server.id, local.quantity)
      },
      localOrderId: ctx.orderId,
      localItemId: local.id
    })
  }

  // Voided locally but not on server.
  if (local.is_voided && !server.is_voided) {
    return queueOperation({
      type: 'void_item',
      params: { orderItemId: server.id },
      localOrderId: ctx.orderId,
      localItemId: local.id
    })
  }

  // Modifier set drift.
  if (localItemFingerprint(local) !== server.modifierFingerprint) {
    // Build the same flat modifier list `updateItemInActiveOrder` builds.
    const allModifiers: any[] = []
    for (const group of local.customizations?.modifiers ?? []) {
      for (const opt of (group as any).options ?? []) {
        allModifiers.push({
          modifier_group_id: (group as any).categoryId,
          modifier_item_id: opt.id,
          modifier_group_name: (group as any).categoryName,
          modifier_name: opt.name,
          price_modifier: opt.isNo ? 0 : opt.price,
          quantity: 1,
          is_no: opt.isNo ?? false
        })
      }
    }
    for (const a of local.customizations?.addOns ?? []) {
      allModifiers.push({
        modifier_item_id: (a as any).id,
        modifier_group_name: 'Add-ons',
        modifier_name: (a as any).name,
        price_modifier: (a as any).price,
        quantity: 1
      })
    }
    return queueOperation({
      type: 'replace_modifiers',
      params: { orderItemId: server.id, modifiers: allModifiers },
      localOrderId: ctx.orderId,
      localItemId: local.id
    })
  }

  return null
}

/**
 * Reconcile the local cart shape of a single owned order against the server.
 * For non-owned orders (claimed by another station), this is a no-op — the
 * caller should refresh-read via syncOrderFromBackendComplete instead.
 */
export async function reconcileOrderCartShape (
  orderId: string,
  options: { force?: boolean } = {}
): Promise<ReconcileResult> {
  const { force = false } = options

  if (!isFlagEnabled()) {
    return { orderId, outcome: 'skipped_disabled', divergences: 0, queuedOpIds: [] }
  }
  if (!_supabaseClient) {
    return { orderId, outcome: 'skipped_disabled', divergences: 0, queuedOpIds: [] }
  }

  if (!force) {
    const last = lastReconcileAt.get(orderId) ?? 0
    if (Date.now() - last < RECONCILE_COOLDOWN_MS) {
      return { orderId, outcome: 'skipped_no_diff', divergences: 0, queuedOpIds: [] }
    }
  }
  lastReconcileAt.set(orderId, Date.now())

  // Lazy-import to avoid circular deps with the order store.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrderStore } = require('@/stores/useOrderStore')
  const state = useOrderStore.getState()
  const order = state.ordersById[orderId]
  const currentStationId: string | null = state.currentStationId ?? null

  if (!order) {
    return { orderId, outcome: 'skipped_no_dbid', divergences: 0, queuedOpIds: [] }
  }
  if (!order.db_order_id) {
    return { orderId, outcome: 'skipped_no_dbid', divergences: 0, queuedOpIds: [] }
  }

  // Ownership gate — strict. Mirrors lib/orderAccessControl.isOrderReadOnly.
  // For non-owned orders we DO NOT push local→server. Caller should instead
  // refresh-read via syncOrderFromBackendComplete.
  if (isOrderReadOnly(order, currentStationId)) {
    return {
      orderId,
      outcome: 'skipped_unowned',
      divergences: 0,
      queuedOpIds: []
    }
  }

  // Fetch server-side state.
  const { data: serverOrder, error } = await OrderService.fetchOrderById(
    _supabaseClient,
    order.db_order_id
  )
  if (error || !serverOrder) {
    if (__DEV__) {
      console.warn('[cartShapeReconcile] fetch failed', {
        orderId,
        err: (error as any)?.message ?? error
      })
    }
    return { orderId, outcome: 'fetch_failed', divergences: 0, queuedOpIds: [] }
  }

  const serverByDbId = snapshotServerItems((serverOrder as any).order_items)
  const localItems: CartItem[] = order.items ?? []

  const queuedOpIds: string[] = []
  let divergences = 0
  for (const local of localItems) {
    if (local.isDraft) continue // never push drafts
    const server = local.db_order_item_id
      ? serverByDbId.get(local.db_order_item_id)
      : undefined
    const ctx: ReconcileContext = {
      orderId,
      currentStationId,
      getOrder: () => useOrderStore.getState().ordersById[orderId]
    }
    const opId = await reconcileOneItem(ctx, local, server)
    if (opId) {
      divergences++
      queuedOpIds.push(opId)
    }
  }

  if (divergences === 0) {
    return { orderId, outcome: 'skipped_no_diff', divergences: 0, queuedOpIds: [] }
  }

  if (__DEV__) {
    console.log('[cartShapeReconcile] queued ops to push local→server', {
      orderId,
      divergences,
      queuedOpIds
    })
  }
  return { orderId, outcome: 'reconciled', divergences, queuedOpIds }
}

/**
 * Reconcile every persistable owned order on this station. Called by the
 * connectivity-recovery + app-foreground hook.
 */
export async function reconcileAllOwnedOrders (): Promise<ReconcileResult[]> {
  if (!isFlagEnabled() || !_supabaseClient) return []
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOrderStore } = require('@/stores/useOrderStore')
  const state = useOrderStore.getState()
  const orderIds = Object.keys(state.persistableOrderIds ?? {})
  const results: ReconcileResult[] = []
  for (const id of orderIds) {
    const r = await reconcileOrderCartShape(id)
    results.push(r)
  }
  return results
}
