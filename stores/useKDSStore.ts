import type {
  BroadcastOrderData,
  BroadcastOrderItemData,
  OrderBroadcastPayload
} from '@/hooks/realtime/useOrdersRealtime'
import { getKitchenSentStatus } from '@/lib/kitchenStatusUtils'
import { normalizePlatform } from '@/lib/platformAliases'
import { isHeaderOnlyBroadcast } from '@/utils/orderTransformers'
import { mmkvStorage } from '@/lib/storage'
import { OrderService } from '@/services/orderService'
import {
  KDSDisplayConfig,
  KDSEnrichedRoutingRule,
  KDSRoutingRule,
  KDSTicket,
  KDSTicketItem
} from '@/types/kds'
import { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useTableSessionStore } from './useTableSessionStore'

// Global client reference (same pattern as other stores)
let _supabaseClient: SupabaseClient | null = null

export const setKDSSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client
}

const getClient = () => {
  if (!_supabaseClient) {
    console.warn('[KDSStore] Supabase client not set')
  }
  return _supabaseClient!
}

interface KDSState {
  tickets: KDSTicket[]
  ticketsByStatus: {
    pending: KDSTicket[]
    cooking: KDSTicket[]
    ready: KDSTicket[]
  }
  counts: { pending: number; cooking: number; ready: number }
  doneTickets: KDSTicket[]
  doneCount: number
  isInitialLoading: boolean
  isFetching: boolean
  _hasHydrated: boolean
  timerTick: number

  // Display awareness
  kdsDisplayId: string | null
  routingMode: string | null
  cachedRules: KDSRoutingRule[] | null
  kdsDisplayConfig: KDSDisplayConfig | null
  prepStations: Record<string, { name: string; color: string }>
  enrichedRules: KDSEnrichedRoutingRule[]

  // Internal ticket lookup for reference-stable merging
  _ticketsById: Record<string, KDSTicket>
  // O(1) order-level lookups: db_order_id → Set<ticket_id>
  _ticketIdsByOrderId: Record<string, Set<string>>

  // Last fetched location (for error recovery refetches)
  _lastLocationId: string | null

  // Bulk mode
  bulkMode: boolean
  selectedTicketIds: Set<string>

  // Priority tracking (local-only)
  prioritizedTicketIds: Set<string>

  // New order positioning
  newOrderPosition: 'left' | 'right'

  // Actions
  fetchKDSDisplay: (stationId: string) => Promise<void>
  fetchTickets: (locationId: string) => Promise<void>
  _backgroundFetchTickets: (locationId: string) => Promise<void>
  advanceTicketStatus: (
    ticketId: string,
    itemIds: string[],
    newStatus: 'preparing' | 'ready' | 'served'
  ) => void
  handleOrderBroadcast: (payload: OrderBroadcastPayload) => void
  _processOrderBroadcast: (payload: OrderBroadcastPayload) => void
  incrementTimerTick: () => void
  scheduleRefetch: (locationId: string, immediate?: boolean) => void

  // New-order callback (for sound notifications)
  _onNewOrderCallback: ((orderSource: string | null) => void) | null
  setOnNewOrderCallback: (
    cb: ((orderSource: string | null) => void) | null
  ) => void

  // Long-press actions
  recallTicket: (ticketId: string) => void
  prioritizeTicket: (ticketId: string) => void
  toggleRush: (ticketId: string) => void
  markItemDone: (ticketId: string, itemId: string) => void
  isTicketRecalled: (ticketId: string) => boolean

  // Done tickets
  recallDoneTicket: (ticketId: string) => void
  clearDoneTickets: () => void

  // Focused ticket (ephemeral UI state, not persisted)
  focusedTicketId: string | null
  setFocusedTicketId: (id: string | null) => void

  // Bulk actions
  toggleBulkMode: () => void
  toggleTicketSelection: (id: string) => void
  selectAllVisible: (ids: string[]) => void
  clearSelection: () => void
  bulkAdvanceTickets: (ticketIds: string[], locationId: string) => void

  // Config
  setNewOrderPosition: (pos: 'left' | 'right') => void

  // Cleanup (for unmount)
  _cleanup: () => void
}

// Debounce timer for scheduleRefetch
let _refetchTimeout: ReturnType<typeof setTimeout> | null = null

// Per-order broadcast debounce — absorbs rapid-fire broadcasts from row-level triggers
// (bulk_update_order_item_status fires one trigger per row, producing N partial-state
// broadcasts. We hold each for 80ms and only apply the last one.)
const _broadcastDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const BROADCAST_DEBOUNCE_MS = 80

// ─── Fetch sequence counter + in-flight guard ───────────────────
let _fetchSeq = 0
let _fetchInFlight = false

// ─── Cancellable retry infrastructure ───────────────────────────
const RETRY_DELAYS = [2000, 5000, 10000]
const MAX_RETRIES = RETRY_DELAYS.length

interface RetryHandle {
  timeoutId: ReturnType<typeof setTimeout> | null
  cancelled: boolean
}
const _activeRetries = new Map<string, RetryHandle>()

function scheduleRetry (
  key: string,
  performFn: () => Promise<unknown>,
  retryCount: number,
  onSuccess?: () => void,
  onFinalFailure?: () => void
) {
  cancelRetry(key)
  const handle: RetryHandle = { timeoutId: null, cancelled: false }
  _activeRetries.set(key, handle)

  performFn()
    .then(() => {
      if (handle.cancelled) return
      _activeRetries.delete(key)
      onSuccess?.()
    })
    .catch(err => {
      if (handle.cancelled) return
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount]
        console.warn(
          `[KDSStore] Retry ${
            retryCount + 1
          }/${MAX_RETRIES} for ${key} in ${delay}ms`
        )
        handle.timeoutId = setTimeout(() => {
          if (handle.cancelled) return
          scheduleRetry(
            key,
            performFn,
            retryCount + 1,
            onSuccess,
            onFinalFailure
          )
        }, delay)
      } else {
        console.error(
          `[KDSStore] All ${MAX_RETRIES} retries exhausted for ${key}:`,
          err
        )
        _activeRetries.delete(key)
        onFinalFailure?.()
      }
    })
}

function cancelRetry (key: string) {
  const handle = _activeRetries.get(key)
  if (handle) {
    handle.cancelled = true
    if (handle.timeoutId) clearTimeout(handle.timeoutId)
    _activeRetries.delete(key)
  }
}

function cancelAllRetries () {
  for (const [, handle] of _activeRetries) {
    handle.cancelled = true
    if (handle.timeoutId) clearTimeout(handle.timeoutId)
  }
  _activeRetries.clear()
}

// ─── Pending action tracking (optimistic update protection) ─────
interface PendingAction {
  ticketId: string
  targetStatus: KDSTicket['status'] | 'done'
  itemStatuses: Map<string, string>
  timestamp: number
  prioritized?: boolean
  rushOverride?: boolean
}
const _pendingActions = new Map<string, PendingAction>()
const PENDING_ACTION_TTL = 30_000

/** Track ticket IDs that have been recalled — survives server refetches */
const _recalledTicketIds = new Set<string>()

/** Track new order IDs filtered out by routing rules — sound fires when server refetch adds them */
const _pendingNewOrderSounds = new Set<string>()

function pendingActionSatisfied (
  ticket: KDSTicket,
  pending: PendingAction
): boolean {
  if (pending.targetStatus === 'done') return false
  if (ticket.status !== pending.targetStatus) return false
  if (
    pending.prioritized != null &&
    Boolean(ticket.prioritized) !== pending.prioritized
  ) {
    return false
  }

  for (const item of ticket.items) {
    const expectedStatus = pending.itemStatuses.get(item.id)
    if (expectedStatus && item.kitchen_status !== expectedStatus) {
      return false
    }
    if (pending.rushOverride != null && Boolean(item.rush) !== pending.rushOverride) {
      return false
    }
  }

  return true
}

/** Overlay pending optimistic states onto server/broadcast tickets */
function overlayPendingActions (tickets: KDSTicket[]): KDSTicket[] {
  if (_pendingActions.size === 0 && _recalledTicketIds.size === 0)
    return tickets
  const now = Date.now()

  return tickets.reduce<KDSTicket[]>((acc, ticket) => {
    const pending = _pendingActions.get(ticket.ticket_id)
    if (!pending) {
      // Still overlay recalled flag even without pending action
      if (_recalledTicketIds.has(ticket.ticket_id)) {
        acc.push({
          ...ticket,
          items: ticket.items.map(item => ({ ...item, recalled: true }))
        })
      } else {
        acc.push(ticket)
      }
      return acc
    }
    if (pendingActionSatisfied(ticket, pending)) {
      _pendingActions.delete(ticket.ticket_id)
      if (_recalledTicketIds.has(ticket.ticket_id)) {
        acc.push({
          ...ticket,
          items: ticket.items.map(item => ({ ...item, recalled: true }))
        })
      } else {
        acc.push(ticket)
      }
      return acc
    }
    if (now - pending.timestamp > PENDING_ACTION_TTL) {
      _pendingActions.delete(ticket.ticket_id)
      if (_recalledTicketIds.has(ticket.ticket_id)) {
        acc.push({
          ...ticket,
          items: ticket.items.map(item => ({ ...item, recalled: true }))
        })
      } else {
        acc.push(ticket)
      }
      return acc
    }
    // Ticket was optimistically served/removed — keep it out
    if (pending.targetStatus === 'done') return acc
    // Overlay optimistic statuses (and preserve pending priority flag + recalled)
    const isRecalled = _recalledTicketIds.has(ticket.ticket_id)
    acc.push({
      ...ticket,
      status: pending.targetStatus as KDSTicket['status'],
      ...(pending.prioritized != null
        ? { prioritized: pending.prioritized }
        : {}),
      items: ticket.items.map(item => {
        const optimistic = pending.itemStatuses.get(item.id)
        return {
          ...item,
          ...(optimistic ? { kitchen_status: optimistic } : {}),
          ...(pending.rushOverride != null
            ? { rush: pending.rushOverride }
            : {}),
          ...(isRecalled ? { recalled: true } : {})
        }
      })
    })
    return acc
  }, [])
}

/** Parse a timestamp string to epoch ms, treating timezone-naive strings as UTC.
 *  Supabase stores timestamps in UTC; JSONB serialization of TIMESTAMP columns
 *  may strip timezone info, causing local-time parse on the client. */
function safeParseUtcTimestamp (s: string | null | undefined): number {
  if (!s) return 0
  // If no timezone indicator, append 'Z' to force UTC parse
  const hasTimezone =
    s.includes('+') || s.includes('Z') || /\d{2}:\d{2}$/.test(s.slice(-6))
  const normalized = hasTimezone ? s : s + 'Z'
  const ms = new Date(normalized).getTime()
  return isNaN(ms) ? 0 : ms
}

/** Ensure ticket.prioritized matches prioritizedTicketIds (the source of truth).
 *  Reuses object refs for unchanged tickets to preserve reference stability. */
function reconcilePriorityFlags (
  tickets: KDSTicket[],
  prioritizedIds: Set<string>
): KDSTicket[] {
  if (prioritizedIds.size === 0) return tickets
  let changed = false
  const result = tickets.map(t => {
    const shouldBe = prioritizedIds.has(t.ticket_id)
    if (t.prioritized === shouldBe) return t
    changed = true
    return { ...t, prioritized: shouldBe }
  })
  return changed ? result : tickets
}

function compareKdsTickets (a: KDSTicket, b: KDSTicket): number {
  const timeDiff = a.start_time_epoch - b.start_time_epoch
  if (timeDiff !== 0) return timeDiff

  const courseDiff = a.course_number - b.course_number
  if (courseDiff !== 0) return courseDiff

  return a.ticket_id.localeCompare(b.ticket_id)
}

function sortKdsTicketsStable (tickets: KDSTicket[]): KDSTicket[] {
  return [...tickets].sort(compareKdsTickets)
}

function normalizeKdsTicket (ticket: KDSTicket): KDSTicket {
  const items = Array.isArray(ticket.items)
    ? ticket.items.map(item => ({
        ...item,
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : []
      }))
    : []

  return {
    ...ticket,
    items,
    delivery_platform: normalizePlatform(ticket.delivery_platform) ?? ticket.delivery_platform ?? null,
    item_count:
      typeof ticket.item_count === 'number'
        ? ticket.item_count
        : items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  }
}

/** KDS-relevant kitchen statuses */
const KDS_STATUSES = new Set(['sent', 'preparing', 'ready'])

/** Terminal order statuses — remove from KDS */
const TERMINAL_ORDER_STATUSES = new Set([
  'completed',
  'cancelled',
  'refunded',
  'void'
])

/** Shared predicate: should we apply display-based item filtering? */
function shouldUseDisplayFilter (
  kdsDisplayId: string | null,
  routingMode: string | null,
  cachedRules: KDSRoutingRule[] | null
): boolean {
  return !!(
    kdsDisplayId &&
    routingMode !== 'all' &&
    cachedRules &&
    cachedRules.length > 0
  )
}

/** Check if an item matches routing rules for client-side filtering */
function itemMatchesRules (
  item: BroadcastOrderItemData,
  rules: KDSRoutingRule[],
  orderType: string | null
): boolean {
  for (const rule of rules) {
    if (
      rule.rule_type === 'prep_station' &&
      item.prep_station === rule.rule_value
    ) {
      return true
    }
    if (
      rule.rule_type === 'category' &&
      (item.category_name === rule.rule_value ||
        (item.category_id && item.category_id === rule.rule_value))
    ) {
      return true
    }
    if (rule.rule_type === 'order_type' && orderType === rule.rule_value) {
      return true
    }
  }
  return false
}

/** Build O(1) order-id → ticket-id index from ticketsById map */
function buildOrderIdIndex (
  ticketsById: Record<string, KDSTicket>
): Record<string, Set<string>> {
  const index: Record<string, Set<string>> = {}
  for (const ticket of Object.values(ticketsById)) {
    const oid = ticket.db_order_id
    if (!index[oid]) index[oid] = new Set()
    index[oid].add(ticket.ticket_id)
  }
  return index
}

/** Build KDS tickets from a broadcast order's items */
function buildTicketsFromBroadcast (order: BroadcastOrderData): KDSTicket[] {
  const items = order.order_items
  if (!items || items.length === 0) return []

  // Filter to KDS-relevant, non-voided items
  const kdsItems = items.filter(
    item =>
      !item.is_voided &&
      item.kitchen_status != null &&
      KDS_STATUSES.has(item.kitchen_status)
  )
  if (kdsItems.length === 0) return []

  // Group by course_number + fire_time (round)
  const byRound = new Map<string, BroadcastOrderItemData[]>()
  for (const item of kdsItems) {
    const course = item.course_number ?? 1
    const fireTime = item.fire_time ?? '0'
    const key = `${course}|${fireTime}`
    const existing = byRound.get(key)
    if (existing) existing.push(item)
    else byRound.set(key, [item])
  }

  const tickets: KDSTicket[] = []
  for (const [key, roundItems] of byRound) {
    const courseNumber = roundItems[0].course_number ?? 1
    const fireTime = roundItems[0].fire_time ?? null
    const fireTimeMs = safeParseUtcTimestamp(fireTime)
    const fireTimeEpoch = fireTimeMs ? Math.floor(fireTimeMs / 1000) : 0

    // Derive ticket status (same logic as SQL: all ready → ready, any sent → pending, else cooking)
    // In 2-step mode, remap "pending" to "cooking" (items skip Pending bucket)
    const allReady = roundItems.every(i => i.kitchen_status === 'ready')
    const anySent = roundItems.some(i => i.kitchen_status === 'sent')
    const ticketStatus: KDSTicket['status'] = allReady
      ? 'ready'
      : anySent
      ? getKitchenSentStatus() === 'preparing'
        ? 'cooking'
        : 'pending'
      : 'cooking'

    const ticketItems: KDSTicketItem[] = roundItems.map(item => ({
      id: item.id,
      name: item.item_name,
      quantity: item.quantity,
      kitchen_status: item.kitchen_status!,
      special_instructions: item.special_instructions,
      modifiers: (item.modifiers ?? []).map(m => ({
        modifier_name: m.modifier_name,
        modifier_group_name: m.modifier_group_name,
        price_modifier: m.price_modifier,
        ...(m.is_no ? { is_no: true } : {})
      })),
      prep_station: item.prep_station,
      rush: item.rush,
      is_prioritized: item.is_prioritized,
      seat_number: item.seat_number ?? null
    }))
    // Stable sort by id so items never reorder on status change
    ticketItems.sort((a, b) => a.id.localeCompare(b.id))

    tickets.push({
      ticket_id: `${order.id}_c${courseNumber}_f${fireTimeEpoch}`,
      order_id: order.id,
      db_order_id: order.id,
      order_number: order.order_number,
      display_number: order.display_number,
      course_number: courseNumber,
      status: ticketStatus,
      order_type: order.order_type,
      order_source: order.order_source ?? null,
      delivery_platform: normalizePlatform(order.delivery_platform) ?? null,
      table_name: order.table_number,
      customer_name: order.customer_name ?? null,
      start_time: fireTime ?? order.sent_to_kitchen_at,
      start_time_epoch:
        fireTimeMs || safeParseUtcTimestamp(order.sent_to_kitchen_at),
      item_count: ticketItems.reduce((sum, i) => sum + i.quantity, 0),
      items: ticketItems,
      prioritized: roundItems.some(i => i.is_prioritized),
      session_id: order.session_id ?? null
    })
  }

  return tickets
}

/** Shallow-compare two ticket arrays by reference identity */
function arraysShallowEqual (a: KDSTicket[], b: KDSTicket[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Deep-compare two tickets by value, reusing unchanged references */
function ticketDeepEqual (a: KDSTicket, b: KDSTicket): boolean {
  if (a.status !== b.status || a.prioritized !== b.prioritized) return false
  if (a.item_count !== b.item_count || a.order_number !== b.order_number)
    return false
  if (a.display_number !== b.display_number || a.table_name !== b.table_name)
    return false
  if (a.customer_name !== b.customer_name || a.start_time !== b.start_time)
    return false
  if (a.items.length !== b.items.length) return false
  for (let i = 0; i < a.items.length; i++) {
    const ai = a.items[i],
      bi = b.items[i]
    if (ai.id !== bi.id || ai.kitchen_status !== bi.kitchen_status) return false
    if (ai.quantity !== bi.quantity || ai.rush !== bi.rush) return false
    if (ai.is_prioritized !== bi.is_prioritized) return false
    if (ai.special_instructions !== bi.special_instructions) return false
  }
  return true
}

/** Preserve locally-completed items when the backend omits them from a refetch.
 *  This keeps individually-tapped items visible and struck through instead of
 *  collapsing the ticket back to only the remaining active items. */
function preserveCompletedItems (
  previous: KDSTicket,
  incoming: KDSTicket
): KDSTicket {
  const prevItems = Array.isArray(previous.items) ? previous.items : []
  const nextItems = Array.isArray(incoming.items) ? incoming.items : []
  const incomingIds = new Set(nextItems.map(item => item.id))
  const preservedItems = prevItems.filter(
    item => item.kitchen_status === 'ready' && !incomingIds.has(item.id)
  )

  if (preservedItems.length === 0) return incoming

  const mergedItems = [...nextItems, ...preservedItems].sort((a, b) =>
    a.id.localeCompare(b.id)
  )

  return {
    ...incoming,
    items: mergedItems,
    item_count: Math.max(previous.item_count, incoming.item_count)
  }
}

/** Merge incoming tickets with existing, reusing unchanged object references */
function mergeTickets (
  incoming: KDSTicket[],
  existingById: Record<string, KDSTicket>
): {
  merged: KDSTicket[]
  mergedById: Record<string, KDSTicket>
  changed: boolean
} {
  let changed = false
  const mergedById: Record<string, KDSTicket> = {}
  const merged: KDSTicket[] = []
  for (const ticket of incoming) {
    const prevRaw = existingById[ticket.ticket_id]
    const prev = prevRaw ? normalizeKdsTicket(prevRaw) : undefined
    // Preserve customer_name/table_name from existing ticket when broadcast omits them
    const normalizedIncoming = normalizeKdsTicket(ticket)
    const enriched =
      prev && (ticket.customer_name === null || ticket.table_name === null)
        ? {
            ...normalizedIncoming,
            customer_name:
              normalizedIncoming.customer_name ?? prev.customer_name,
            table_name: normalizedIncoming.table_name ?? prev.table_name
          }
        : normalizedIncoming
    const stabilized = prev ? preserveCompletedItems(prev, enriched) : enriched
    if (prev && ticketDeepEqual(prev, stabilized)) {
      mergedById[normalizedIncoming.ticket_id] = prev
      merged.push(prev)
    } else {
      mergedById[normalizedIncoming.ticket_id] = stabilized
      merged.push(stabilized)
      changed = true
    }
  }
  if (Object.keys(existingById).length !== merged.length) changed = true
  return { merged, mergedById, changed }
}

/** Stable sort: prioritized tickets float to front within each bucket.
 *  Uses prevBucket to preserve existing priority ordering — new priorities append at end. */
function prioritySortBucket (
  bucket: KDSTicket[],
  prioritizedIds: Set<string>,
  prevBucket: KDSTicket[],
  newestFirst?: boolean
): KDSTicket[] {
  if (prioritizedIds.size === 0) {
    return newestFirst ? [...bucket].reverse() : bucket
  }

  // Get previously-prioritized tickets in their existing order
  const prevPrioritizedOrder: string[] = []
  for (const t of prevBucket) {
    if (prioritizedIds.has(t.ticket_id)) prevPrioritizedOrder.push(t.ticket_id)
  }

  // Find newly prioritized tickets (not in previous priority section)
  const prevPrioritySet = new Set(prevPrioritizedOrder)
  const newlyPrioritized: string[] = []
  for (const t of bucket) {
    if (prioritizedIds.has(t.ticket_id) && !prevPrioritySet.has(t.ticket_id)) {
      newlyPrioritized.push(t.ticket_id)
    }
  }

  // Build ordered priority list: existing order + new ones appended at end
  const priorityOrder = [...prevPrioritizedOrder, ...newlyPrioritized]
  const ticketMap = new Map(bucket.map(t => [t.ticket_id, t]))

  const prioritized = priorityOrder
    .map(id => ticketMap.get(id))
    .filter((t): t is KDSTicket => t != null)

  const normal = bucket.filter(t => !prioritizedIds.has(t.ticket_id))
  const orderedNormal = newestFirst ? [...normal].reverse() : normal

  return [...prioritized, ...orderedNormal]
}

/** Bucket tickets into status groups, reusing unchanged array references */
function smartBucketTickets (
  tickets: KDSTicket[],
  prev: KDSState['ticketsByStatus'],
  prioritizedIds?: Set<string>,
  newOrderPosition?: 'left' | 'right'
) {
  const pending: KDSTicket[] = []
  const cooking: KDSTicket[] = []
  const ready: KDSTicket[] = []

  for (const t of tickets) {
    if (t.status === 'pending') pending.push(t)
    else if (t.status === 'cooking') cooking.push(t)
    else if (t.status === 'ready') ready.push(t)
  }

  // Apply priority sorting (and newest-first if configured)
  const pIds = prioritizedIds ?? new Set<string>()
  const newestFirst = newOrderPosition === 'left'
  const sortedPending = prioritySortBucket(
    pending,
    pIds,
    prev.pending,
    newestFirst
  )
  const sortedCooking = prioritySortBucket(
    cooking,
    pIds,
    prev.cooking,
    newestFirst
  )
  const sortedReady = prioritySortBucket(ready, pIds, prev.ready, newestFirst)

  const finalPending = arraysShallowEqual(sortedPending, prev.pending)
    ? prev.pending
    : sortedPending
  const finalCooking = arraysShallowEqual(sortedCooking, prev.cooking)
    ? prev.cooking
    : sortedCooking
  const finalReady = arraysShallowEqual(sortedReady, prev.ready)
    ? prev.ready
    : sortedReady

  return {
    ticketsByStatus: {
      pending: finalPending,
      cooking: finalCooking,
      ready: finalReady
    },
    counts: {
      pending: finalPending.length,
      cooking: finalCooking.length,
      ready: finalReady.length
    }
  }
}

export const useKDSStore = create<KDSState>()(
  persist(
    (set, get) => ({
      tickets: [],
      ticketsByStatus: { pending: [], cooking: [], ready: [] },
      counts: { pending: 0, cooking: 0, ready: 0 },
      doneTickets: [],
      doneCount: 0,
      isInitialLoading: true,
      isFetching: false,
      _hasHydrated: false,
      timerTick: 0,
      focusedTicketId: null,
      setFocusedTicketId: id => set({ focusedTicketId: id }),
      bulkMode: false,
      selectedTicketIds: new Set<string>(),
      prioritizedTicketIds: new Set<string>(),
      newOrderPosition: 'right' as const,

      _ticketsById: {},
      _ticketIdsByOrderId: {},

      // Display awareness state
      kdsDisplayId: null,
      routingMode: null,
      cachedRules: null,
      kdsDisplayConfig: null,
      prepStations: {},
      enrichedRules: [],
      _lastLocationId: null,

      // New-order callback
      _onNewOrderCallback: null,
      setOnNewOrderCallback: cb => set({ _onNewOrderCallback: cb }),

      setNewOrderPosition: pos => {
        if (pos === get().newOrderPosition) return
        set({ newOrderPosition: pos })
        // Re-bucket with new ordering
        const bucketed = smartBucketTickets(
          get().tickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          pos
        )
        set(bucketed)
      },

      // ─── Fetch KDS Display Config ─────────────────────────────────
      fetchKDSDisplay: async (stationId: string) => {
        const client = getClient()
        if (!client) return

        try {
          // Query kds_displays by station_id (1:1 FK)
          const { data: display, error: displayError } = await client
            .from('kds_displays')
            .select('*')
            .eq('station_id', stationId)
            .eq('is_active', true)
            .maybeSingle()

          if (displayError) {
            console.error('[KDSStore] fetchKDSDisplay error:', displayError)
            // Fall back to no display (show all items)
            set({
              kdsDisplayId: null,
              routingMode: null,
              cachedRules: null,
              kdsDisplayConfig: null,
              prepStations: {},
              enrichedRules: []
            })
            return
          }

          if (!display) {
            // No display configured for this station - backward compat (show all)
            set({
              kdsDisplayId: null,
              routingMode: null,
              cachedRules: null,
              kdsDisplayConfig: null,
              prepStations: {},
              enrichedRules: []
            })
            return
          }

          // Fetch routing rules for this display
          const { data: rules, error: rulesError } = await client
            .from('kds_routing_rules')
            .select('rule_type, rule_value')
            .eq('kds_display_id', display.id)

          if (rulesError) {
            console.error('[KDSStore] fetchKDSDisplay rules error:', rulesError)
          }

          // Fetch prep stations for this location
          const { data: prepStationsData, error: psError } = await client
            .from('prep_stations')
            .select('id, name, color')
            .eq('location_id', display.location_id)
            .eq('is_active', true)

          if (psError) {
            console.error(
              '[KDSStore] fetchKDSDisplay prep_stations error:',
              psError
            )
          }

          // Build prep station map: name -> { name, color }
          const prepStationsMap: Record<
            string,
            { name: string; color: string }
          > = {}
          if (prepStationsData) {
            for (const ps of prepStationsData) {
              prepStationsMap[ps.name] = {
                name: ps.name,
                color: ps.color || '#6b7280'
              }
            }
          }

          // Build enriched rules with human-readable labels
          const typedRules = (rules as KDSRoutingRule[]) || []
          const enriched: KDSEnrichedRoutingRule[] = typedRules.map(rule => {
            let label = rule.rule_value
            if (
              rule.rule_type === 'prep_station' &&
              prepStationsMap[rule.rule_value]
            ) {
              label = prepStationsMap[rule.rule_value].name
            }
            return { ...rule, label }
          })

          const config: KDSDisplayConfig = {
            displayName: display.display_name || 'Kitchen Display',
            columns: display.columns ?? null,
            alertMinutes: display.alert_minutes ?? null,
            warningMinutes: display.warning_minutes ?? null,
            autoBumpMinutes: display.auto_bump_minutes ?? null,
            soundOnNewOrder: display.sound_on_new_order ?? null,
            soundOnRush: display.sound_on_rush ?? null,
            soundConfig: display.sound_config
              ? (display.sound_config as import('@/services/kds/kdsSoundService').KDSSoundConfig)
              : null,
            showAllergyFlags: display.show_allergy_flags ?? null,
            showOrderNotes: display.show_order_notes ?? null,
            showServerName: display.show_server_name ?? null,
            fontScale: display.font_scale ?? null
          }

          set({
            kdsDisplayId: display.id,
            routingMode: display.routing_mode || 'all',
            cachedRules: typedRules,
            kdsDisplayConfig: config,
            prepStations: prepStationsMap,
            enrichedRules: enriched
          })
        } catch (err) {
          console.error('[KDSStore] fetchKDSDisplay exception:', err)
          set({
            kdsDisplayId: null,
            routingMode: null,
            cachedRules: null,
            kdsDisplayConfig: null,
            prepStations: {},
            enrichedRules: []
          })
        }
      },

      // ─── Fetch Tickets ────────────────────────────────────────────
      fetchTickets: async (locationId: string) => {
        const client = getClient()
        if (!client) return

        const { kdsDisplayId, routingMode, cachedRules, _hasHydrated } = get()

        // Bump sequence to invalidate any in-flight background fetch
        const mySeq = ++_fetchSeq

        set({
          isInitialLoading: !_hasHydrated,
          isFetching: true,
          _lastLocationId: locationId
        })
        try {
          const params: Record<string, any> = { p_location_id: locationId }
          if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
            params.p_kds_display_id = kdsDisplayId
          }

          const { data, error } = await client.rpc('get_kds_tickets_v2', params)

          // Discard stale response (but still reset isFetching)
          if (mySeq !== _fetchSeq) {
            set({ isFetching: false })
            return
          }

          if (error) {
            console.error('[KDSStore] fetchTickets error:', error)
            set({ isInitialLoading: false, isFetching: false })
            return
          }

          const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? []
          const processed = overlayPendingActions(
            raw.map(t =>
              normalizeKdsTicket({
                ...t,
                start_time_epoch: safeParseUtcTimestamp(t.start_time)
              })
            )
          )
          // In 2-step mode, remap any "pending" tickets to "cooking" (Pending bucket is hidden)
          const remapped =
            getKitchenSentStatus() === 'preparing'
              ? processed.map(t =>
                  t.status === 'pending'
                    ? { ...t, status: 'cooking' as KDSTicket['status'] }
                    : t
                )
              : processed
          const sorted = sortKdsTicketsStable(remapped)
          const { merged, mergedById, changed } = mergeTickets(
            sorted,
            get()._ticketsById
          )

          if (!changed && get()._hasHydrated) {
            set({ isInitialLoading: false, isFetching: false })
            return
          }

          // Hydrate prioritizedTicketIds from server data + preserve local priorities for existing tickets
          const nextPrioritized = new Set<string>()
          for (const t of merged) {
            if (t.prioritized) nextPrioritized.add(t.ticket_id)
          }
          for (const id of get().prioritizedTicketIds) {
            if (mergedById[id]) nextPrioritized.add(id)
          }

          const reconciled = reconcilePriorityFlags(merged, nextPrioritized)
          const bucketed = smartBucketTickets(
            reconciled,
            get().ticketsByStatus,
            nextPrioritized,
            get().newOrderPosition
          )

          set({
            tickets: reconciled,
            _ticketsById: mergedById,
            _ticketIdsByOrderId: buildOrderIdIndex(mergedById),
            prioritizedTicketIds: nextPrioritized,
            ...bucketed,
            _hasHydrated: true,
            isInitialLoading: false,
            isFetching: false
          })
        } catch (err) {
          if (mySeq !== _fetchSeq) {
            set({ isFetching: false })
            return
          }
          console.error('[KDSStore] fetchTickets exception:', err)
          set({ isInitialLoading: false, isFetching: false })
        }
      },

      // Background fetch — only sets isFetching, never isInitialLoading.
      // Used by scheduleRefetch and polling to avoid skeleton flashes.
      _backgroundFetchTickets: async (locationId: string) => {
        // In-flight guard: skip if another background fetch is running
        if (_fetchInFlight) return
        _fetchInFlight = true

        const client = getClient()
        if (!client) {
          _fetchInFlight = false
          return
        }

        const { kdsDisplayId, routingMode, cachedRules } = get()
        const mySeq = ++_fetchSeq

        set({ isFetching: true, _lastLocationId: locationId })
        try {
          const params: Record<string, any> = { p_location_id: locationId }
          if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
            params.p_kds_display_id = kdsDisplayId
          }

          const { data, error } = await client.rpc('get_kds_tickets_v2', params)

          // Discard stale response
          if (mySeq !== _fetchSeq) return

          if (error) {
            console.error('[KDSStore] _backgroundFetchTickets error:', error)
            set({ isFetching: false })
            return
          }

          const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? []
          const processed = overlayPendingActions(
            raw.map(t =>
              normalizeKdsTicket({
                ...t,
                start_time_epoch: safeParseUtcTimestamp(t.start_time)
              })
            )
          )
          // In 2-step mode, remap any "pending" tickets to "cooking"
          const remapped =
            getKitchenSentStatus() === 'preparing'
              ? processed.map(t =>
                  t.status === 'pending'
                    ? { ...t, status: 'cooking' as KDSTicket['status'] }
                    : t
                )
              : processed
          const sorted = sortKdsTicketsStable(remapped)

          // Preserve recalled/pending tickets not returned by server.
          // For display-filtered stations, marking an item 'ready' sets
          // kds_item_status = 'completed', which excludes the item from
          // get_kds_tickets_v2 results. Check both the module-level Set
          // AND the item-level recalled flag (persisted in MMKV) so the
          // ticket survives even after a hot-reload that clears the Set.
          const currentTickets = get().tickets
          const serverTicketIds = new Set(remapped.map(t => t.ticket_id))
          const protectedMissing = currentTickets.filter(
            t =>
              !serverTicketIds.has(t.ticket_id) &&
              (_pendingActions.has(t.ticket_id) ||
                _recalledTicketIds.has(t.ticket_id) ||
                (Array.isArray(t.items) && t.items.some(i => i.recalled)))
          )
          const withProtected =
            protectedMissing.length > 0
              ? [...sorted, ...protectedMissing]
              : sorted
          const sortedWithProtected = sortKdsTicketsStable(withProtected)

          const { merged, mergedById, changed } = mergeTickets(
            sortedWithProtected,
            get()._ticketsById
          )

          if (!changed && get()._hasHydrated) {
            set({ isFetching: false })
            return
          }

          // Hydrate prioritizedTicketIds from server data + preserve local priorities for existing tickets
          const nextPrioritized = new Set<string>()
          for (const t of merged) {
            if (t.prioritized) nextPrioritized.add(t.ticket_id)
          }
          for (const id of get().prioritizedTicketIds) {
            if (mergedById[id]) nextPrioritized.add(id)
          }

          const reconciled = reconcilePriorityFlags(merged, nextPrioritized)
          const bucketed = smartBucketTickets(
            reconciled,
            get().ticketsByStatus,
            nextPrioritized,
            get().newOrderPosition
          )

          set({
            tickets: reconciled,
            _ticketsById: mergedById,
            _ticketIdsByOrderId: buildOrderIdIndex(mergedById),
            prioritizedTicketIds: nextPrioritized,
            ...bucketed,
            _hasHydrated: true,
            isFetching: false
          })

          // Fire sound for orders that were filtered out by broadcast but arrived via server refetch
          if (_pendingNewOrderSounds.size > 0) {
            const prevOrderIds = new Set(currentTickets.map(t => t.db_order_id))
            for (const t of merged) {
              if (
                _pendingNewOrderSounds.has(t.db_order_id) &&
                !prevOrderIds.has(t.db_order_id)
              ) {
                const cb = get()._onNewOrderCallback
                if (cb) cb(t.order_source ?? null)
                _pendingNewOrderSounds.delete(t.db_order_id)
                break // one sound per cycle; cooldown handles rapid arrivals
              }
            }
          }
        } catch (err) {
          if (mySeq !== _fetchSeq) return
          console.error('[KDSStore] _backgroundFetchTickets exception:', err)
          set({ isFetching: false })
        } finally {
          _fetchInFlight = false
        }
      },

      advanceTicketStatus: (ticketId, itemIds, newStatus) => {
        const { tickets, _ticketsById } = get()

        // O(1) lookup via map
        const ticket = _ticketsById[ticketId]
        const orderId = ticket?.db_order_id

        // Map newStatus to KDS ticket status for optimistic update
        const ticketStatus =
          newStatus === 'preparing'
            ? 'cooking'
            : newStatus === 'ready'
            ? 'ready'
            : null // "served" removes from KDS

        // Cancel any in-flight per-item retries for this ticket so they don't
        // overwrite the whole-ticket status we're about to write (e.g. markItemDone
        // retries running after advanceTicketStatus would set items back to 'ready').
        for (const id of itemIds) {
          cancelRetry(`item_${ticketId}_${id}`)
        }

        // Register pending action (protects optimistic state from broadcast clobber)
        const itemStatusMap = new Map<string, string>()
        for (const id of itemIds) itemStatusMap.set(id, newStatus)
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus:
            ticketStatus === null
              ? 'done'
              : (ticketStatus as KDSTicket['status']),
          itemStatuses: itemStatusMap,
          timestamp: Date.now()
        })

        let updatedTickets: KDSTicket[]
        let updatedById: Record<string, KDSTicket>
        let extraState: Partial<KDSState> = {}

        if (ticketStatus === null) {
          // Served → remove from active, add to done in one set() call
          _recalledTicketIds.delete(ticketId)
          updatedTickets = tickets.filter(t => t.ticket_id !== ticketId)
          // Avoid shallow-copying entire map — use Object.create trick with deletion
          updatedById = Object.assign({}, _ticketsById)
          delete updatedById[ticketId]

          if (ticket) {
            const updatedDone = [
              {
                ...ticket,
                status: 'done' as KDSTicket['status'],
                done_time_epoch: Date.now()
              },
              ...get().doneTickets
            ].slice(0, 50)
            extraState = {
              doneTickets: updatedDone,
              doneCount: updatedDone.length
            }
          }
        } else {
          const itemIdSet = new Set(itemIds)
          const resetEpoch =
            ticketStatus === 'ready' && _recalledTicketIds.has(ticketId)
          const updatedTicket: KDSTicket = {
            ...ticket!,
            status: ticketStatus as KDSTicket['status'],
            items: ticket?.items.map(item =>
              itemIdSet?.has(item.id)
                ? { ...item, kitchen_status: newStatus }
                : item
            ),
            ...(resetEpoch ? { start_time_epoch: Date.now() } : {})
          }
          // Replace single entry without iterating the full tickets array
          const idx = tickets.findIndex(t => t.ticket_id === ticketId)
          if (idx === -1) {
            updatedTickets = tickets
          } else {
            updatedTickets = tickets.slice()
            updatedTickets[idx] = updatedTicket
          }
          updatedById = { ..._ticketsById, [ticketId]: updatedTicket }
        }

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        // Single set() call — one render cycle
        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          _ticketIdsByOrderId: buildOrderIdIndex(updatedById),
          ...bucketed,
          ...extraState
        })

        // Backend sync with cancellable retry (action-specific key to avoid cross-action cancellation)
        const retryKey = `advance_${ticketId}_${newStatus}`
        const client = getClient()
        if (client && itemIds.length > 0) {
          scheduleRetry(
            retryKey,
            () =>
              OrderService.bulkUpdateOrderItemStatus(
                client,
                itemIds,
                newStatus
              ),
            0,
            () => {
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)

              // Persist final order status after all items are served from KDS.
              if (newStatus === 'served' && orderId) {
                const hasRemainingTicketsForOrder = updatedTickets.some(
                  t => t.db_order_id === orderId
                )

                if (!hasRemainingTicketsForOrder) {
                  OrderService.updateOrderStatus(client, orderId, 'ready').then(
                    ({ error }) => {
                      if (
                        error &&
                        error.code !== 'P0001' &&
                        !error.message?.includes('already in')
                      ) {
                        console.error(
                          '[KDSStore] Failed to update order status to ready:',
                          error
                        )
                      }
                    }
                  )
                }
              }
            },
            () => {
              _pendingActions.delete(ticketId)
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            }
          )

          // When all items are marked as served in KDS, also update the table session to "served"
          if (newStatus === 'served') {
            // Prefer session_id on the ticket (set from broadcast).
            // Fallback: scan sessions by db_order_id for tickets loaded via RPC
            // which don't carry session_id (get_kds_tickets_v2 doesn't return it).
            let sessionId = ticket?.session_id
            if (!sessionId && orderId) {
              const sessions = useTableSessionStore.getState().sessions
              const match = Object.values(sessions).find(
                s => s?.order_id === orderId
              )
              sessionId = match?.id ?? null
            }
            if (sessionId) {
              useTableSessionStore.getState()
                .updateSessionStatus(sessionId, 'served')
                .catch(err => {
                  console.error(
                    '[KDSStore] Failed to update table session to served:',
                    err
                  )
                })
            }
          }
        }
      },

      handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
        const order = payload.data?.order
        if (!order) return

        // Debounce per-order: bulk_update_order_item_status fires one DB trigger per
        // row, producing N rapid broadcasts with partial item state. Hold 80ms and
        // only process the last one to prevent flickering item counts.
        const existing = _broadcastDebounceTimers.get(order.id)
        if (existing) clearTimeout(existing)
        _broadcastDebounceTimers.set(
          order.id,
          setTimeout(() => {
            _broadcastDebounceTimers.delete(order.id)
            get()._processOrderBroadcast(payload)
          }, BROADCAST_DEBOUNCE_MS)
        )
      },

      _processOrderBroadcast: (payload: OrderBroadcastPayload) => {
        const order = payload.data?.order
        if (!order) return

        console.log('[KDSStore] Broadcast received:', {
          orderId: order.id,
          sessionId: order.session_id,
          tableNumber: order.table_number
        })

        // Gate: order must have been fired to kitchen
        // Accept sent_to_kitchen_at OR status of sent_to_kitchen/preparing
        if (
          !order.sent_to_kitchen_at &&
          order.status !== 'sent_to_kitchen' &&
          order.status !== 'preparing'
        ) {
          return
        }

        // v2 (header-only) broadcasts: no items in payload, handle via refetch
        if (isHeaderOnlyBroadcast(order)) {
          const { tickets, _ticketIdsByOrderId } = get()
          const orderTids = _ticketIdsByOrderId[order.id]

          // Terminal statuses: remove tickets immediately from header alone
          if (TERMINAL_ORDER_STATUSES.has(order.status)) {
            let hasProtected = false
            if (orderTids) {
              for (const tid of orderTids) {
                if (_pendingActions.has(tid) || _recalledTicketIds.has(tid)) {
                  hasProtected = true
                  break
                }
              }
            }
            if (!hasProtected && orderTids?.size) {
              const filtered = tickets.filter(t => !orderTids!.has(t.ticket_id))
              const bucketed = smartBucketTickets(
                filtered,
                get().ticketsByStatus,
                get().prioritizedTicketIds,
                get().newOrderPosition
              )
              set({ tickets: filtered, ...bucketed })
            }
            return
          }

          // Track potential new order for sound notification after refetch
          if (!orderTids?.size) {
            _pendingNewOrderSounds.add(order.id)
          }

          // Fast refetch for authoritative ticket data
          const locationId = order.location_id
          if (locationId) {
            const allProtected =
              orderTids &&
              orderTids.size > 0 &&
              Array.from(orderTids).every(tid => _pendingActions.has(tid))
            if (!allProtected) {
              get().scheduleRefetch(locationId, true)
            }
          }
          return
        }

        // Legacy v1 full broadcast path — skip if no items (payment-only broadcast)
        if (!order.order_items || order.order_items.length === 0) return

        const {
          tickets,
          kdsDisplayId,
          routingMode,
          cachedRules,
          _ticketIdsByOrderId,
          _ticketsById
        } = get()

        // O(1) lookup for tickets belonging to this order
        const orderTids = _ticketIdsByOrderId[order.id]
        const hadExistingTickets = !!orderTids?.size

        // If every ticket for this order has a pending action, this broadcast is our own echo —
        // optimistic state is already correct, skip the entire processing pipeline.
        if (
          orderTids &&
          orderTids.size > 0 &&
          Array.from(orderTids).every(tid => _pendingActions.has(tid))
        ) {
          return
        }

        // Terminal statuses: remove all tickets for this order (unless protected by recall/pending)
        if (TERMINAL_ORDER_STATUSES.has(order.status)) {
          let hasProtected = false
          if (orderTids) {
            for (const tid of orderTids) {
              if (_pendingActions.has(tid) || _recalledTicketIds.has(tid)) {
                hasProtected = true
                break
              }
            }
          }
          if (!hasProtected) {
            if (hadExistingTickets) {
              const filtered = tickets.filter(t => !orderTids!.has(t.ticket_id))
              const bucketed = smartBucketTickets(
                filtered,
                get().ticketsByStatus,
                get().prioritizedTicketIds,
                get().newOrderPosition
              )
              set({ tickets: filtered, ...bucketed })
            }
            return
          }
          // Protected tickets exist — fall through to normal broadcast processing
          // overlayPendingActions will preserve the recalled ticket's optimistic state
        }

        // Schedule a background refetch for authoritative server state.
        // Skip when all tickets for this order have pending actions — the broadcast
        // is our own echo and the optimistic state is already correct.
        const locationId = order.location_id
        if (locationId) {
          const allProtected =
            orderTids &&
            orderTids.size > 0 &&
            Array.from(orderTids).every(tid => _pendingActions.has(tid))
          if (!allProtected) {
            get().scheduleRefetch(locationId)
          }
        }

        // Client-side display filtering — always filter when display has routing rules
        let filteredOrder = order
        if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
          const filteredItems = order.order_items.filter(item =>
            itemMatchesRules(item, cachedRules!, order.order_type)
          )
          if (filteredItems.length === 0) {
            // Track for sound: if this is a new order, the server refetch may add it
            if (!hadExistingTickets) _pendingNewOrderSounds.add(order.id)
            return
          }
          filteredOrder = { ...order, order_items: filteredItems }
        }

        // Build new tickets from broadcast
        const newTickets = buildTicketsFromBroadcast(filteredOrder)

        // Stabilize ticket_id and start_time_epoch for existing tickets so that:
        // (a) mergeTickets reuses the same reference (no FlatList re-mount animation)
        // (b) prioritizedTicketIds still matches the old ticket_id → priority preserved
        // (c) separate fire rounds for the same order stay as separate tickets
        const existingForOrder = orderTids
          ? Array.from(orderTids)
              .map(tid => _ticketsById[tid])
              .filter(Boolean)
          : []
        let stabilizedNewTickets = newTickets
        if (existingForOrder.length > 0) {
          const existingByTicketId = new Map<string, KDSTicket>()
          for (const t of existingForOrder) {
            existingByTicketId.set(t.ticket_id, t)
          }
          stabilizedNewTickets = newTickets.map(newT => {
            const existing = existingByTicketId.get(newT.ticket_id)
            if (!existing) return newT // New course — keep computed ID
            return {
              ...newT,
              ticket_id: existing.ticket_id,
              start_time_epoch: existing.start_time_epoch,
              start_time: existing.start_time
            }
          })
        }

        // Remove old tickets for this order, add stabilized new ones
        const otherTickets = orderTids
          ? tickets.filter(t => !orderTids.has(t.ticket_id))
          : tickets
        const rawMerged = sortKdsTicketsStable([
          ...otherTickets,
          ...stabilizedNewTickets
        ])

        // Overlay pending optimistic states to prevent broadcast clobber
        const overlaid = overlayPendingActions(rawMerged)

        // Merge with existing tickets to reuse unchanged references
        const { merged, mergedById, changed } = mergeTickets(
          overlaid,
          _ticketsById
        )

        // Skip store update when nothing changed (e.g. payment-only broadcasts)
        if (!changed) return

        const reconciled = reconcilePriorityFlags(
          merged,
          get().prioritizedTicketIds
        )
        const bucketed = smartBucketTickets(
          reconciled,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        // Incremental order-id index update: only touch the one order this broadcast is for
        const prevOrderIndex = get()._ticketIdsByOrderId
        const newTidSet = new Set(stabilizedNewTickets.map(t => t.ticket_id))
        const updatedOrderIndex = { ...prevOrderIndex, [order.id]: newTidSet }

        set({
          tickets: reconciled,
          _ticketsById: mergedById,
          _ticketIdsByOrderId: updatedOrderIndex,
          ...bucketed
        })

        // Fire new-order callback (for sound notifications)
        if (!hadExistingTickets && newTickets.length > 0) {
          const cb = get()._onNewOrderCallback
          if (cb) cb(order.order_source ?? null)
        }
      },

      incrementTimerTick: () => {
        set(state => ({ timerTick: state.timerTick + 1 }))
      },

      scheduleRefetch: (locationId: string, immediate?: boolean) => {
        if (_refetchTimeout) clearTimeout(_refetchTimeout)
        _refetchTimeout = setTimeout(() => {
          get()._backgroundFetchTickets(locationId)
        }, immediate ? 300 : 1500)
      },

      // ─── Long-Press Actions ─────────────────────────────────────────

      recallTicket: (ticketId: string) => {
        const { tickets, _ticketsById } = get()
        const ticket = _ticketsById[ticketId]
        if (!ticket || ticket.status !== 'ready') return

        const itemIds = ticket.items.map(i => i.id)
        const recallStatus = getKitchenSentStatus()
        const recallTicketStatus: KDSTicket['status'] =
          recallStatus === 'preparing' ? 'cooking' : 'pending'

        // Register pending action (full ticket override — recall replaces all item statuses)
        const itemStatusMap = new Map<string, string>()
        for (const id of itemIds) itemStatusMap.set(id, recallStatus)
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus: recallTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now()
        })

        // Optimistic: reset all items, ticket to recall status, mark as recalled
        _recalledTicketIds.add(ticketId)
        const updatedTickets = tickets.map(t =>
          t.ticket_id === ticketId
            ? {
                ...t,
                status: recallTicketStatus,
                items: t.items.map(item => ({
                  ...item,
                  kitchen_status: recallStatus,
                  recalled: true
                }))
              }
            : t
        )

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        set({ tickets: updatedTickets, ...bucketed })

        // Backend: recall via RPC with cancellable retry
        const retryKey = `recall_${ticketId}`
        const client = getClient()
        if (client && itemIds.length > 0) {
          scheduleRetry(
            retryKey,
            () => OrderService.recallOrderItems(client, itemIds, recallStatus),
            0,
            () => {
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            },
            () => {
              _pendingActions.delete(ticketId)
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            }
          )
        }
      },

      isTicketRecalled: (ticketId: string) => _recalledTicketIds.has(ticketId),

      prioritizeTicket: (ticketId: string) => {
        const { tickets, _ticketsById, prioritizedTicketIds } = get()
        const ticket = _ticketsById[ticketId]
        if (!ticket) return
        const nextPriorityState = !prioritizedTicketIds.has(ticketId)

        const itemIds = ticket.items.map(i => i.id)

        // Register pending action to protect against broadcast clobber
        const itemStatusMap = new Map<string, string>()
        for (const item of ticket.items)
          itemStatusMap.set(item.id, item.kitchen_status)
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus: ticket.status,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
          prioritized: nextPriorityState
        })

        // Toggle membership in prioritized set
        const nextPrioritized = new Set(prioritizedTicketIds)
        if (nextPriorityState) nextPrioritized.add(ticketId)
        else nextPrioritized.delete(ticketId)

        // Mark ticket + items with prioritized flag
        const updatedTickets = tickets.map(t =>
          t.ticket_id === ticketId
            ? {
                ...t,
                prioritized: nextPriorityState,
                items: t.items.map(i => ({
                  ...i,
                  is_prioritized: nextPriorityState
                }))
              }
            : t
        )

        // Immediate reorder — prevBucket ordering ensures only the new ticket moves
        // (appends to end of priority section), so LinearTransition animates smoothly.
        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          nextPrioritized,
          get().newOrderPosition
        )
        set({
          tickets: updatedTickets,
          prioritizedTicketIds: nextPrioritized,
          ...bucketed
        })

        // Backend sync — clear pending action on success
        const client = getClient()
        if (client && itemIds.length > 0) {
          scheduleRetry(
            `priority_${ticketId}`,
            () =>
              OrderService.togglePriorityOnItems(
                client,
                itemIds,
                nextPriorityState
              ),
            0,
            () => {
              const loc = get()._lastLocationId
              if (loc) get().scheduleRefetch(loc)
            },
            () => {
              _pendingActions.delete(ticketId)
              const loc = get()._lastLocationId
              if (loc) get().scheduleRefetch(loc)
            }
          )
        }
      },

      toggleRush: (ticketId: string) => {
        const { tickets, _ticketsById } = get()
        const ticket = _ticketsById[ticketId]
        if (!ticket) return

        const currentRush = ticket.items.some(i => i.rush)
        const newRush = !currentRush
        const itemIds = ticket.items.map(i => i.id)

        // Register pending action to protect against broadcast clobber
        const itemStatusMap = new Map<string, string>()
        for (const item of ticket.items)
          itemStatusMap.set(item.id, item.kitchen_status)
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus: ticket.status,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
          rushOverride: newRush
        })

        // Optimistic: toggle rush on all items
        const updatedTickets = tickets.map(t =>
          t.ticket_id === ticketId
            ? {
                ...t,
                items: t.items.map(item => ({ ...item, rush: newRush }))
              }
            : t
        )

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        set({ tickets: updatedTickets, ...bucketed })

        // Backend: toggle rush via RPC with cancellable retry
        const client = getClient()
        if (client && itemIds.length > 0) {
          scheduleRetry(
            `rush_${ticketId}`,
            () => OrderService.toggleRushOnItems(client, itemIds, newRush),
            0,
            () => {
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            },
            () => {
              _pendingActions.delete(ticketId)
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            }
          )
        }
      },

      markItemDone: (ticketId: string, itemId: string) => {
        const { tickets, _ticketsById } = get()
        const ticket = _ticketsById[ticketId]
        if (!ticket) return

        const item = ticket.items.find(i => i.id === itemId)
        if (!item || item.kitchen_status === 'ready') return

        // Optimistic: mark item as "ready"
        const updatedItems = ticket.items.map(i =>
          i.id === itemId ? { ...i, kitchen_status: 'ready' } : i
        )

        // Re-derive ticket status
        const allReady = updatedItems.every(i => i.kitchen_status === 'ready')
        const anySent = updatedItems.some(i => i.kitchen_status === 'sent')
        const newTicketStatus: KDSTicket['status'] = allReady
          ? 'ready'
          : anySent
          ? 'pending'
          : 'cooking'

        // Register pending action (merge with existing to avoid clobbering)
        const existing = _pendingActions.get(ticketId)
        const itemStatusMap = existing?.itemStatuses
          ? new Map(existing.itemStatuses)
          : new Map<string, string>()
        itemStatusMap.set(itemId, 'ready')
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus: newTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now()
        })

        const updatedTickets = tickets.map(t => {
          if (t.ticket_id !== ticketId) return t
          const resetEpoch = allReady && _recalledTicketIds.has(ticketId)
          return {
            ...t,
            status: newTicketStatus,
            items: updatedItems,
            ...(resetEpoch ? { start_time_epoch: Date.now() } : {})
          }
        })

        const updatedById = {
          ..._ticketsById,
          [ticketId]: {
            ...ticket,
            status: newTicketStatus,
            items: updatedItems,
            ...(allReady && _recalledTicketIds.has(ticketId)
              ? { start_time_epoch: Date.now() }
              : {})
          }
        }

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        set({ tickets: updatedTickets, _ticketsById: updatedById, ...bucketed })

        // Backend: mark item ready with action-specific retry key to avoid cancelling ticket-level retries
        const retryKey = `item_${ticketId}_${itemId}`
        const client = getClient()
        if (client) {
          scheduleRetry(
            retryKey,
            () =>
              OrderService.bulkUpdateOrderItemStatus(client, [itemId], 'ready'),
            0,
            () => {
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            },
            () => {
              _pendingActions.delete(ticketId)
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            }
          )
        }
      },

      // ─── Done Ticket Actions ────────────────────────────────────────

      recallDoneTicket: (ticketId: string) => {
        const { doneTickets, tickets } = get()
        const ticket = doneTickets.find(t => t.ticket_id === ticketId)
        if (!ticket) return

        const itemIds = ticket.items.map(i => i.id)
        const recallStatus = getKitchenSentStatus()
        const recallTicketStatus: KDSTicket['status'] =
          recallStatus === 'preparing' ? 'cooking' : 'pending'

        // Register pending action to protect optimistic state from broadcast clobber
        const itemStatusMap = new Map<string, string>()
        for (const id of itemIds) itemStatusMap.set(id, recallStatus)
        _pendingActions.set(ticketId, {
          ticketId,
          targetStatus: recallTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now()
        })

        // Move from done → active tickets with workflow-aware status
        _recalledTicketIds.add(ticketId)
        const restoredTicket: KDSTicket = {
          ...ticket,
          status: recallTicketStatus,
          items: ticket.items.map(item => ({
            ...item,
            kitchen_status: recallStatus,
            recalled: true
          }))
        }
        const updatedDone = doneTickets.filter(t => t.ticket_id !== ticketId)
        const updatedTickets = [...tickets, restoredTicket]

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        set({
          tickets: updatedTickets,
          ...bucketed,
          doneTickets: updatedDone,
          doneCount: updatedDone.length
        })

        // Backend: recall via RPC with cancellable retry
        const retryKey = `recall_done_${ticketId}`
        const client = getClient()
        if (client && itemIds.length > 0) {
          scheduleRetry(
            retryKey,
            () => OrderService.recallOrderItems(client, itemIds, recallStatus),
            0,
            () => {
              _pendingActions.delete(ticketId)
            },
            () => {
              _pendingActions.delete(ticketId)
              const lastLoc = get()._lastLocationId
              if (lastLoc) get().scheduleRefetch(lastLoc)
            }
          )
        }
      },

      clearDoneTickets: () => {
        set({ doneTickets: [], doneCount: 0 })
      },

      // ─── Bulk Actions ───────────────────────────────────────────────

      toggleBulkMode: () => {
        set(state => ({
          bulkMode: !state.bulkMode,
          selectedTicketIds: new Set<string>()
        }))
      },

      toggleTicketSelection: (id: string) => {
        set(state => {
          const next = new Set(state.selectedTicketIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { selectedTicketIds: next }
        })
      },

      selectAllVisible: (ids: string[]) => {
        set({ selectedTicketIds: new Set(ids) })
      },

      clearSelection: () => {
        set({ selectedTicketIds: new Set<string>() })
      },

      bulkAdvanceTickets: (ticketIds: string[], locationId: string) => {
        const { tickets } = get()

        // Phase 1: Build index of selected tickets in O(m) where m = selected count
        const selectedSet = new Set(ticketIds)
        const ticketIndex = new Map<string, KDSTicket>()
        for (const t of tickets) {
          if (selectedSet.has(t.ticket_id)) {
            ticketIndex.set(t.ticket_id, t)
          }
        }

        // Phase 2: Determine mutations and batch backend item IDs by newStatus
        const removeIds = new Set<string>()
        const mutations = new Map<
          string,
          {
            ticketStatus: KDSTicket['status']
            newStatus: 'preparing' | 'ready' | 'served'
          }
        >()
        const batchedItemIds: Record<
          'preparing' | 'ready' | 'served',
          string[]
        > = {
          preparing: [],
          ready: [],
          served: []
        }

        for (const [ticketId, ticket] of ticketIndex) {
          const newStatus: 'preparing' | 'ready' | 'served' =
            ticket.status === 'pending'
              ? 'preparing'
              : ticket.status === 'cooking'
              ? 'ready'
              : 'served'

          if (newStatus === 'served') {
            removeIds.add(ticketId)
          } else {
            const ticketStatus: KDSTicket['status'] =
              newStatus === 'preparing' ? 'cooking' : 'ready'
            mutations.set(ticketId, { ticketStatus, newStatus })
          }

          for (const item of ticket.items) {
            batchedItemIds[newStatus].push(item.id)
          }
        }

        // Phase 3: Single pass over tickets to produce final array + capture served
        const updatedTickets: KDSTicket[] = []
        const servedTickets: KDSTicket[] = []
        for (const t of tickets) {
          if (removeIds.has(t.ticket_id)) {
            servedTickets.push({ ...t, status: 'done' as KDSTicket['status'] })
            continue // skip removed
          }
          const mutation = mutations.get(t.ticket_id)
          if (mutation) {
            updatedTickets.push({
              ...t,
              status: mutation.ticketStatus,
              items: t.items.map(item => ({
                ...item,
                kitchen_status: mutation.newStatus
              }))
            })
          } else {
            updatedTickets.push(t)
          }
        }

        // Single state update (including done tickets)
        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition
        )
        const updatedDone =
          servedTickets.length > 0
            ? [...servedTickets, ...get().doneTickets].slice(0, 50)
            : get().doneTickets
        set({
          tickets: updatedTickets,
          ...bucketed,
          selectedTicketIds: new Set<string>(),
          doneTickets: updatedDone,
          doneCount: updatedDone.length
        })

        // Register pending actions for each affected ticket
        for (const [tid, ticket] of ticketIndex) {
          const mutation = mutations.get(tid)
          const itemStatusMap = new Map<string, string>()
          const targetItemStatus = mutation?.newStatus ?? 'served'
          for (const item of ticket.items)
            itemStatusMap.set(item.id, targetItemStatus)
          _pendingActions.set(tid, {
            ticketId: tid,
            targetStatus: removeIds.has(tid)
              ? 'done'
              : (mutation!.ticketStatus as KDSTicket['status']),
            itemStatuses: itemStatusMap,
            timestamp: Date.now()
          })
        }

        // Phase 4: Fire at most 3 batched RPCs (one per status) instead of N
        const client = getClient()
        if (client) {
          for (const status of ['preparing', 'ready', 'served'] as const) {
            const ids = batchedItemIds[status]
            if (ids.length === 0) continue
            const retryKey = `bulk_${status}_${Date.now()}`
            scheduleRetry(
              retryKey,
              () => OrderService.bulkUpdateOrderItemStatus(client, ids, status),
              0,
              () => {
                const lastLoc = get()._lastLocationId
                if (lastLoc) get().scheduleRefetch(lastLoc)
              },
              () => {
                for (const [tid] of ticketIndex) {
                  const m = mutations.get(tid)
                  const effectiveStatus = removeIds.has(tid)
                    ? 'served'
                    : m?.newStatus
                  if (effectiveStatus === status) _pendingActions.delete(tid)
                }
                const lastLoc = get()._lastLocationId
                if (lastLoc) get().scheduleRefetch(lastLoc)
              }
            )
          }
        }
      },

      // ─── Cleanup (for unmount) ──────────────────────────────────────
      _cleanup: () => {
        cancelAllRetries()
        _pendingActions.clear()
        _pendingNewOrderSounds.clear()
        if (_refetchTimeout) {
          clearTimeout(_refetchTimeout)
          _refetchTimeout = null
        }
        _broadcastDebounceTimers.forEach(t => clearTimeout(t))
        _broadcastDebounceTimers.clear()
        _fetchInFlight = false
      }
    }),
    {
      name: 'kds-ticket-storage',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: state => ({
        // Only persist _ticketsById — ticketsByStatus/tickets/counts are derived on rehydrate.
        // This avoids serializing 3 copies of the same ticket data on every bump.
        _ticketsById: state._ticketsById,
        doneTickets: state.doneTickets,
        doneCount: state.doneCount,
        // Persist display config so KDS knows its routing rules offline
        kdsDisplayId: state.kdsDisplayId,
        routingMode: state.routingMode,
        cachedRules: state.cachedRules,
        kdsDisplayConfig: state.kdsDisplayConfig,
        prepStations: state.prepStations,
        enrichedRules: state.enrichedRules
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          state._hasHydrated = true
          state.isInitialLoading = false
          // Rebuild tickets array + indexes + buckets from persisted _ticketsById
          const byId = state._ticketsById ?? {}
          const tickets = Object.values(byId)
          state.tickets = tickets
          state._ticketIdsByOrderId = buildOrderIdIndex(byId)
          const bucketed = smartBucketTickets(tickets, {
            pending: [],
            cooking: [],
            ready: []
          })
          state.ticketsByStatus = bucketed.ticketsByStatus
          state.counts = bucketed.counts
          if (!(state.selectedTicketIds instanceof Set)) {
            state.selectedTicketIds = new Set<string>()
          }
          if (!(state.prioritizedTicketIds instanceof Set)) {
            const derived = new Set<string>()
            for (const t of tickets) {
              if (t.prioritized) derived.add(t.ticket_id)
            }
            state.prioritizedTicketIds = derived
          }
        }
      }
    }
  )
)
