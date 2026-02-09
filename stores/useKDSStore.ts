import type {
  BroadcastOrderData,
  BroadcastOrderItemData,
  OrderBroadcastPayload,
} from "@/hooks/realtime/useOrdersRealtime";
import { OrderService } from "@/services/orderService";
import { KDSTicket, KDSTicketItem } from "@/types/kds";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

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
  isLoading: boolean;
  timerTick: number;

  // Bulk mode
  bulkMode: boolean;
  selectedTicketIds: Set<string>;

  // Actions
  fetchTickets: (locationId: string) => Promise<void>;
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

/** KDS-relevant kitchen statuses */
const KDS_STATUSES = new Set(["sent", "preparing", "ready"]);

/** Terminal order statuses — remove from KDS */
const TERMINAL_ORDER_STATUSES = new Set([
  "completed",
  "cancelled",
  "refunded",
  "void",
]);

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

  // Group by course_number
  const byCourse = new Map<number, BroadcastOrderItemData[]>();
  for (const item of kdsItems) {
    const course = item.course_number ?? 1;
    const existing = byCourse.get(course);
    if (existing) existing.push(item);
    else byCourse.set(course, [item]);
  }

  const tickets: KDSTicket[] = [];
  for (const [courseNumber, courseItems] of byCourse) {
    // Derive ticket status (same logic as SQL: all ready → ready, any sent → pending, else cooking)
    const allReady = courseItems.every((i) => i.kitchen_status === "ready");
    const anySent = courseItems.some((i) => i.kitchen_status === "sent");
    const ticketStatus: KDSTicket["status"] = allReady
      ? "ready"
      : anySent
        ? "pending"
        : "cooking";

    const ticketItems: KDSTicketItem[] = courseItems.map((item) => ({
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
    }));

    tickets.push({
      ticket_id: `${order.id}_c${courseNumber}`,
      order_id: order.id,
      db_order_id: order.id,
      order_number: order.order_number,
      display_number: order.display_number,
      course_number: courseNumber,
      status: ticketStatus,
      order_type: order.order_type,
      table_name: order.table_number,
      customer_name: null,
      start_time: order.sent_to_kitchen_at,
      item_count: ticketItems.length,
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
  isLoading: false,
  timerTick: 0,
  bulkMode: false,
  selectedTicketIds: new Set<string>(),

  fetchTickets: async (locationId: string) => {
    const client = getClient();
    if (!client) return;

    set({ isLoading: true });
    try {
      const { data, error } = await OrderService.getKDSTickets(
        client,
        locationId,
      );
      if (error) {
        console.error("[KDSStore] fetchTickets error:", error);
        return;
      }

      const tickets: KDSTicket[] = Array.isArray(data) ? data : data ?? [];
      const bucketed = smartBucketTickets(tickets, get().ticketsByStatus);

      set({
        tickets,
        ...bucketed,
        isLoading: false,
      });
    } catch (err) {
      console.error("[KDSStore] fetchTickets exception:", err);
      set({ isLoading: false });
    }
  },

  advanceTicketStatus: (ticketId, itemIds, newStatus) => {
    const { tickets } = get();

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
      updatedTickets = tickets.map((t) =>
        t.ticket_id === ticketId
          ? {
              ...t,
              status: ticketStatus as KDSTicket["status"],
              items: t.items.map((item) =>
                itemIds.includes(item.id)
                  ? { ...item, kitchen_status: newStatus }
                  : item,
              ),
            }
          : t,
      );
    }

    const bucketed = smartBucketTickets(updatedTickets, get().ticketsByStatus);
    set({ tickets: updatedTickets, ...bucketed });

    // Backend sync — fire and forget
    const client = getClient();
    if (client && itemIds.length > 0) {
      OrderService.bulkUpdateOrderItemStatus(
        client,
        itemIds,
        newStatus as "preparing" | "ready" | "served",
      ).catch((err) => {
        console.error(
          `[KDSStore] Failed to sync status ${newStatus}:`,
          err,
        );
      });
    }
  },

  handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
    const order = payload.data?.order;
    if (!order) return;

    // Gate: order must have been fired to kitchen
    if (!order.sent_to_kitchen_at) return;

    // Skip if no items (payment-only broadcast)
    if (!order.order_items || order.order_items.length === 0) return;

    const { tickets } = get();

    // Terminal statuses: remove all tickets for this order
    if (TERMINAL_ORDER_STATUSES.has(order.status)) {
      const filtered = tickets.filter((t) => t.db_order_id !== order.id);
      if (filtered.length !== tickets.length) {
        const bucketed = smartBucketTickets(filtered, get().ticketsByStatus);
        set({ tickets: filtered, ...bucketed });
      }
      return;
    }

    // Build new tickets from broadcast
    const newTickets = buildTicketsFromBroadcast(order);

    // Remove old tickets for this order, add new ones
    const otherTickets = tickets.filter((t) => t.db_order_id !== order.id);
    const merged = [...otherTickets, ...newTickets];

    // Sort by start_time ascending (match SQL ordering)
    merged.sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return aTime - bTime;
    });

    const bucketed = smartBucketTickets(merged, get().ticketsByStatus);
    set({ tickets: merged, ...bucketed });
  },

  incrementTimerTick: () => {
    set((state) => ({ timerTick: state.timerTick + 1 }));
  },

  scheduleRefetch: (locationId: string) => {
    if (_refetchTimeout) clearTimeout(_refetchTimeout);
    _refetchTimeout = setTimeout(() => {
      get().fetchTickets(locationId);
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
    let { tickets } = get();
    const backendUpdates: {
      itemIds: string[];
      newStatus: "preparing" | "ready" | "served";
    }[] = [];

    for (const ticketId of ticketIds) {
      const ticket = tickets.find((t) => t.ticket_id === ticketId);
      if (!ticket) continue;

      const itemIds = ticket.items.map((i) => i.id);
      const newStatus: "preparing" | "ready" | "served" =
        ticket.status === "pending"
          ? "preparing"
          : ticket.status === "cooking"
            ? "ready"
            : "served";

      const ticketStatus: KDSTicket["status"] | null =
        newStatus === "preparing"
          ? "cooking"
          : newStatus === "ready"
            ? "ready"
            : null;

      if (ticketStatus === null) {
        tickets = tickets.filter((t) => t.ticket_id !== ticketId);
      } else {
        tickets = tickets.map((t) =>
          t.ticket_id === ticketId
            ? {
                ...t,
                status: ticketStatus,
                items: t.items.map((item) =>
                  itemIds.includes(item.id)
                    ? { ...item, kitchen_status: newStatus }
                    : item,
                ),
              }
            : t,
        );
      }
      backendUpdates.push({ itemIds, newStatus });
    }

    // Single state update
    const bucketed = smartBucketTickets(tickets, get().ticketsByStatus);
    set({ tickets, ...bucketed, selectedTicketIds: new Set<string>() });

    // Fire-and-forget backend syncs
    const client = getClient();
    if (client) {
      for (const { itemIds, newStatus } of backendUpdates) {
        OrderService.bulkUpdateOrderItemStatus(
          client,
          itemIds,
          newStatus,
        ).catch(console.error);
      }
    }
    if (locationId) get().scheduleRefetch(locationId);
  },
}));
