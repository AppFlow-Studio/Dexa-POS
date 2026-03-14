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
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
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

  // Last fetched location (for error recovery refetches)
  _lastLocationId: string | null;

  // Bulk mode
  bulkMode: boolean;
  selectedTicketIds: Set<string>;

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

  // Bulk actions
  toggleBulkMode: () => void;
  toggleTicketSelection: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  bulkAdvanceTickets: (ticketIds: string[], locationId: string) => void;
}

// Debounce timer for scheduleRefetch
let _refetchTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Retry infrastructure for failed status updates ─────────────
const RETRY_DELAYS = [2000, 5000, 10000]; // 3 retries with exponential backoff
const MAX_RETRIES = RETRY_DELAYS.length;

function retryBackendUpdate(
  client: SupabaseClient,
  itemIds: string[],
  newStatus: "preparing" | "ready" | "served",
  retryCount: number,
  onFinalFailure: () => void,
) {
  OrderService.bulkUpdateOrderItemStatus(client, itemIds, newStatus).catch((err) => {
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.warn(
        `[KDSStore] Retry ${retryCount + 1}/${MAX_RETRIES} for status ${newStatus} in ${delay}ms`,
      );
      setTimeout(() => {
        retryBackendUpdate(client, itemIds, newStatus, retryCount + 1, onFinalFailure);
      }, delay);
    } else {
      console.error(
        `[KDSStore] All ${MAX_RETRIES} retries exhausted for status ${newStatus}:`,
        err,
      );
      onFinalFailure();
    }
  });
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

/** Bucket tickets into status groups, reusing unchanged array references */
function smartBucketTickets(
  tickets: KDSTicket[],
  prev: KDSState["ticketsByStatus"],
) {
  const pending: KDSTicket[] = [];
  const cooking: KDSTicket[] = [];
  const ready: KDSTicket[] = [];

  for (const t of tickets) {
    if (t.status === "pending") pending.push(t);
    else if (t.status === "cooking") cooking.push(t);
    else if (t.status === "ready") ready.push(t);
  }

  const finalPending = arraysShallowEqual(pending, prev.pending)
    ? prev.pending
    : pending;
  const finalCooking = arraysShallowEqual(cooking, prev.cooking)
    ? prev.cooking
    : cooking;
  const finalReady = arraysShallowEqual(ready, prev.ready)
    ? prev.ready
    : ready;

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

export const useKDSStore = create<KDSState>((set, get) => ({
  tickets: [],
  ticketsByStatus: { pending: [], cooking: [], ready: [] },
  counts: { pending: 0, cooking: 0, ready: 0 },
  isInitialLoading: true,
  isFetching: false,
  _hasHydrated: false,
  timerTick: 0,
  bulkMode: false,
  selectedTicketIds: new Set<string>(),

  // Display awareness state
  kdsDisplayId: null,
  routingMode: null,
  cachedRules: null,
  kdsDisplayConfig: null,
  prepStations: {},
  enrichedRules: [],
  _lastLocationId: null,

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

    set({
      isInitialLoading: !_hasHydrated,
      isFetching: true,
      _lastLocationId: locationId,
    });
    try {
      // Build RPC params - only pass display ID when routing rules exist
      const params: Record<string, any> = { p_location_id: locationId };
      if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
        params.p_kds_display_id = kdsDisplayId;
      }

      const { data, error } = await client.rpc("get_kds_tickets_v2", params);
      if (error) {
        console.error("[KDSStore] fetchTickets error:", error);
        set({ isInitialLoading: false, isFetching: false });
        return;
      }

      const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? [];
      const tickets = raw.map(t => ({
        ...t,
        start_time_epoch: t.start_time ? new Date(t.start_time).getTime() : 0,
      }));
      const bucketed = smartBucketTickets(tickets, get().ticketsByStatus);

      set({
        tickets,
        ...bucketed,
        _hasHydrated: true,
        isInitialLoading: false,
        isFetching: false,
      });
    } catch (err) {
      console.error("[KDSStore] fetchTickets exception:", err);
      set({ isInitialLoading: false, isFetching: false });
    }
  },

  // Background fetch — only sets isFetching, never isInitialLoading.
  // Used by scheduleRefetch and polling to avoid skeleton flashes.
  _backgroundFetchTickets: async (locationId: string) => {
    const client = getClient();
    if (!client) return;

    const { kdsDisplayId, routingMode, cachedRules } = get();

    set({ isFetching: true, _lastLocationId: locationId });
    try {
      const params: Record<string, any> = { p_location_id: locationId };
      if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
        params.p_kds_display_id = kdsDisplayId;
      }

      const { data, error } = await client.rpc("get_kds_tickets_v2", params);
      if (error) {
        console.error("[KDSStore] _backgroundFetchTickets error:", error);
        set({ isFetching: false });
        return;
      }

      const raw: KDSTicket[] = Array.isArray(data) ? data : data ?? [];
      const tickets = raw.map(t => ({
        ...t,
        start_time_epoch: t.start_time ? new Date(t.start_time).getTime() : 0,
      }));
      const bucketed = smartBucketTickets(tickets, get().ticketsByStatus);

      set({
        tickets,
        ...bucketed,
        _hasHydrated: true,
        isFetching: false,
      });
    } catch (err) {
      console.error("[KDSStore] _backgroundFetchTickets exception:", err);
      set({ isFetching: false });
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

    let updatedTickets: KDSTicket[];
    if (ticketStatus === null) {
      // Served → remove ticket entirely
      updatedTickets = tickets.filter((t) => t.ticket_id !== ticketId);
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

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend sync with retry — revert optimistic state only after all retries exhausted
    const client = getClient();
    if (client && itemIds.length > 0) {
      retryBackendUpdate(
        client,
        itemIds,
        newStatus as "preparing" | "ready" | "served",
        0,
        () => {
          const lastLoc = get()._lastLocationId;
          if (lastLoc) {
            get().scheduleRefetch(lastLoc);
          }
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
        // Use session_id from the order if available (most reliable link to table session)
        if (order && order.session_id) {
          const sessionStore = useTableSessionStore.getState();
          // Find the session directly by session_id using the sessionTableIndex
          const tableIds = sessionStore.sessionTableIndex[order.session_id];
          if (tableIds && tableIds.length > 0) {
            // Get the session from the primary table's entry
            const primaryTableId = tableIds[0];
            const session = sessionStore.sessions[primaryTableId];
            console.log(
              "[KDSStore.advanceTicketStatus] Found session:",
              { sessionId: session?.id, currentStatus: session?.status }
            );
            if (session && session.id === order.session_id) {
              // Update table session to "served" status regardless of current status
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
        const bucketed = smartBucketTickets(filtered, get().ticketsByStatus);
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

    // Build new tickets from broadcast
    const newTickets = buildTicketsFromBroadcast(filteredOrder);

    // Remove old tickets for this order, add new ones
    const otherTickets = tickets.filter((t) => t.db_order_id !== order.id);
    const merged = [...otherTickets, ...newTickets];

    // Sort by start_time ascending (match SQL ordering)
    merged.sort((a, b) => a.start_time_epoch - b.start_time_epoch);

    const bucketed = smartBucketTickets(merged, get().ticketsByStatus);
    set({ tickets: merged, ...bucketed });
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

    // Phase 3: Single pass over tickets to produce final array
    const updatedTickets: KDSTicket[] = [];
    for (const t of tickets) {
      if (removeIds.has(t.ticket_id)) continue; // skip removed
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

    // Single state update
    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus);
    set({ tickets: updatedTickets, ...bucketed, selectedTicketIds: new Set<string>() });

    // Phase 4: Fire at most 3 batched RPCs (one per status) instead of N
    const client = getClient();
    if (client) {
      for (const status of ["preparing", "ready", "served"] as const) {
        const ids = batchedItemIds[status];
        if (ids.length === 0) continue;
        retryBackendUpdate(client, ids, status, 0, () => {
          const lastLoc = get()._lastLocationId;
          if (lastLoc) {
            get().scheduleRefetch(lastLoc);
          }
        });
      }
    }
  },
}));
