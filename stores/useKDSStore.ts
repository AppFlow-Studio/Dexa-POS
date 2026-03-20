import type {
  BroadcastOrderData,
  BroadcastOrderItemData,
  OrderBroadcastPayload,
} from "@/hooks/realtime/useOrdersRealtime";
import { OrderService } from "@/services/orderService";
import {
  KDSDisplayConfig,
  KDSEnrichedRoutingRule,
  KDSRoutingRule,
  KDSTicket,
  KDSTicketItem,
} from "@/types/kds";
import { mmkvStorage } from "@/lib/storage";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useOrderStore } from "./useOrderStore";
import { useTableSessionStore } from "./useTableSessionStore";

// Global client reference (same pattern as other stores)
let _supabaseClient: SupabaseClient | null = null;

export const setKDSSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

const getClient = () => {
  if (!_supabaseClient) {
    console.warn("[KDSStore] Supabase client not set");
  }
  return _supabaseClient!;
};

interface KDSState {
  tickets: KDSTicket[];
  ticketsByStatus: {
    pending: KDSTicket[];
    cooking: KDSTicket[];
    ready: KDSTicket[];
  };
  counts: { pending: number; cooking: number; ready: number };
  doneTickets: KDSTicket[];
  doneCount: number;
  isInitialLoading: boolean;
  isFetching: boolean;
  _hasHydrated: boolean;
  timerTick: number;

  // Display awareness
  kdsDisplayId: string | null;
  routingMode: string | null;
  cachedRules: KDSRoutingRule[] | null;
  kdsDisplayConfig: KDSDisplayConfig | null;
  prepStations: Record<string, { name: string; color: string }>;
  enrichedRules: KDSEnrichedRoutingRule[];

  // Internal ticket lookup for reference-stable merging
  _ticketsById: Record<string, KDSTicket>;

  // Last fetched location (for error recovery refetches)
  _lastLocationId: string | null;

  // Bulk mode
  bulkMode: boolean;
  selectedTicketIds: Set<string>;

  // Priority tracking (local-only)
  prioritizedTicketIds: Set<string>;

  // Actions
  fetchKDSDisplay: (stationId: string) => Promise<void>;
  fetchTickets: (locationId: string) => Promise<void>;
  _backgroundFetchTickets: (locationId: string) => Promise<void>;
  advanceTicketStatus: (
    ticketId: string,
    itemIds: string[],
    newStatus: "preparing" | "ready" | "served",
  ) => void;
  handleOrderBroadcast: (payload: OrderBroadcastPayload) => void;
  incrementTimerTick: () => void;
  scheduleRefetch: (locationId: string) => void;

  // New-order callback (for sound notifications)
  _onNewOrderCallback: ((orderSource: string | null) => void) | null;
  setOnNewOrderCallback: (cb: ((orderSource: string | null) => void) | null) => void;

  // Long-press actions
  recallTicket: (ticketId: string) => void;
  prioritizeTicket: (ticketId: string) => void;
  toggleRush: (ticketId: string) => void;
  markItemDone: (ticketId: string, itemId: string) => void;

  // Done tickets
  recallDoneTicket: (ticketId: string) => void;
  clearDoneTickets: () => void;

  // Bulk actions
  toggleBulkMode: () => void;
  toggleTicketSelection: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  bulkAdvanceTickets: (ticketIds: string[], locationId: string) => void;

  // Cleanup (for unmount)
  _cleanup: () => void;
}

// Debounce timer for scheduleRefetch
let _refetchTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Fetch sequence counter + in-flight guard ───────────────────
let _fetchSeq = 0;
let _fetchInFlight = false;

// ─── Cancellable retry infrastructure ───────────────────────────
const RETRY_DELAYS = [2000, 5000, 10000];
const MAX_RETRIES = RETRY_DELAYS.length;

interface RetryHandle {
  timeoutId: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
}
const _activeRetries = new Map<string, RetryHandle>();

function scheduleRetry(
  key: string,
  performFn: () => Promise<unknown>,
  retryCount: number,
  onSuccess?: () => void,
  onFinalFailure?: () => void,
) {
  cancelRetry(key);
  const handle: RetryHandle = { timeoutId: null, cancelled: false };
  _activeRetries.set(key, handle);

  performFn()
    .then(() => {
      if (handle.cancelled) return;
      _activeRetries.delete(key);
      onSuccess?.();
    })
    .catch((err) => {
      if (handle.cancelled) return;
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount];
        console.warn(
          `[KDSStore] Retry ${retryCount + 1}/${MAX_RETRIES} for ${key} in ${delay}ms`,
        );
        handle.timeoutId = setTimeout(() => {
          if (handle.cancelled) return;
          scheduleRetry(key, performFn, retryCount + 1, onSuccess, onFinalFailure);
        }, delay);
      } else {
        console.error(
          `[KDSStore] All ${MAX_RETRIES} retries exhausted for ${key}:`,
          err,
        );
        _activeRetries.delete(key);
        onFinalFailure?.();
      }
    });
}

function cancelRetry(key: string) {
  const handle = _activeRetries.get(key);
  if (handle) {
    handle.cancelled = true;
    if (handle.timeoutId) clearTimeout(handle.timeoutId);
    _activeRetries.delete(key);
  }
}

function cancelAllRetries() {
  for (const [, handle] of _activeRetries) {
    handle.cancelled = true;
    if (handle.timeoutId) clearTimeout(handle.timeoutId);
  }
  _activeRetries.clear();
}

// ─── Pending action tracking (optimistic update protection) ─────
interface PendingAction {
  ticketId: string;
  targetStatus: KDSTicket["status"] | "done";
  itemStatuses: Map<string, string>;
  timestamp: number;
  prioritized?: boolean;
}
const _pendingActions = new Map<string, PendingAction>();
const PENDING_ACTION_TTL = 30_000;

/** Overlay pending optimistic states onto server/broadcast tickets */
function overlayPendingActions(tickets: KDSTicket[]): KDSTicket[] {
  if (_pendingActions.size === 0) return tickets;
  const now = Date.now();

  return tickets.reduce<KDSTicket[]>((acc, ticket) => {
    const pending = _pendingActions.get(ticket.ticket_id);
    if (!pending) {
      acc.push(ticket);
      return acc;
    }
    if (now - pending.timestamp > PENDING_ACTION_TTL) {
      _pendingActions.delete(ticket.ticket_id);
      acc.push(ticket);
      return acc;
    }
    // Ticket was optimistically served/removed — keep it out
    if (pending.targetStatus === "done") return acc;
    // Overlay optimistic statuses (and preserve pending priority flag)
    acc.push({
      ...ticket,
      status: pending.targetStatus as KDSTicket["status"],
      ...(pending.prioritized != null ? { prioritized: pending.prioritized } : {}),
      items: ticket.items.map((item) => {
        const optimistic = pending.itemStatuses.get(item.id);
        return optimistic ? { ...item, kitchen_status: optimistic } : item;
      }),
    });
    return acc;
  }, []);
}

/** KDS-relevant kitchen statuses */
const KDS_STATUSES = new Set(["sent", "preparing", "ready"]);

/** Terminal order statuses — remove from KDS */
const TERMINAL_ORDER_STATUSES = new Set([
  "completed",
  "cancelled",
  "refunded",
  "void",
]);

/** Shared predicate: should we apply display-based item filtering? */
function shouldUseDisplayFilter(
  kdsDisplayId: string | null,
  routingMode: string | null,
  cachedRules: KDSRoutingRule[] | null,
): boolean {
  return !!(kdsDisplayId && routingMode !== "all" && cachedRules && cachedRules.length > 0);
}

/** Check if an item matches routing rules for client-side filtering */
function itemMatchesRules(
  item: BroadcastOrderItemData,
  rules: KDSRoutingRule[],
  orderType: string | null,
): boolean {
  for (const rule of rules) {
    if (rule.rule_type === "prep_station" && item.prep_station === rule.rule_value) {
      return true;
    }
    if (rule.rule_type === "category" && (
      item.category_name === rule.rule_value ||
      (item.category_id && item.category_id === rule.rule_value)
    )) {
      return true;
    }
    if (rule.rule_type === "order_type" && orderType === rule.rule_value) {
      return true;
    }
  }
  return false;
}

/** Build KDS tickets from a broadcast order's items */
function buildTicketsFromBroadcast(order: BroadcastOrderData): KDSTicket[] {
  const items = order.order_items;
  if (!items || items.length === 0) return [];

  // Filter to KDS-relevant, non-voided items
  const kdsItems = items.filter(
    (item) =>
      !item.is_voided &&
      item.kitchen_status != null &&
      KDS_STATUSES.has(item.kitchen_status),
  );
  if (kdsItems.length === 0) return [];

  // Group by course_number + fire_time (round)
  const byRound = new Map<string, BroadcastOrderItemData[]>();
  for (const item of kdsItems) {
    const course = item.course_number ?? 1;
    const fireTime = item.fire_time ?? "0";
    const key = `${course}|${fireTime}`;
    const existing = byRound.get(key);
    if (existing) existing.push(item);
    else byRound.set(key, [item]);
  }

  const tickets: KDSTicket[] = [];
  for (const [key, roundItems] of byRound) {
    const courseNumber = roundItems[0].course_number ?? 1;
    const fireTime = roundItems[0].fire_time ?? null;
    const fireTimeMs = fireTime ? new Date(fireTime).getTime() : 0;
    const fireTimeEpoch = fireTimeMs ? Math.floor(fireTimeMs / 1000) : 0;

    // Derive ticket status (same logic as SQL: all ready → ready, any sent → pending, else cooking)
    const allReady = roundItems.every((i) => i.kitchen_status === "ready");
    const anySent = roundItems.some((i) => i.kitchen_status === "sent");
    const ticketStatus: KDSTicket["status"] = allReady
      ? "ready"
      : anySent
        ? "pending"
        : "cooking";

    const ticketItems: KDSTicketItem[] = roundItems.map((item) => ({
      id: item.id,
      name: item.item_name,
      quantity: item.quantity,
      kitchen_status: item.kitchen_status!,
      special_instructions: item.special_instructions,
      modifiers: (item.modifiers ?? []).map((m) => ({
        modifier_name: m.modifier_name,
        modifier_group_name: m.modifier_group_name,
        price_modifier: m.price_modifier,
      })),
      prep_station: item.prep_station,
      rush: item.rush,
      is_prioritized: item.is_prioritized,
    }));

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
      table_name: order.table_number,
      customer_name: null,
      start_time: fireTime ?? order.sent_to_kitchen_at,
      start_time_epoch: fireTimeMs || (order.sent_to_kitchen_at ? new Date(order.sent_to_kitchen_at).getTime() : 0),
      item_count: ticketItems.reduce((sum, i) => sum + i.quantity, 0),
      items: ticketItems,
      prioritized: roundItems.some((i) => i.is_prioritized),
    });
  }

  return tickets;
}

/** Shallow-compare two ticket arrays by reference identity */
function arraysShallowEqual(a: KDSTicket[], b: KDSTicket[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Deep-compare two tickets by value, reusing unchanged references */
function ticketDeepEqual(a: KDSTicket, b: KDSTicket): boolean {
  if (a.status !== b.status || a.prioritized !== b.prioritized) return false;
  if (a.item_count !== b.item_count || a.order_number !== b.order_number) return false;
  if (a.display_number !== b.display_number || a.table_name !== b.table_name) return false;
  if (a.customer_name !== b.customer_name || a.start_time !== b.start_time) return false;
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const ai = a.items[i], bi = b.items[i];
    if (ai.id !== bi.id || ai.kitchen_status !== bi.kitchen_status) return false;
    if (ai.quantity !== bi.quantity || ai.rush !== bi.rush) return false;
    if (ai.is_prioritized !== bi.is_prioritized) return false;
    if (ai.special_instructions !== bi.special_instructions) return false;
  }
  return true;
}

/** Merge incoming tickets with existing, reusing unchanged object references */
function mergeTickets(
  incoming: KDSTicket[],
  existingById: Record<string, KDSTicket>,
): { merged: KDSTicket[]; mergedById: Record<string, KDSTicket>; changed: boolean } {
  let changed = false;
  const mergedById: Record<string, KDSTicket> = {};
  const merged: KDSTicket[] = [];
  for (const ticket of incoming) {
    const prev = existingById[ticket.ticket_id];
    if (prev && ticketDeepEqual(prev, ticket)) {
      mergedById[ticket.ticket_id] = prev;
      merged.push(prev);
    } else {
      mergedById[ticket.ticket_id] = ticket;
      merged.push(ticket);
      changed = true;
    }
  }
  if (Object.keys(existingById).length !== merged.length) changed = true;
  return { merged, mergedById, changed };
}

/** Stable sort: prioritized tickets float to front within each bucket */
function prioritySortBucket(
  bucket: KDSTicket[],
  prioritizedIds: Set<string>,
): KDSTicket[] {
  if (prioritizedIds.size === 0) return bucket;
  // Stable sort — prioritized first, then preserve existing order
  const prioritized: KDSTicket[] = [];
  const normal: KDSTicket[] = [];
  for (const t of bucket) {
    if (prioritizedIds.has(t.ticket_id)) prioritized.push(t);
    else normal.push(t);
  }
  if (prioritized.length === 0) return bucket;
  return [...prioritized, ...normal];
}

/** Bucket tickets into status groups, reusing unchanged array references */
function smartBucketTickets(
  tickets: KDSTicket[],
  prev: KDSState["ticketsByStatus"],
  prioritizedIds?: Set<string>,
) {
  const pending: KDSTicket[] = [];
  const cooking: KDSTicket[] = [];
  const ready: KDSTicket[] = [];

  for (const t of tickets) {
    if (t.status === "pending") pending.push(t);
    else if (t.status === "cooking") cooking.push(t);
    else if (t.status === "ready") ready.push(t);
  }

  // Apply priority sorting if we have prioritized tickets
  const pIds = prioritizedIds ?? new Set<string>();
  const sortedPending = prioritySortBucket(pending, pIds);
  const sortedCooking = prioritySortBucket(cooking, pIds);
  const sortedReady = prioritySortBucket(ready, pIds);

  const finalPending = arraysShallowEqual(sortedPending, prev.pending)
    ? prev.pending
    : sortedPending;
  const finalCooking = arraysShallowEqual(sortedCooking, prev.cooking)
    ? prev.cooking
    : sortedCooking;
  const finalReady = arraysShallowEqual(sortedReady, prev.ready)
    ? prev.ready
    : sortedReady;

  return {
    ticketsByStatus: {
      pending: finalPending,
      cooking: finalCooking,
      ready: finalReady,
    },
    counts: {
      pending: finalPending.length,
      cooking: finalCooking.length,
      ready: finalReady.length,
    },
  };
}

export const useKDSStore = create<KDSState>()(persist((set, get) => ({
  tickets: [],
  ticketsByStatus: { pending: [], cooking: [], ready: [] },
  counts: { pending: 0, cooking: 0, ready: 0 },
  doneTickets: [],
  doneCount: 0,
  isInitialLoading: true,
  isFetching: false,
  _hasHydrated: false,
  timerTick: 0,
  bulkMode: false,
  selectedTicketIds: new Set<string>(),
  prioritizedTicketIds: new Set<string>(),

  _ticketsById: {},

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
  setOnNewOrderCallback: (cb) => set({ _onNewOrderCallback: cb }),

  // ─── Fetch KDS Display Config ─────────────────────────────────
  fetchKDSDisplay: async (stationId: string) => {
    const client = getClient();
    if (!client) return;

    try {
      // Query kds_displays by station_id (1:1 FK)
      const { data: display, error: displayError } = await client
        .from("kds_displays")
        .select("*")
        .eq("station_id", stationId)
        .eq("is_active", true)
        .maybeSingle();

      if (displayError) {
        console.error("[KDSStore] fetchKDSDisplay error:", displayError);
        // Fall back to no display (show all items)
        set({ kdsDisplayId: null, routingMode: null, cachedRules: null, kdsDisplayConfig: null, prepStations: {}, enrichedRules: [] });
        return;
      }

      if (!display) {
        // No display configured for this station - backward compat (show all)
        set({ kdsDisplayId: null, routingMode: null, cachedRules: null, kdsDisplayConfig: null, prepStations: {}, enrichedRules: [] });
        return;
      }

      // Fetch routing rules for this display
      const { data: rules, error: rulesError } = await client
        .from("kds_routing_rules")
        .select("rule_type, rule_value")
        .eq("kds_display_id", display.id);

      if (rulesError) {
        console.error("[KDSStore] fetchKDSDisplay rules error:", rulesError);
      }

      // Fetch prep stations for this location
      const { data: prepStationsData, error: psError } = await client
        .from("prep_stations")
        .select("id, name, color")
        .eq("location_id", display.location_id)
        .eq("is_active", true);

      if (psError) {
        console.error("[KDSStore] fetchKDSDisplay prep_stations error:", psError);
      }

      // Build prep station map: name -> { name, color }
      const prepStationsMap: Record<string, { name: string; color: string }> = {};
      if (prepStationsData) {
        for (const ps of prepStationsData) {
          prepStationsMap[ps.name] = { name: ps.name, color: ps.color || "#6b7280" };
        }
      }

      // Build enriched rules with human-readable labels
      const typedRules = (rules as KDSRoutingRule[]) || [];
      const enriched: KDSEnrichedRoutingRule[] = typedRules.map((rule) => {
        let label = rule.rule_value;
        if (rule.rule_type === "prep_station" && prepStationsMap[rule.rule_value]) {
          label = prepStationsMap[rule.rule_value].name;
        }
        return { ...rule, label };
      });

      const config: KDSDisplayConfig = {
        displayName: display.display_name || "Kitchen Display",
        columns: display.columns ?? null,
        alertMinutes: display.alert_minutes ?? null,
        warningMinutes: display.warning_minutes ?? null,
        autoBumpMinutes: display.auto_bump_minutes ?? null,
        soundOnNewOrder: display.sound_on_new_order ?? null,
        soundOnRush: display.sound_on_rush ?? null,
        soundConfig: display.sound_config
          ? (display.sound_config as import("@/services/kds/kdsSoundService").KDSSoundConfig)
          : null,
        showAllergyFlags: display.show_allergy_flags ?? null,
        showOrderNotes: display.show_order_notes ?? null,
        showServerName: display.show_server_name ?? null,
        fontScale: display.font_scale ?? null,
      };

      set({
        kdsDisplayId: display.id,
        routingMode: display.routing_mode || "all",
        cachedRules: typedRules,
        kdsDisplayConfig: config,
        prepStations: prepStationsMap,
        enrichedRules: enriched,
      });
    } catch (err) {
      console.error("[KDSStore] fetchKDSDisplay exception:", err);
      set({ kdsDisplayId: null, routingMode: null, cachedRules: null, kdsDisplayConfig: null, prepStations: {}, enrichedRules: [] });
    }
  },

  // ─── Fetch Tickets ────────────────────────────────────────────
  fetchTickets: async (locationId: string) => {
    const client = getClient();
    if (!client) return;

    const { kdsDisplayId, routingMode, cachedRules, _hasHydrated } = get();

    // Bump sequence to invalidate any in-flight background fetch
    const mySeq = ++_fetchSeq;

    set({
      isInitialLoading: !_hasHydrated,
      isFetching: true,
      _lastLocationId: locationId,
    });
    try {
      const params: Record<string, any> = { p_location_id: locationId };
      if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
        params.p_kds_display_id = kdsDisplayId;
      }

      const { data, error } = await client.rpc("get_kds_tickets_v2", params);

      // Discard stale response (but still reset isFetching)
      if (mySeq !== _fetchSeq) {
        set({ isFetching: false });
        return;
      }

      if (error) {
        console.error("[KDSStore] fetchTickets error:", error);
        set({ isInitialLoading: false, isFetching: false });
        return;
      }

      const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? [];
      const processed = overlayPendingActions(
        raw.map(t => ({
          ...t,
          start_time_epoch: t.start_time ? new Date(t.start_time).getTime() : 0,
        })),
      );
      const { merged, mergedById, changed } = mergeTickets(processed, get()._ticketsById);

      if (!changed && get()._hasHydrated) {
        set({ isInitialLoading: false, isFetching: false });
        return;
      }

      // Hydrate prioritizedTicketIds from server data + preserve pending local priorities
      const nextPrioritized = new Set<string>();
      for (const t of merged) {
        if (t.prioritized) nextPrioritized.add(t.ticket_id);
      }
      for (const id of get().prioritizedTicketIds) {
        if (_pendingActions.has(id) || _activeRetries.has(`priority_${id}`)) nextPrioritized.add(id);
      }

      const bucketed = smartBucketTickets(merged, get().ticketsByStatus, nextPrioritized);

      set({
        tickets: merged,
        _ticketsById: mergedById,
        prioritizedTicketIds: nextPrioritized,
        ...bucketed,
        _hasHydrated: true,
        isInitialLoading: false,
        isFetching: false,
      });
    } catch (err) {
      if (mySeq !== _fetchSeq) {
        set({ isFetching: false });
        return;
      }
      console.error("[KDSStore] fetchTickets exception:", err);
      set({ isInitialLoading: false, isFetching: false });
    }
  },

  // Background fetch — only sets isFetching, never isInitialLoading.
  // Used by scheduleRefetch and polling to avoid skeleton flashes.
  _backgroundFetchTickets: async (locationId: string) => {
    // In-flight guard: skip if another background fetch is running
    if (_fetchInFlight) return;
    _fetchInFlight = true;

    const client = getClient();
    if (!client) {
      _fetchInFlight = false;
      return;
    }

    const { kdsDisplayId, routingMode, cachedRules } = get();
    const mySeq = ++_fetchSeq;

    set({ isFetching: true, _lastLocationId: locationId });
    try {
      const params: Record<string, any> = { p_location_id: locationId };
      if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
        params.p_kds_display_id = kdsDisplayId;
      }

      const { data, error } = await client.rpc("get_kds_tickets_v2", params);

      // Discard stale response
      if (mySeq !== _fetchSeq) return;

      if (error) {
        console.error("[KDSStore] _backgroundFetchTickets error:", error);
        set({ isFetching: false });
        return;
      }

      const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? [];
      const processed = overlayPendingActions(
        raw.map(t => ({
          ...t,
          start_time_epoch: t.start_time ? new Date(t.start_time).getTime() : 0,
        })),
      );
      const { merged, mergedById, changed } = mergeTickets(processed, get()._ticketsById);

      if (!changed && get()._hasHydrated) {
        set({ isFetching: false });
        return;
      }

      // Hydrate prioritizedTicketIds from server data + preserve pending local priorities
      const nextPrioritized = new Set<string>();
      for (const t of merged) {
        if (t.prioritized) nextPrioritized.add(t.ticket_id);
      }
      for (const id of get().prioritizedTicketIds) {
        if (_pendingActions.has(id) || _activeRetries.has(`priority_${id}`)) nextPrioritized.add(id);
      }

      const bucketed = smartBucketTickets(merged, get().ticketsByStatus, nextPrioritized);

      set({
        tickets: merged,
        _ticketsById: mergedById,
        prioritizedTicketIds: nextPrioritized,
        ...bucketed,
        _hasHydrated: true,
        isFetching: false,
      });
    } catch (err) {
      if (mySeq !== _fetchSeq) return;
      console.error("[KDSStore] _backgroundFetchTickets exception:", err);
      set({ isFetching: false });
    } finally {
      _fetchInFlight = false;
    }
  },

  advanceTicketStatus: (ticketId, itemIds, newStatus) => {
    const { tickets } = get();

    // Find the ticket to get the order ID
    const ticket = tickets.find((t) => t.ticket_id === ticketId);
    const orderId = ticket?.db_order_id;

    // Map newStatus to KDS ticket status for optimistic update
    const ticketStatus =
      newStatus === "preparing"
        ? "cooking"
        : newStatus === "ready"
          ? "ready"
          : null; // "served" removes from KDS

    // Register pending action (protects optimistic state from broadcast clobber)
    const itemStatusMap = new Map<string, string>();
    for (const id of itemIds) itemStatusMap.set(id, newStatus);
    _pendingActions.set(ticketId, {
      ticketId,
      targetStatus: ticketStatus === null ? "done" : (ticketStatus as KDSTicket["status"]),
      itemStatuses: itemStatusMap,
      timestamp: Date.now(),
    });

    let updatedTickets: KDSTicket[];
    if (ticketStatus === null) {
      // Served → remove from active, add to done
      const servedTicket = tickets.find((t) => t.ticket_id === ticketId);
      updatedTickets = tickets.filter((t) => t.ticket_id !== ticketId);

      if (servedTicket) {
        const updatedDone = [
          { ...servedTicket, status: "done" as KDSTicket["status"] },
          ...get().doneTickets,
        ].slice(0, 50);
        set({ doneTickets: updatedDone, doneCount: updatedDone.length });
      }
    } else {
      const itemIdSet = new Set(itemIds);
      updatedTickets = tickets.map((t) =>
        t.ticket_id === ticketId
          ? {
              ...t,
              status: ticketStatus as KDSTicket["status"],
              items: t.items.map((item) =>
                itemIdSet.has(item.id)
                  ? { ...item, kitchen_status: newStatus }
                  : item,
              ),
            }
          : t,
      );
    }

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend sync with cancellable retry (action-specific key to avoid cross-action cancellation)
    const retryKey = `advance_${ticketId}_${newStatus}`;
    const client = getClient();
    if (client && itemIds.length > 0) {
      scheduleRetry(
        retryKey,
        () => OrderService.bulkUpdateOrderItemStatus(client, itemIds, newStatus),
        0,
        () => { _pendingActions.delete(ticketId); },
        () => {
          _pendingActions.delete(ticketId);
          const lastLoc = get()._lastLocationId;
          if (lastLoc) get().scheduleRefetch(lastLoc);
        },
      );

      // When all items are marked as served in KDS, also update the table session to "served"
      if (newStatus === "served" && orderId) {
        const orderStore = useOrderStore.getState();
        const order = orderStore.getOrder(orderId);
        console.log(
          "[KDSStore.advanceTicketStatus] Checking for table session update:",
          { orderId, session_id: order?.session_id }
        );
        if (order && order.session_id) {
          const sessionStore = useTableSessionStore.getState();
          const tableIds = sessionStore.sessionTableIndex[order.session_id];
          if (tableIds && tableIds.length > 0) {
            const primaryTableId = tableIds[0];
            const session = sessionStore.sessions[primaryTableId];
            console.log(
              "[KDSStore.advanceTicketStatus] Found session:",
              { sessionId: session?.id, currentStatus: session?.status }
            );
            if (session && session.id === order.session_id) {
              console.log(
                "[KDSStore.advanceTicketStatus] Calling updateSessionStatus with served"
              );
              sessionStore.updateSessionStatus(session.id, "served").catch((err) => {
                console.error(
                  "[KDSStore] Failed to update table session to served:",
                  err,
                );
              });
            }
          }
        }
      }
    }
  },

  handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
    const order = payload.data?.order;
    if (!order) return;

    // Gate: order must have been fired to kitchen
    // Accept sent_to_kitchen_at OR status of sent_to_kitchen/preparing
    if (
      !order.sent_to_kitchen_at &&
      order.status !== "sent_to_kitchen" &&
      order.status !== "preparing"
    ) {
      return;
    }

    // Skip if no items (payment-only broadcast)
    if (!order.order_items || order.order_items.length === 0) return;

    const { tickets, kdsDisplayId, routingMode, cachedRules } = get();

    // Terminal statuses: remove all tickets for this order
    if (TERMINAL_ORDER_STATUSES.has(order.status)) {
      const filtered = tickets.filter((t) => t.db_order_id !== order.id);
      if (filtered.length !== tickets.length) {
        const bucketed = smartBucketTickets(filtered, get().ticketsByStatus, get().prioritizedTicketIds);
        set({ tickets: filtered, ...bucketed });
      }
      return;
    }

    // Always schedule a background refetch for authoritative server state.
    // This is critical for display-filtered KDS stations where client-side
    // filtering may miss items that server-side routing (kds_item_status) includes.
    const locationId = order.location_id;
    if (locationId) {
      get().scheduleRefetch(locationId);
    }

    // Client-side display filtering for broadcast items
    let filteredOrder = order;
    if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
      const hasExistingTickets = tickets.some((t) => t.db_order_id === order.id);

      if (!hasExistingTickets) {
        // New order: apply client-side filtering (server refetch will correct if needed)
        const filteredItems = order.order_items.filter((item) =>
          itemMatchesRules(item, cachedRules!, order.order_type),
        );
        if (filteredItems.length === 0) {
          return; // Skip optimistic update — refetch already scheduled above
        }
        filteredOrder = { ...order, order_items: filteredItems };
      }
      // Existing tickets: trust server routing, process full broadcast
    }

    // Detect if this is a NEW order (no existing tickets for this db_order_id)
    const hadExistingTickets = tickets.some((t) => t.db_order_id === order.id);

    // Build new tickets from broadcast
    const newTickets = buildTicketsFromBroadcast(filteredOrder);

    // Remove old tickets for this order, add new ones
    const otherTickets = tickets.filter((t) => t.db_order_id !== order.id);
    const rawMerged = [...otherTickets, ...newTickets];

    // Sort by start_time ascending (match SQL ordering)
    rawMerged.sort((a, b) => a.start_time_epoch - b.start_time_epoch);

    // Overlay pending optimistic states to prevent broadcast clobber
    const overlaid = overlayPendingActions(rawMerged);

    // Merge with existing tickets to reuse unchanged references
    const { merged, mergedById } = mergeTickets(overlaid, get()._ticketsById);

    const bucketed = smartBucketTickets(merged, get().ticketsByStatus, get().prioritizedTicketIds);
    set({ tickets: merged, _ticketsById: mergedById, ...bucketed });

    // Fire new-order callback (for sound notifications)
    if (!hadExistingTickets && newTickets.length > 0) {
      const cb = get()._onNewOrderCallback;
      if (cb) cb(order.order_source ?? null);
    }
  },

  incrementTimerTick: () => {
    set((state) => ({ timerTick: state.timerTick + 1 }));
  },

  scheduleRefetch: (locationId: string) => {
    if (_refetchTimeout) clearTimeout(_refetchTimeout);
    _refetchTimeout = setTimeout(() => {
      get()._backgroundFetchTickets(locationId);
    }, 5000);
  },

  // ─── Long-Press Actions ─────────────────────────────────────────

  recallTicket: (ticketId: string) => {
    const { tickets } = get();
    const ticket = tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket || ticket.status !== "ready") return;

    const itemIds = ticket.items.map((i) => i.id);

    // Register pending action (full ticket override — recall replaces all item statuses)
    const itemStatusMap = new Map<string, string>();
    for (const id of itemIds) itemStatusMap.set(id, "sent");
    _pendingActions.set(ticketId, {
      ticketId,
      targetStatus: "pending",
      itemStatuses: itemStatusMap,
      timestamp: Date.now(),
    });


    // Optimistic: reset all items to "sent", ticket to "pending"
    const updatedTickets = tickets.map((t) =>
      t.ticket_id === ticketId
        ? {
            ...t,
            status: "pending" as KDSTicket["status"],
            items: t.items.map((item) => ({
              ...item,
              kitchen_status: "sent",
            })),
          }
        : t,
    );

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend: recall via RPC with cancellable retry
    const retryKey = `recall_${ticketId}`;
    const client = getClient();
    if (client && itemIds.length > 0) {
      scheduleRetry(
        retryKey,
        () => OrderService.recallOrderItems(client, itemIds),
        0,
        () => { _pendingActions.delete(ticketId); },
        () => {
          _pendingActions.delete(ticketId);
          const lastLoc = get()._lastLocationId;
          if (lastLoc) get().scheduleRefetch(lastLoc);
        },
      );
    }
  },

  prioritizeTicket: (ticketId: string) => {
    const { tickets, prioritizedTicketIds } = get();
    const ticket = tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket) return;

    // Add to prioritized set
    const nextPrioritized = new Set(prioritizedTicketIds);
    nextPrioritized.add(ticketId);

    // Mark ticket + items with prioritized flag
    const updatedTickets = tickets.map((t) =>
      t.ticket_id === ticketId
        ? { ...t, prioritized: true, items: t.items.map(i => ({ ...i, is_prioritized: true })) }
        : t,
    );

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, nextPrioritized);
    set({ tickets: updatedTickets, prioritizedTicketIds: nextPrioritized, ...bucketed });

    // Backend sync (fire-and-forget with retry)
    const client = getClient();
    const itemIds = ticket.items.map((i) => i.id);
    if (client && itemIds.length > 0) {
      scheduleRetry(
        `priority_${ticketId}`,
        () => OrderService.togglePriorityOnItems(client, itemIds, true),
        0,
        undefined,
        () => {
          const loc = get()._lastLocationId;
          if (loc) get().scheduleRefetch(loc);
        },
      );
    }
  },

  toggleRush: (ticketId: string) => {
    const { tickets } = get();
    const ticket = tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket) return;

    const currentRush = ticket.items.some((i) => i.rush);
    const newRush = !currentRush;
    const itemIds = ticket.items.map((i) => i.id);

    // Optimistic: toggle rush on all items
    const updatedTickets = tickets.map((t) =>
      t.ticket_id === ticketId
        ? {
            ...t,
            items: t.items.map((item) => ({ ...item, rush: newRush })),
          }
        : t,
    );

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend: toggle rush via RPC with cancellable retry
    const client = getClient();
    if (client && itemIds.length > 0) {
      scheduleRetry(
        `rush_${ticketId}`,
        () => OrderService.toggleRushOnItems(client, itemIds, newRush),
        0,
        undefined,
        () => {
          const lastLoc = get()._lastLocationId;
          if (lastLoc) get().scheduleRefetch(lastLoc);
        },
      );
    }
  },

  markItemDone: (ticketId: string, itemId: string) => {
    const { tickets } = get();
    const ticket = tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket) return;

    const item = ticket.items.find((i) => i.id === itemId);
    if (!item || item.kitchen_status === "ready") return;

    // Optimistic: mark item as "ready"
    const updatedItems = ticket.items.map((i) =>
      i.id === itemId ? { ...i, kitchen_status: "ready" } : i,
    );

    // Re-derive ticket status
    const allReady = updatedItems.every((i) => i.kitchen_status === "ready");
    const anySent = updatedItems.some((i) => i.kitchen_status === "sent");
    const newTicketStatus: KDSTicket["status"] = allReady
      ? "ready"
      : anySent
        ? "pending"
        : "cooking";

    // Register pending action (merge with existing to avoid clobbering)
    const existing = _pendingActions.get(ticketId);
    const itemStatusMap = existing?.itemStatuses
      ? new Map(existing.itemStatuses)
      : new Map<string, string>();
    itemStatusMap.set(itemId, "ready");
    _pendingActions.set(ticketId, {
      ticketId,
      targetStatus: newTicketStatus,
      itemStatuses: itemStatusMap,
      timestamp: Date.now(),
    });

    const updatedTickets = tickets.map((t) =>
      t.ticket_id === ticketId
        ? { ...t, status: newTicketStatus, items: updatedItems }
        : t,
    );

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend: mark item ready with action-specific retry key to avoid cancelling ticket-level retries
    const retryKey = `item_${ticketId}_${itemId}`;
    const client = getClient();
    if (client) {
      scheduleRetry(
        retryKey,
        () => OrderService.bulkUpdateOrderItemStatus(client, [itemId], "ready"),
        0,
        () => { _pendingActions.delete(ticketId); },
        () => {
          _pendingActions.delete(ticketId);
          const lastLoc = get()._lastLocationId;
          if (lastLoc) get().scheduleRefetch(lastLoc);
        },
      );
    }
  },

  // ─── Done Ticket Actions ────────────────────────────────────────

  recallDoneTicket: (ticketId: string) => {
    const { doneTickets, tickets } = get();
    const ticket = doneTickets.find((t) => t.ticket_id === ticketId);
    if (!ticket) return;

    const itemIds = ticket.items.map((i) => i.id);

    // Move from done → active tickets as "pending"
    const restoredTicket: KDSTicket = {
      ...ticket,
      status: "pending" as KDSTicket["status"],
      items: ticket.items.map((item) => ({ ...item, kitchen_status: "sent" })),
    };
    const updatedDone = doneTickets.filter((t) => t.ticket_id !== ticketId);
    const updatedTickets = [...tickets, restoredTicket];

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    set({
      tickets: updatedTickets,
      ...bucketed,
      doneTickets: updatedDone,
      doneCount: updatedDone.length,
    });

    // Backend: recall via existing RPC
    const client = getClient();
    if (client && itemIds.length > 0) {
      OrderService.recallOrderItems(client, itemIds).catch((err) => {
        console.error("[KDSStore] recallDoneTicket backend error:", err);
        const lastLoc = get()._lastLocationId;
        if (lastLoc) get().scheduleRefetch(lastLoc);
      });
    }
  },

  clearDoneTickets: () => {
    set({ doneTickets: [], doneCount: 0 });
  },

  // ─── Bulk Actions ───────────────────────────────────────────────

  toggleBulkMode: () => {
    set((state) => ({
      bulkMode: !state.bulkMode,
      selectedTicketIds: new Set<string>(),
    }));
  },

  toggleTicketSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedTicketIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTicketIds: next };
    });
  },

  selectAllVisible: (ids: string[]) => {
    set({ selectedTicketIds: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedTicketIds: new Set<string>() });
  },

  bulkAdvanceTickets: (ticketIds: string[], locationId: string) => {
    const { tickets } = get();

    // Phase 1: Build index of selected tickets in O(m) where m = selected count
    const selectedSet = new Set(ticketIds);
    const ticketIndex = new Map<string, KDSTicket>();
    for (const t of tickets) {
      if (selectedSet.has(t.ticket_id)) {
        ticketIndex.set(t.ticket_id, t);
      }
    }

    // Phase 2: Determine mutations and batch backend item IDs by newStatus
    const removeIds = new Set<string>();
    const mutations = new Map<string, { ticketStatus: KDSTicket["status"]; newStatus: "preparing" | "ready" | "served" }>();
    const batchedItemIds: Record<"preparing" | "ready" | "served", string[]> = {
      preparing: [],
      ready: [],
      served: [],
    };

    for (const [ticketId, ticket] of ticketIndex) {
      const newStatus: "preparing" | "ready" | "served" =
        ticket.status === "pending"
          ? "preparing"
          : ticket.status === "cooking"
            ? "ready"
            : "served";

      if (newStatus === "served") {
        removeIds.add(ticketId);
      } else {
        const ticketStatus: KDSTicket["status"] = newStatus === "preparing" ? "cooking" : "ready";
        mutations.set(ticketId, { ticketStatus, newStatus });
      }

      for (const item of ticket.items) {
        batchedItemIds[newStatus].push(item.id);
      }
    }

    // Phase 3: Single pass over tickets to produce final array + capture served
    const updatedTickets: KDSTicket[] = [];
    const servedTickets: KDSTicket[] = [];
    for (const t of tickets) {
      if (removeIds.has(t.ticket_id)) {
        servedTickets.push({ ...t, status: "done" as KDSTicket["status"] });
        continue; // skip removed
      }
      const mutation = mutations.get(t.ticket_id);
      if (mutation) {
        updatedTickets.push({
          ...t,
          status: mutation.ticketStatus,
          items: t.items.map((item) => ({
            ...item,
            kitchen_status: mutation.newStatus,
          })),
        });
      } else {
        updatedTickets.push(t);
      }
    }

    // Single state update (including done tickets)
    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus, get().prioritizedTicketIds);
    const updatedDone = servedTickets.length > 0
      ? [...servedTickets, ...get().doneTickets].slice(0, 50)
      : get().doneTickets;
    set({
      tickets: updatedTickets,
      ...bucketed,
      selectedTicketIds: new Set<string>(),
      doneTickets: updatedDone,
      doneCount: updatedDone.length,
    });

    // Register pending actions for each affected ticket
    for (const [tid, ticket] of ticketIndex) {
      const mutation = mutations.get(tid);
      const itemStatusMap = new Map<string, string>();
      const targetItemStatus = mutation?.newStatus ?? "served";
      for (const item of ticket.items) itemStatusMap.set(item.id, targetItemStatus);
      _pendingActions.set(tid, {
        ticketId: tid,
        targetStatus: removeIds.has(tid) ? "done" : (mutation!.ticketStatus as KDSTicket["status"]),
        itemStatuses: itemStatusMap,
        timestamp: Date.now(),
      });
    }

    // Phase 4: Fire at most 3 batched RPCs (one per status) instead of N
    const client = getClient();
    if (client) {
      for (const status of ["preparing", "ready", "served"] as const) {
        const ids = batchedItemIds[status];
        if (ids.length === 0) continue;
        const retryKey = `bulk_${status}_${Date.now()}`;
        scheduleRetry(
          retryKey,
          () => OrderService.bulkUpdateOrderItemStatus(client, ids, status),
          0,
          () => {
            // Clear pending actions for tickets in this batch
            for (const [tid] of ticketIndex) {
              const m = mutations.get(tid);
              const effectiveStatus = removeIds.has(tid) ? "served" : m?.newStatus;
              if (effectiveStatus === status) _pendingActions.delete(tid);
            }
          },
          () => {
            for (const [tid] of ticketIndex) {
              const m = mutations.get(tid);
              const effectiveStatus = removeIds.has(tid) ? "served" : m?.newStatus;
              if (effectiveStatus === status) _pendingActions.delete(tid);
            }
            const lastLoc = get()._lastLocationId;
            if (lastLoc) get().scheduleRefetch(lastLoc);
          },
        );
      }
    }
  },

  // ─── Cleanup (for unmount) ──────────────────────────────────────
  _cleanup: () => {
    cancelAllRetries();
    _pendingActions.clear();
    if (_refetchTimeout) { clearTimeout(_refetchTimeout); _refetchTimeout = null; }
    _fetchInFlight = false;
  },
}), {
  name: "kds-ticket-storage",
  storage: createJSONStorage(() => mmkvStorage),
  partialize: (state) => ({
    // Persist only ticket data for offline durability
    tickets: state.tickets,
    ticketsByStatus: state.ticketsByStatus,
    counts: state.counts,
    doneTickets: state.doneTickets,
    doneCount: state.doneCount,
    _ticketsById: state._ticketsById,
    // Persist display config so KDS knows its routing rules offline
    kdsDisplayId: state.kdsDisplayId,
    routingMode: state.routingMode,
    cachedRules: state.cachedRules,
    kdsDisplayConfig: state.kdsDisplayConfig,
    prepStations: state.prepStations,
    enrichedRules: state.enrichedRules,
  }),
  onRehydrateStorage: () => (state) => {
    if (state) {
      // Mark as hydrated so UI knows data is available
      state._hasHydrated = true;
      state.isInitialLoading = false;
      // Convert Set fields back from serialized form
      if (!(state.selectedTicketIds instanceof Set)) {
        state.selectedTicketIds = new Set<string>();
      }
      if (!(state.prioritizedTicketIds instanceof Set)) {
        state.prioritizedTicketIds = new Set<string>();
      }
    }
  },
}));
