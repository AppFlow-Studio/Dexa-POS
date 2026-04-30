import type {
    BroadcastOrderData,
    BroadcastOrderItemData,
    OrderBroadcastPayload,
} from "@/hooks/realtime/useOrdersRealtime";
import {
    getKitchenSentStatus,
    getOrderSentStatus,
} from "@/lib/kitchenStatusUtils";
import { toBulkUpdateStatusKey } from "@/lib/network/idempotencyKey";
import { normalizePlatform } from "@/lib/platformAliases";
import { createLazyPersistStorage, getJSON, setJSON } from "@/lib/storage";
import { OrderService } from "@/services/orderService";
import {
    KDSDisplayConfig,
    KDSEnrichedRoutingRule,
    KDSRoutingRule,
    KDSTicket,
    KDSTicketItem,
} from "@/types/kds";
import { isHeaderOnlyBroadcast } from "@/utils/orderTransformers";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useFloorPlanStore } from "./useFloorPlanStore";
import { useOrderStore } from "./useOrderStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";
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

function resolveKdsTableName(rawTableNumber?: string | null): string | null {
  if (!rawTableNumber) return null;

  const value = rawTableNumber.trim();
  if (!value) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  if (!isUuid) return value;

  const table = useFloorPlanStore.getState().tablesById[value];
  const tableName = table?.name?.trim();
  return tableName || null;
}

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
  // O(1) order-level lookups: db_order_id → Set<ticket_id>
  _ticketIdsByOrderId: Record<string, Set<string>>;

  // Last fetched location (for error recovery refetches)
  _lastLocationId: string | null;

  // Bulk mode
  bulkMode: boolean;
  selectedTicketIds: Set<string>;

  // Priority tracking (local-only)
  prioritizedTicketIds: Set<string>;

  // New order positioning
  newOrderPosition: "left" | "right";

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
  _processOrderBroadcast: (payload: OrderBroadcastPayload) => void;
  nowEpochMs: number;
  incrementTimerTick: () => void;
  scheduleRefetch: (locationId: string, immediate?: boolean) => void;

  // New-order callback (for sound notifications)
  _onNewOrderCallback: ((orderSource: string | null) => void) | null;
  setOnNewOrderCallback: (
    cb: ((orderSource: string | null) => void) | null,
  ) => void;

  // Long-press actions
  recallTicket: (ticketId: string) => void;
  prioritizeTicket: (ticketId: string) => void;
  toggleRush: (ticketId: string) => void;
  markItemDone: (ticketId: string, itemId: string) => void;
  isTicketRecalled: (ticketId: string) => boolean;

  // Done tickets
  recallDoneTicket: (ticketId: string) => void;
  clearDoneTickets: () => void;

  // Focused ticket (ephemeral UI state, not persisted)
  focusedTicketId: string | null;
  setFocusedTicketId: (id: string | null) => void;

  // Bulk actions
  toggleBulkMode: () => void;
  toggleTicketSelection: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  bulkAdvanceTickets: (ticketIds: string[], locationId: string) => void;
  bulkMarkTicketsDone: (ticketIds: string[]) => void;

  // Config
  setNewOrderPosition: (pos: "left" | "right") => void;

  // Cleanup (for unmount)
  _cleanup: () => void;
}

// Debounce timer for scheduleRefetch
let _refetchTimeout: ReturnType<typeof setTimeout> | null = null;

// Per-order broadcast debounce — absorbs rapid-fire broadcasts from row-level triggers
// (bulk_update_order_item_status fires one trigger per row, producing N partial-state
// broadcasts. We hold each for 80ms and only apply the last one.)
const _broadcastDebounceTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const BROADCAST_DEBOUNCE_MS = 80;

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

interface PersistedRetryEntry {
  key: string;
}

interface PersistedPendingAction {
  ticketId: string;
  targetStatus: KDSTicket["status"] | "done";
  itemStatuses: Array<[string, string]>;
  timestamp: number;
  prioritized?: boolean;
  rushOverride?: boolean;
}

const KDS_RETRY_STATE_STORAGE_KEY = "kds-retry-state";

function persistKdsRetryState(): void {
  const pendingActions: PersistedPendingAction[] = Array.from(
    _pendingActions.values(),
  ).map((pending) => ({
    ticketId: pending.ticketId,
    targetStatus: pending.targetStatus,
    itemStatuses: Array.from(pending.itemStatuses.entries()),
    timestamp: pending.timestamp,
    prioritized: pending.prioritized,
    rushOverride: pending.rushOverride,
  }));

  const activeRetries: PersistedRetryEntry[] = Array.from(
    _activeRetries.keys(),
  ).map((key) => ({ key }));

  setJSON(KDS_RETRY_STATE_STORAGE_KEY, {
    pendingActions,
    recalledTicketIds: Array.from(_recalledTicketIds.values()),
    activeRetries,
    savedAt: Date.now(),
  });
}

function restoreKdsRetryState(): void {
  const persisted = getJSON<{
    pendingActions?: PersistedPendingAction[];
    recalledTicketIds?: string[];
    activeRetries?: PersistedRetryEntry[];
  }>(KDS_RETRY_STATE_STORAGE_KEY);

  if (!persisted) return;

  _pendingActions.clear();
  for (const action of persisted.pendingActions ?? []) {
    _pendingActions.set(action.ticketId, {
      ticketId: action.ticketId,
      targetStatus: action.targetStatus,
      itemStatuses: new Map(action.itemStatuses ?? []),
      timestamp: action.timestamp,
      prioritized: action.prioritized,
      rushOverride: action.rushOverride,
    });
  }

  _recalledTicketIds.clear();
  for (const ticketId of persisted.recalledTicketIds ?? []) {
    _recalledTicketIds.add(ticketId);
  }

  // Retry handles are not executable across app restarts because callbacks are ephemeral.
  // Keep key presence for continuity, then drain them immediately.
  _activeRetries.clear();
  for (const retryEntry of persisted.activeRetries ?? []) {
    _activeRetries.set(retryEntry.key, {
      timeoutId: null,
      cancelled: true,
    });
  }
  _activeRetries.clear();

  persistKdsRetryState();
}

function setPendingAction(ticketId: string, action: PendingAction): void {
  _pendingActions.set(ticketId, action);
  persistKdsRetryState();
}

function deletePendingAction(ticketId: string): void {
  if (_pendingActions.delete(ticketId)) {
    persistKdsRetryState();
  }
}

function addRecalledTicketId(ticketId: string): void {
  _recalledTicketIds.add(ticketId);
  persistKdsRetryState();
}

function deleteRecalledTicketId(ticketId: string): void {
  if (_recalledTicketIds.delete(ticketId)) {
    persistKdsRetryState();
  }
}

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
  persistKdsRetryState();

  performFn()
    .then(() => {
      if (handle.cancelled) return;
      _activeRetries.delete(key);
      persistKdsRetryState();
      onSuccess?.();
    })
    .catch((err) => {
      if (handle.cancelled) return;
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount];
        console.warn(
          `[KDSStore] Retry ${
            retryCount + 1
          }/${MAX_RETRIES} for ${key} in ${delay}ms`,
        );
        handle.timeoutId = setTimeout(() => {
          if (handle.cancelled) return;
          scheduleRetry(
            key,
            performFn,
            retryCount + 1,
            onSuccess,
            onFinalFailure,
          );
        }, delay);
      } else {
        console.error(
          `[KDSStore] All ${MAX_RETRIES} retries exhausted for ${key}:`,
          err,
        );
        _activeRetries.delete(key);
        persistKdsRetryState();
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
    persistKdsRetryState();
  }
}

function cancelAllRetries() {
  for (const [, handle] of _activeRetries) {
    handle.cancelled = true;
    if (handle.timeoutId) clearTimeout(handle.timeoutId);
  }
  _activeRetries.clear();
  persistKdsRetryState();
}

// ─── Pending action tracking (optimistic update protection) ─────
interface PendingAction {
  ticketId: string;
  targetStatus: KDSTicket["status"] | "done";
  itemStatuses: Map<string, string>;
  timestamp: number;
  prioritized?: boolean;
  rushOverride?: boolean;
}
const _pendingActions = new Map<string, PendingAction>();
const PENDING_ACTION_TTL = 30_000;

/** Track ticket IDs that have been recalled — survives server refetches */
const _recalledTicketIds = new Set<string>();

/** Track new order IDs filtered out by routing rules — sound fires when server refetch adds them */
const _pendingNewOrderSounds = new Set<string>();

restoreKdsRetryState();

function pendingActionSatisfied(
  ticket: KDSTicket,
  pending: PendingAction,
): boolean {
  if (pending.targetStatus === "done") return false;
  if (ticket.status !== pending.targetStatus) return false;
  if (
    pending.prioritized != null &&
    Boolean(ticket.prioritized) !== pending.prioritized
  ) {
    return false;
  }

  for (const item of ticket.items) {
    const expectedStatus = pending.itemStatuses.get(item.id);
    if (expectedStatus && item.kitchen_status !== expectedStatus) {
      return false;
    }
    if (
      pending.rushOverride != null &&
      Boolean(item.rush) !== pending.rushOverride
    ) {
      return false;
    }
  }

  return true;
}

/** Overlay pending optimistic states onto server/broadcast tickets */
function overlayPendingActions(tickets: KDSTicket[]): KDSTicket[] {
  if (_pendingActions.size === 0 && _recalledTicketIds.size === 0)
    return tickets;
  const now = Date.now();

  // Prune stale pending actions globally first so item-level suppression does not
  // keep masking tickets after the optimistic protection window.
  for (const [ticketId, pending] of _pendingActions) {
    if (now - pending.timestamp > PENDING_ACTION_TTL) {
      deletePendingAction(ticketId);
    }
  }

  // Some bulk-done flows can regenerate ticket IDs from broadcast/refetch before
  // backend state fully settles. Keep those tickets hidden if all incoming items
  // are already covered by a pending "done" action.
  const pendingDoneItemIds = new Set<string>();
  for (const pending of _pendingActions.values()) {
    if (pending.targetStatus !== "done") continue;
    for (const [itemId, status] of pending.itemStatuses) {
      if (status === "served") pendingDoneItemIds.add(itemId);
    }
  }

  return tickets.reduce<KDSTicket[]>((acc, ticket) => {
    const pending = _pendingActions.get(ticket.ticket_id);
    if (!pending) {
      // Ticket has no direct pending entry, but all its items are in a pending
      // done-set from bulk completion. Keep it out until backend catches up.
      if (
        pendingDoneItemIds.size > 0 &&
        ticket.items.length > 0 &&
        ticket.items.every((item) => pendingDoneItemIds.has(item.id))
      ) {
        return acc;
      }

      // Only spread recalled flag if items don't already have it — preserve refs
      if (_recalledTicketIds.has(ticket.ticket_id)) {
        const needsRecalledOverlay = ticket.items.some(
          (item) => !item.recalled,
        );
        if (needsRecalledOverlay) {
          acc.push({
            ...ticket,
            items: ticket.items.map((item) =>
              item.recalled ? item : { ...item, recalled: true },
            ),
          });
        } else {
          acc.push(ticket); // Items already have recalled — reuse ref
        }
      } else {
        acc.push(ticket);
      }
      return acc;
    }
    if (pendingActionSatisfied(ticket, pending)) {
      deletePendingAction(ticket.ticket_id);
      // Pending action is satisfied — ticket already matches, reuse ref
      if (_recalledTicketIds.has(ticket.ticket_id)) {
        const needsRecalledOverlay = ticket.items.some(
          (item) => !item.recalled,
        );
        if (needsRecalledOverlay) {
          acc.push({
            ...ticket,
            items: ticket.items.map((item) =>
              item.recalled ? item : { ...item, recalled: true },
            ),
          });
        } else {
          acc.push(ticket);
        }
      } else {
        acc.push(ticket);
      }
      return acc;
    }
    // Ticket was optimistically served/removed — keep it out
    if (pending.targetStatus === "done") return acc;
    // Overlay optimistic statuses — only spread fields that actually differ
    const isRecalled = _recalledTicketIds.has(ticket.ticket_id);
    const statusMatches = ticket.status === pending.targetStatus;
    const priorityMatches =
      pending.prioritized == null ||
      Boolean(ticket.prioritized) === pending.prioritized;
    let itemsChanged = false;
    const overlaidItems = ticket.items.map((item) => {
      const optimistic = pending.itemStatuses.get(item.id);
      const statusDiff = optimistic && item.kitchen_status !== optimistic;
      const rushDiff =
        pending.rushOverride != null &&
        Boolean(item.rush) !== pending.rushOverride;
      const recalledDiff = isRecalled && !item.recalled;
      if (!statusDiff && !rushDiff && !recalledDiff) return item; // reuse ref
      itemsChanged = true;
      return {
        ...item,
        ...(statusDiff ? { kitchen_status: optimistic } : {}),
        ...(rushDiff ? { rush: pending.rushOverride } : {}),
        ...(recalledDiff ? { recalled: true } : {}),
      };
    });
    if (statusMatches && priorityMatches && !itemsChanged) {
      acc.push(ticket); // Nothing actually changed — reuse original ref
    } else {
      acc.push({
        ...ticket,
        ...(statusMatches
          ? {}
          : { status: pending.targetStatus as KDSTicket["status"] }),
        ...(priorityMatches || pending.prioritized == null
          ? {}
          : { prioritized: pending.prioritized }),
        ...(itemsChanged ? { items: overlaidItems } : {}),
      });
    }
    return acc;
  }, []);
}

/** Parse a timestamp string to epoch ms, treating timezone-naive strings as UTC.
 *  Supabase stores timestamps in UTC; JSONB serialization of TIMESTAMP columns
 *  may strip timezone info, causing local-time parse on the client. */
function safeParseUtcTimestamp(s: string | null | undefined): number {
  if (!s) return 0;
  // If no timezone indicator, append 'Z' to force UTC parse
  const hasTimezone =
    s.includes("+") || s.includes("Z") || /\d{2}:\d{2}$/.test(s.slice(-6));
  const normalized = hasTimezone ? s : s + "Z";
  const ms = new Date(normalized).getTime();
  return isNaN(ms) ? 0 : ms;
}

/** Ensure ticket.prioritized matches prioritizedTicketIds (the source of truth).
 *  Reuses object refs for unchanged tickets to preserve reference stability. */
function reconcilePriorityFlags(
  tickets: KDSTicket[],
  prioritizedIds: Set<string>,
): KDSTicket[] {
  if (prioritizedIds.size === 0) return tickets;
  let changed = false;
  const result = tickets.map((t) => {
    const shouldBe = prioritizedIds.has(t.ticket_id);
    if (t.prioritized === shouldBe) return t;
    changed = true;
    return { ...t, prioritized: shouldBe };
  });
  return changed ? result : tickets;
}

function compareKdsTickets(a: KDSTicket, b: KDSTicket): number {
  const timeDiff = a.start_time_epoch - b.start_time_epoch;
  if (timeDiff !== 0) return timeDiff;

  const courseDiff = a.course_number - b.course_number;
  if (courseDiff !== 0) return courseDiff;

  return a.ticket_id.localeCompare(b.ticket_id);
}

function sortKdsTicketsStable(tickets: KDSTicket[]): KDSTicket[] {
  return [...tickets].sort(compareKdsTickets);
}

function normalizeKdsTicket(ticket: KDSTicket): KDSTicket {
  const items = Array.isArray(ticket.items)
    ? ticket.items.map((item) => ({
        ...item,
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
      }))
    : [];

  return {
    ...ticket,
    items,
    table_name: resolveKdsTableName(ticket.table_name),
    delivery_platform:
      normalizePlatform(ticket.delivery_platform) ??
      ticket.delivery_platform ??
      null,
    item_count:
      typeof ticket.item_count === "number"
        ? ticket.item_count
        : items.reduce((sum, item) => sum + (item.quantity || 0), 0),
  };
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

function isActionableKitchenItem(
  item: Pick<
    KDSTicketItem,
    "is_voided" | "refunded_quantity" | "quantity" | "kitchen_status"
  >,
): boolean {
  const status = (item.kitchen_status ?? "").toLowerCase();
  const isTerminalKitchenStatus =
    status === "served" ||
    status === "voided" ||
    status === "done" ||
    status === "completed";

  return (
    !item.is_voided &&
    (item.refunded_quantity ?? 0) < item.quantity &&
    !isTerminalKitchenStatus
  );
}

function isRecallableKitchenItem(
  item: Pick<KDSTicketItem, "is_voided" | "refunded_quantity" | "quantity">,
): boolean {
  return !item.is_voided && (item.refunded_quantity ?? 0) < item.quantity;
}

function ticketHasActionableItems(ticket: KDSTicket): boolean {
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  return items.some((item) => isActionableKitchenItem(item));
}

function dedupeTicketsById(tickets: KDSTicket[]): KDSTicket[] {
  if (tickets.length <= 1) return tickets;
  const byId = new Map<string, KDSTicket>();
  for (const ticket of tickets) {
    byId.set(ticket.ticket_id, ticket);
  }
  return Array.from(byId.values());
}

/** Shared predicate: should we apply display-based item filtering? */
function shouldUseDisplayFilter(
  kdsDisplayId: string | null,
  routingMode: string | null,
  cachedRules: KDSRoutingRule[] | null,
): boolean {
  return !!(
    kdsDisplayId &&
    routingMode !== "all" &&
    cachedRules &&
    cachedRules.length > 0
  );
}

/** Check if an item matches routing rules for client-side filtering */
function itemMatchesRules(
  item: BroadcastOrderItemData,
  rules: KDSRoutingRule[],
  orderType: string | null,
): boolean {
  for (const rule of rules) {
    if (
      rule.rule_type === "prep_station" &&
      item.prep_station === rule.rule_value
    ) {
      return true;
    }
    if (
      rule.rule_type === "category" &&
      (item.category_name === rule.rule_value ||
        (item.category_id && item.category_id === rule.rule_value))
    ) {
      return true;
    }
    if (rule.rule_type === "order_type" && orderType === rule.rule_value) {
      return true;
    }
  }
  return false;
}

/** Build O(1) order-id → ticket-id index from ticketsById map */
function buildOrderIdIndex(
  ticketsById: Record<string, KDSTicket>,
): Record<string, Set<string>> {
  const index: Record<string, Set<string>> = {};
  for (const ticket of Object.values(ticketsById)) {
    const oid = ticket.db_order_id;
    if (!index[oid]) index[oid] = new Set();
    index[oid].add(ticket.ticket_id);
  }
  return index;
}

/** Build KDS tickets from a broadcast order's items */
function buildTicketsFromBroadcast(order: BroadcastOrderData): KDSTicket[] {
  const items = order.order_items;
  if (!items || items.length === 0) return [];

  // Filter to KDS-relevant items (include voided/refunded if they reached kitchen)
  const kdsItems = items.filter((item) => {
    if (item.kitchen_status == null) return false;
    if (item.is_voided) return true;
    if ((item.refunded_quantity ?? 0) > 0) return true;
    return KDS_STATUSES.has(item.kitchen_status);
  });
  if (kdsItems.length === 0) return [];

  if (__DEV__) {
    console.log("[KDS Debug] buildTicketsFromBroadcast start", {
      orderId: order.id,
      orderStatus: order.status,
      totalItems: items.length,
      kdsItems: kdsItems.length,
    });
  }

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
    const fireTimeMs = safeParseUtcTimestamp(fireTime);
    const fireTimeEpoch = fireTimeMs ? Math.floor(fireTimeMs / 1000) : 0;

    // Derive ticket status from active items only (voided/fully-refunded are display-only)
    // In 2-step mode, remap "pending" to "cooking" (items skip Pending bucket)
    const activeItems = roundItems.filter((i) => isActionableKitchenItem(i));

    if (__DEV__) {
      console.log("[KDS Debug] round status inputs", {
        orderId: order.id,
        roundKey: key,
        roundItemCount: roundItems.length,
        actionableCount: activeItems.length,
        statuses: roundItems.map((i) => ({
          id: i.id,
          kitchenStatus: i.kitchen_status,
          qty: i.quantity,
          refundedQty: i.refunded_quantity ?? 0,
          isVoided: i.is_voided,
        })),
      });
    }

    // If a round has no actionable kitchen items left (only voided/refunded rows),
    // do not keep rebuilding it into active KDS columns.
    if (activeItems.length === 0) {
      if (__DEV__) {
        console.log("[KDS Debug] skipping round with no actionable items", {
          orderId: order.id,
          roundKey: key,
        });
      }
      continue;
    }
    const allReady =
      activeItems.length === 0 ||
      activeItems.every((i) => i.kitchen_status === "ready");
    const anySent = activeItems.some((i) => i.kitchen_status === "sent");
    const ticketStatus: KDSTicket["status"] = allReady
      ? "ready"
      : anySent
        ? getKitchenSentStatus() === "preparing"
          ? "cooking"
          : "pending"
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
        ...(m.is_no ? { is_no: true } : {}),
      })),
      prep_station: item.prep_station,
      rush: item.rush,
      is_prioritized: item.is_prioritized,
      seat_number: item.seat_number ?? null,
      is_voided: item.is_voided,
      is_refunded: (item.refunded_quantity ?? 0) > 0,
      refunded_quantity: item.refunded_quantity ?? 0,
    }));
    // Stable sort by id so items never reorder on status change
    ticketItems.sort((a, b) => a.id.localeCompare(b.id));

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
      table_name: resolveKdsTableName(order.table_number),
      customer_name: order.customer_name ?? null,
      order_notes: order.special_instructions ?? null,
      start_time: fireTime ?? order.sent_to_kitchen_at,
      start_time_epoch:
        fireTimeMs || safeParseUtcTimestamp(order.sent_to_kitchen_at),
      item_count: ticketItems.reduce((sum, i) => {
        if (i.is_voided) return sum;
        return sum + Math.max(0, i.quantity - (i.refunded_quantity ?? 0));
      }, 0),
      items: ticketItems,
      prioritized: roundItems.some((i) => i.is_prioritized),
      session_id: order.session_id ?? null,
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
  if (a.item_count !== b.item_count || a.order_number !== b.order_number)
    return false;
  if (a.display_number !== b.display_number || a.table_name !== b.table_name)
    return false;
  if (a.order_notes !== b.order_notes) return false;
  if (a.customer_name !== b.customer_name || a.start_time !== b.start_time)
    return false;
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i++) {
    const ai = a.items[i],
      bi = b.items[i];
    if (ai.id !== bi.id || ai.kitchen_status !== bi.kitchen_status)
      return false;
    if (ai.quantity !== bi.quantity || ai.rush !== bi.rush) return false;
    if (ai.is_prioritized !== bi.is_prioritized) return false;
    if (ai.special_instructions !== bi.special_instructions) return false;
    if (ai.is_voided !== bi.is_voided) return false;
    if (ai.is_refunded !== bi.is_refunded) return false;
    if (ai.refunded_quantity !== bi.refunded_quantity) return false;
    if (Boolean(ai.recalled) !== Boolean(bi.recalled)) return false;
  }
  return true;
}

/** Preserve locally-completed items when the backend omits them from a refetch.
 *  This keeps individually-tapped items visible and struck through instead of
 *  collapsing the ticket back to only the remaining active items. */
function preserveCompletedItems(
  previous: KDSTicket,
  incoming: KDSTicket,
): KDSTicket {
  const prevItems = Array.isArray(previous.items) ? previous.items : [];
  const nextItems = Array.isArray(incoming.items) ? incoming.items : [];
  const incomingIds = new Set(nextItems.map((item) => item.id));
  const preservedItems = prevItems.filter(
    (item) => item.kitchen_status === "ready" && !incomingIds.has(item.id),
  );

  if (preservedItems.length === 0) return incoming;

  const mergedItems = [...nextItems, ...preservedItems].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return {
    ...incoming,
    items: mergedItems,
    item_count: Math.max(previous.item_count, incoming.item_count),
  };
}

/** Stable identity across ticket_id churn (e.g. fire_time changes after recall). */
function getTicketLogicalSignature(ticket: KDSTicket): string {
  const itemIds = (ticket.items ?? [])
    .map((i) => i.id)
    .sort()
    .join(",");
  return `${ticket.db_order_id}|${ticket.course_number}|${itemIds}`;
}

function stabilizeTicketsByLogicalSignature(
  incoming: KDSTicket[],
  existingById: Record<string, KDSTicket>,
): KDSTicket[] {
  const existingTickets = Object.values(existingById);
  if (existingTickets.length === 0 || incoming.length === 0) return incoming;

  const existingByTicketId = new Map<string, KDSTicket>();
  const existingBySignature = new Map<string, KDSTicket[]>();

  for (const ticket of existingTickets) {
    existingByTicketId.set(ticket.ticket_id, ticket);
    const sig = getTicketLogicalSignature(ticket);
    const bucket = existingBySignature.get(sig);
    if (bucket) bucket.push(ticket);
    else existingBySignature.set(sig, [ticket]);
  }

  return incoming.map((nextTicket) => {
    let existing = existingByTicketId.get(nextTicket.ticket_id);

    if (!existing) {
      const sig = getTicketLogicalSignature(nextTicket);
      const bucket = existingBySignature.get(sig);
      if (bucket && bucket.length > 0) {
        existing = bucket.shift();
      }
    }

    if (!existing) return nextTicket;

    const recalledIds = new Set(
      (existing.items ?? []).filter((i) => i.recalled).map((i) => i.id),
    );

    return {
      ...nextTicket,
      ticket_id: existing.ticket_id,
      start_time: existing.start_time,
      start_time_epoch: existing.start_time_epoch,
      items: (nextTicket.items ?? []).map((item) =>
        recalledIds.has(item.id) && !item.recalled
          ? { ...item, recalled: true }
          : item,
      ),
    };
  });
}

/** Merge incoming tickets with existing, reusing unchanged object references */
function mergeTickets(
  incoming: KDSTicket[],
  existingById: Record<string, KDSTicket>,
): {
  merged: KDSTicket[];
  mergedById: Record<string, KDSTicket>;
  changed: boolean;
} {
  let changed = false;
  const dedupedIncoming = dedupeTicketsById(incoming);
  const mergedById: Record<string, KDSTicket> = {};
  const merged: KDSTicket[] = [];
  for (const ticket of dedupedIncoming) {
    const prevRaw = existingById[ticket.ticket_id];
    const prev = prevRaw ? normalizeKdsTicket(prevRaw) : undefined;
    // Preserve customer_name/table_name from existing ticket when broadcast omits them
    const normalizedIncoming = normalizeKdsTicket(ticket);
    const enriched =
      prev &&
      (ticket.customer_name === null ||
        ticket.table_name === null ||
        ticket.order_notes == null)
        ? {
            ...normalizedIncoming,
            customer_name:
              normalizedIncoming.customer_name ?? prev.customer_name,
            table_name: normalizedIncoming.table_name ?? prev.table_name,
            order_notes: normalizedIncoming.order_notes ?? prev.order_notes,
          }
        : normalizedIncoming;
    const stabilized = prev ? preserveCompletedItems(prev, enriched) : enriched;
    if (prev && ticketDeepEqual(prev, stabilized)) {
      mergedById[normalizedIncoming.ticket_id] = prev;
      merged.push(prev);
    } else {
      mergedById[normalizedIncoming.ticket_id] = stabilized;
      merged.push(stabilized);
      changed = true;
    }
  }
  if (Object.keys(existingById).length !== merged.length) changed = true;
  return { merged, mergedById, changed };
}

/** Positionally-stable bucket sort: existing tickets keep their position from
 *  prevBucket. New tickets are inserted at the front (newestFirst) or back.
 *  Prioritized tickets float to the front of the result. */
function prioritySortBucket(
  bucket: KDSTicket[],
  prioritizedIds: Set<string>,
  prevBucket: KDSTicket[],
  newestFirst?: boolean,
): KDSTicket[] {
  if (bucket.length === 0) return bucket;

  // Build lookup of current tickets by ID
  const currentMap = new Map(bucket.map((t) => [t.ticket_id, t]));

  // Preserve order from prevBucket for tickets that still exist
  const ordered: KDSTicket[] = [];
  const placed = new Set<string>();
  for (const prev of prevBucket) {
    const current = currentMap.get(prev.ticket_id);
    if (current) {
      ordered.push(current);
      placed.add(prev.ticket_id);
    }
  }

  // Collect new tickets (not in prevBucket)
  const newTickets = bucket.filter((t) => !placed.has(t.ticket_id));
  if (newestFirst) {
    // New tickets go to the front
    ordered.unshift(...newTickets);
  } else {
    ordered.push(...newTickets);
  }

  // Float prioritized tickets to front (preserving their relative order)
  if (prioritizedIds.size > 0) {
    const prioritized = ordered.filter((t) => prioritizedIds.has(t.ticket_id));
    const normal = ordered.filter((t) => !prioritizedIds.has(t.ticket_id));
    return [...prioritized, ...normal];
  }

  return ordered;
}

/** Bucket tickets into status groups, reusing unchanged array references */
function smartBucketTickets(
  tickets: KDSTicket[],
  prev: KDSState["ticketsByStatus"],
  prioritizedIds?: Set<string>,
  newOrderPosition?: "left" | "right",
) {
  const sourceTickets = dedupeTicketsById(tickets);
  if (__DEV__ && sourceTickets.length !== tickets.length) {
    console.log("[KDS Debug] deduped duplicate ticket ids before bucketing", {
      before: tickets.length,
      after: sourceTickets.length,
      duplicateCount: tickets.length - sourceTickets.length,
    });
  }

  const pending: KDSTicket[] = [];
  const cooking: KDSTicket[] = [];
  const ready: KDSTicket[] = [];

  for (const t of sourceTickets) {
    if (t.status === "pending") pending.push(t);
    else if (t.status === "cooking") cooking.push(t);
    else if (t.status === "ready") ready.push(t);
  }

  // Apply priority sorting (and newest-first if configured)
  const pIds = prioritizedIds ?? new Set<string>();
  const newestFirst = newOrderPosition === "left";
  const sortedPending = prioritySortBucket(
    pending,
    pIds,
    prev.pending,
    newestFirst,
  );
  const sortedCooking = prioritySortBucket(
    cooking,
    pIds,
    prev.cooking,
    newestFirst,
  );
  const sortedReady = prioritySortBucket(ready, pIds, prev.ready, newestFirst);

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
      nowEpochMs: Date.now(),
      focusedTicketId: null,
      setFocusedTicketId: (id) => set({ focusedTicketId: id }),
      bulkMode: false,
      selectedTicketIds: new Set<string>(),
      prioritizedTicketIds: new Set<string>(),
      newOrderPosition: "right" as const,

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
      setOnNewOrderCallback: (cb) => set({ _onNewOrderCallback: cb }),

      setNewOrderPosition: (pos) => {
        if (pos === get().newOrderPosition) return;
        set({ newOrderPosition: pos });
        // Re-bucket with new ordering
        const bucketed = smartBucketTickets(
          get().tickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          pos,
        );
        set(bucketed);
      },

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
            set({
              kdsDisplayId: null,
              routingMode: null,
              cachedRules: null,
              kdsDisplayConfig: null,
              prepStations: {},
              enrichedRules: [],
            });
            return;
          }

          if (!display) {
            // No display configured for this station - backward compat (show all)
            set({
              kdsDisplayId: null,
              routingMode: null,
              cachedRules: null,
              kdsDisplayConfig: null,
              prepStations: {},
              enrichedRules: [],
            });
            return;
          }

          // Fetch routing rules for this display
          const { data: rules, error: rulesError } = await client
            .from("kds_routing_rules")
            .select("rule_type, rule_value")
            .eq("kds_display_id", display.id);

          if (rulesError) {
            console.error(
              "[KDSStore] fetchKDSDisplay rules error:",
              rulesError,
            );
          }

          // Fetch prep stations for this location
          const { data: prepStationsData, error: psError } = await client
            .from("prep_stations")
            .select("id, name, color")
            .eq("location_id", display.location_id)
            .eq("is_active", true);

          if (psError) {
            console.error(
              "[KDSStore] fetchKDSDisplay prep_stations error:",
              psError,
            );
          }

          // Build prep station map: name -> { name, color }
          const prepStationsMap: Record<
            string,
            { name: string; color: string }
          > = {};
          if (prepStationsData) {
            for (const ps of prepStationsData) {
              prepStationsMap[ps.name] = {
                name: ps.name,
                color: ps.color || "#6b7280",
              };
            }
          }

          // Build enriched rules with human-readable labels
          const typedRules = (rules as KDSRoutingRule[]) || [];
          const enriched: KDSEnrichedRoutingRule[] = typedRules.map((rule) => {
            let label = rule.rule_value;
            if (
              rule.rule_type === "prep_station" &&
              prepStationsMap[rule.rule_value]
            ) {
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
          set({
            kdsDisplayId: null,
            routingMode: null,
            cachedRules: null,
            kdsDisplayConfig: null,
            prepStations: {},
            enrichedRules: [],
          });
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

          const { data, error } = await client.rpc(
            "get_kds_tickets_v2",
            params,
          );

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

          const raw: KDSTicket[] = Array.isArray(data) ? data : (data ?? []);
          const processed = overlayPendingActions(
            raw.map((t) =>
              normalizeKdsTicket({
                ...t,
                start_time_epoch: safeParseUtcTimestamp(t.start_time),
              }),
            ),
          );
          // In 2-step mode, remap any "pending" tickets to "cooking" (Pending bucket is hidden)
          const remapped =
            getKitchenSentStatus() === "preparing"
              ? processed.map((t) =>
                  t.status === "pending"
                    ? { ...t, status: "cooking" as KDSTicket["status"] }
                    : t,
                )
              : processed;
          const actionableRemapped = remapped.filter(ticketHasActionableItems);
          const dedupedRemapped = dedupeTicketsById(actionableRemapped);
          const sorted = sortKdsTicketsStable(dedupedRemapped);
          const stabilizedSorted = stabilizeTicketsByLogicalSignature(
            sorted,
            get()._ticketsById,
          );
          const { merged, mergedById, changed } = mergeTickets(
            stabilizedSorted,
            get()._ticketsById,
          );

          if (!changed && get()._hasHydrated) {
            set({ isInitialLoading: false, isFetching: false });
            return;
          }

          // Hydrate prioritizedTicketIds from server data + preserve local priorities for existing tickets
          const nextPrioritized = new Set<string>();
          for (const t of merged) {
            if (t.prioritized) nextPrioritized.add(t.ticket_id);
          }
          for (const id of get().prioritizedTicketIds) {
            if (mergedById[id]) nextPrioritized.add(id);
          }

          const reconciled = reconcilePriorityFlags(merged, nextPrioritized);
          const bucketed = smartBucketTickets(
            reconciled,
            get().ticketsByStatus,
            nextPrioritized,
            get().newOrderPosition,
          );

          set({
            tickets: reconciled,
            _ticketsById: mergedById,
            _ticketIdsByOrderId: buildOrderIdIndex(mergedById),
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

          const { data, error } = await client.rpc(
            "get_kds_tickets_v2",
            params,
          );

          // Discard stale response
          if (mySeq !== _fetchSeq) return;

          if (error) {
            console.error("[KDSStore] _backgroundFetchTickets error:", error);
            set({ isFetching: false });
            return;
          }

          const raw: KDSTicket[] = Array.isArray(data) ? data : (data ?? []);
          if (__DEV__) {
            console.log("[KDS Debug] background fetch raw tickets", {
              locationId,
              rawCount: raw.length,
              sample: raw.slice(0, 5).map((t) => ({
                ticketId: t.ticket_id,
                status: t.status,
                orderId: t.db_order_id,
                itemCount: t.items?.length ?? 0,
              })),
            });
          }
          const processed = overlayPendingActions(
            raw.map((t) =>
              normalizeKdsTicket({
                ...t,
                start_time_epoch: safeParseUtcTimestamp(t.start_time),
              }),
            ),
          );
          // In 2-step mode, remap any "pending" tickets to "cooking"
          const remapped =
            getKitchenSentStatus() === "preparing"
              ? processed.map((t) =>
                  t.status === "pending"
                    ? { ...t, status: "cooking" as KDSTicket["status"] }
                    : t,
                )
              : processed;
          const actionableRemapped = remapped.filter(ticketHasActionableItems);
          const dedupedRemapped = dedupeTicketsById(actionableRemapped);
          const sorted = sortKdsTicketsStable(dedupedRemapped);
          const stabilizedSorted = stabilizeTicketsByLogicalSignature(
            sorted,
            get()._ticketsById,
          );
          if (__DEV__) {
            console.log("[KDS Debug] background fetch processed tickets", {
              locationId,
              processedCount: processed.length,
              remappedCount: remapped.length,
              actionableCount: actionableRemapped.length,
              dedupedCount: dedupedRemapped.length,
              sortedCount: sorted.length,
              stabilizedCount: stabilizedSorted.length,
            });

            const recalledTicketSnapshots = remapped
              .filter(
                (t) =>
                  _recalledTicketIds.has(t.ticket_id) ||
                  (Array.isArray(t.items) && t.items.some((i) => i.recalled)),
              )
              .map((t) => ({
                ticketId: t.ticket_id,
                ticketStatus: t.status,
                itemStatuses: t.items.map((i) => ({
                  id: i.id,
                  status: i.kitchen_status,
                  recalled: Boolean(i.recalled),
                  voided: Boolean(i.is_voided),
                  refundedQty: i.refunded_quantity ?? 0,
                })),
              }));

            if (recalledTicketSnapshots.length > 0) {
              console.log("[KDS Debug] background fetch recalled snapshots", {
                locationId,
                snapshots: recalledTicketSnapshots,
              });
            }
          }

          // Preserve recalled/pending tickets not returned by server.
          // For display-filtered stations, marking an item 'ready' sets
          // kds_item_status = 'completed', which excludes the item from
          // get_kds_tickets_v2 results. Check both the module-level Set
          // AND the item-level recalled flag (persisted in MMKV) so the
          // ticket survives even after a hot-reload that clears the Set.
          const currentTickets = get().tickets;
          const serverTicketIds = new Set(
            stabilizedSorted.map((t) => t.ticket_id),
          );
          const serverTicketSignatures = new Set(
            stabilizedSorted.map(getTicketLogicalSignature),
          );
          const protectedMissing = currentTickets.filter(
            (t) =>
              !serverTicketIds.has(t.ticket_id) &&
              !serverTicketSignatures.has(getTicketLogicalSignature(t)) &&
              (_pendingActions.has(t.ticket_id) ||
                _recalledTicketIds.has(t.ticket_id) ||
                (Array.isArray(t.items) && t.items.some((i) => i.recalled))),
          );
          if (__DEV__ && protectedMissing.length > 0) {
            console.log("[KDS Debug] background preserving protected missing", {
              locationId,
              count: protectedMissing.length,
              tickets: protectedMissing.map((t) => ({
                ticketId: t.ticket_id,
                orderId: t.db_order_id,
                signature: getTicketLogicalSignature(t),
              })),
            });
          }
          const withProtected =
            protectedMissing.length > 0
              ? [...stabilizedSorted, ...protectedMissing]
              : stabilizedSorted;
          const sortedWithProtected = sortKdsTicketsStable(withProtected);

          const { merged, mergedById, changed } = mergeTickets(
            sortedWithProtected,
            get()._ticketsById,
          );

          if (!changed && get()._hasHydrated) {
            set({ isFetching: false });
            return;
          }

          // Hydrate prioritizedTicketIds from server data + preserve local priorities for existing tickets
          const nextPrioritized = new Set<string>();
          for (const t of merged) {
            if (t.prioritized) nextPrioritized.add(t.ticket_id);
          }
          for (const id of get().prioritizedTicketIds) {
            if (mergedById[id]) nextPrioritized.add(id);
          }

          const reconciled = reconcilePriorityFlags(merged, nextPrioritized);
          const bucketed = smartBucketTickets(
            reconciled,
            get().ticketsByStatus,
            nextPrioritized,
            get().newOrderPosition,
          );

          set({
            tickets: reconciled,
            _ticketsById: mergedById,
            _ticketIdsByOrderId: buildOrderIdIndex(mergedById),
            prioritizedTicketIds: nextPrioritized,
            ...bucketed,
            _hasHydrated: true,
            isFetching: false,
          });

          // Fire sound for orders that were filtered out by broadcast but arrived via server refetch
          if (_pendingNewOrderSounds.size > 0) {
            const prevOrderIds = new Set(
              currentTickets.map((t) => t.db_order_id),
            );
            for (const t of merged) {
              if (
                _pendingNewOrderSounds.has(t.db_order_id) &&
                !prevOrderIds.has(t.db_order_id)
              ) {
                const cb = get()._onNewOrderCallback;
                if (cb) cb(t.order_source ?? null);
                _pendingNewOrderSounds.delete(t.db_order_id);
                break; // one sound per cycle; cooldown handles rapid arrivals
              }
            }
          }
        } catch (err) {
          if (mySeq !== _fetchSeq) return;
          console.error("[KDSStore] _backgroundFetchTickets exception:", err);
          set({ isFetching: false });
        } finally {
          _fetchInFlight = false;
        }
      },

      advanceTicketStatus: (ticketId, itemIds, newStatus) => {
        const { tickets, _ticketsById } = get();

        // O(1) lookup via map
        const ticket = _ticketsById[ticketId];
        const orderId = ticket?.db_order_id;

        // Map newStatus to KDS ticket status for optimistic update
        const ticketStatus =
          newStatus === "preparing"
            ? "cooking"
            : newStatus === "ready"
              ? "ready"
              : null; // "served" removes from KDS

        // Skip non-actionable rows (voided/fully-refunded portions) for backend updates.
        // These rows are display-only and can cause RPC failures if sent as status mutations.
        const actionableItemIds = itemIds.filter((id) => {
          const item = ticket?.items.find((i) => i.id === id);
          if (!item) return false;
          return isActionableKitchenItem(item);
        });

        if (__DEV__) {
          console.log("[KDS Debug] advanceTicketStatus request", {
            ticketId,
            currentStatus: ticket?.status,
            newStatus,
            requestedItemIds: itemIds.length,
            actionableItemIds: actionableItemIds.length,
            orderId,
          });
        }

        // Cancel any in-flight per-item retries for this ticket so they don't
        // overwrite the whole-ticket status we're about to write (e.g. markItemDone
        // retries running after advanceTicketStatus would set items back to 'ready').
        for (const id of actionableItemIds) {
          cancelRetry(`item_${ticketId}_${id}`);
        }

        // Register pending action (protects optimistic state from broadcast clobber)
        const itemStatusMap = new Map<string, string>();
        for (const id of actionableItemIds) itemStatusMap.set(id, newStatus);
        if (actionableItemIds.length > 0 || ticketStatus !== null) {
          setPendingAction(ticketId, {
            ticketId,
            targetStatus:
              ticketStatus === null
                ? "done"
                : (ticketStatus as KDSTicket["status"]),
            itemStatuses: itemStatusMap,
            timestamp: Date.now(),
          });
        } else {
          deletePendingAction(ticketId);
        }

        let updatedTickets: KDSTicket[];
        let updatedById: Record<string, KDSTicket>;
        let extraState: Partial<KDSState> = {};

        if (ticketStatus === null) {
          // Served → remove from active, add to done in one set() call
          deleteRecalledTicketId(ticketId);
          updatedTickets = tickets.filter((t) => t.ticket_id !== ticketId);
          // Avoid shallow-copying entire map — use Object.create trick with deletion
          updatedById = Object.assign({}, _ticketsById);
          delete updatedById[ticketId];

          if (ticket) {
            const updatedDone = [
              {
                ...ticket,
                status: "done" as KDSTicket["status"],
                done_time_epoch: Date.now(),
              },
              ...get().doneTickets,
            ].slice(0, 50);
            extraState = {
              doneTickets: updatedDone,
              doneCount: updatedDone.length,
            };
          }
        } else {
          const itemIdSet = new Set(itemIds);
          const resetEpoch =
            ticketStatus === "ready" && _recalledTicketIds.has(ticketId);
          const updatedTicket: KDSTicket = {
            ...ticket!,
            status: ticketStatus as KDSTicket["status"],
            items: ticket?.items.map((item) =>
              itemIdSet?.has(item.id)
                ? { ...item, kitchen_status: newStatus }
                : item,
            ),
            ...(resetEpoch ? { start_time_epoch: Date.now() } : {}),
          };
          // Replace single entry without iterating the full tickets array
          const idx = tickets.findIndex((t) => t.ticket_id === ticketId);
          if (idx === -1) {
            updatedTickets = tickets;
          } else {
            updatedTickets = tickets.slice();
            updatedTickets[idx] = updatedTicket;
          }
          updatedById = { ..._ticketsById, [ticketId]: updatedTicket };
        }

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        // Single set() call — one render cycle
        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          _ticketIdsByOrderId: buildOrderIdIndex(updatedById),
          ...bucketed,
          ...extraState,
        });

        if (__DEV__) {
          console.log("[KDS Debug] advanceTicketStatus optimistic applied", {
            ticketId,
            newStatus,
            ticketRemoved: ticketStatus === null,
            activeTicketCount: updatedTickets.length,
            doneCount:
              (extraState.doneCount as number | undefined) ?? get().doneCount,
          });
        }

        // Backend sync with cancellable retry (action-specific key to avoid cross-action cancellation)
        const retryKey = `advance_${ticketId}_${newStatus}`;
        const client = getClient();
        if (client && actionableItemIds.length > 0) {
          scheduleRetry(
            retryKey,
            () =>
              OrderService.bulkUpdateOrderItemStatus(
                client,
                actionableItemIds,
                newStatus,
                {
                  keyOverride: toBulkUpdateStatusKey(
                    actionableItemIds,
                    newStatus,
                  ),
                },
              ),
            0,
            () => {
              // Only refetch if pending action hasn't already been reconciled by broadcast echo
              if (_pendingActions.has(ticketId)) {
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              }

              // Persist final order status after all items are served from KDS.
              if (newStatus === "served" && orderId) {
                const hasRemainingTicketsForOrder = updatedTickets.some(
                  (t) => t.db_order_id === orderId,
                );

                if (!hasRemainingTicketsForOrder) {
                  OrderService.updateOrderStatus(client, orderId, "ready").then(
                    ({ error }) => {
                      if (
                        error &&
                        error.code !== "P0001" &&
                        !error.message?.includes("already in")
                      ) {
                        console.error(
                          "[KDSStore] Failed to update order status to ready:",
                          error,
                        );
                      }
                    },
                  );

                  // Auto-complete if paid and completion mode allows (Path B: kitchen finishes after payment)
                  const completionMode =
                    useStoreSettingsStore.getState().orderCompletionMode;
                  if (completionMode === "auto") {
                    const { ordersById, dbOrderIdIndex } =
                      useOrderStore.getState();
                    const localId = dbOrderIdIndex[orderId];
                    const localOrder = localId ? ordersById[localId] : null;
                    if (localOrder?.paid_status === "Paid") {
                      queueMicrotask(() => {
                        useOrderStore.getState().archiveOrder(localOrder.id);
                      });
                    }
                  }
                }
              }
            },
            () => {
              deletePendingAction(ticketId);
              const lastLoc = get()._lastLocationId;
              if (lastLoc) get().scheduleRefetch(lastLoc);
            },
          );

          // When all items are marked as served in KDS, also update the table session to "served"
          if (newStatus === "served") {
            // Prefer session_id on the ticket (set from broadcast).
            // Fallback: scan sessions by db_order_id for tickets loaded via RPC
            // which don't carry session_id (get_kds_tickets_v2 doesn't return it).
            let sessionId = ticket?.session_id;
            if (!sessionId && orderId) {
              const sessions = useTableSessionStore.getState().sessions;
              const match = Object.values(sessions).find(
                (s) => s?.order_id === orderId,
              );
              sessionId = match?.id ?? null;
            }
            if (sessionId) {
              useTableSessionStore
                .getState()
                .updateSessionStatus(sessionId, "served")
                .catch((err) => {
                  console.error(
                    "[KDSStore] Failed to update table session to served:",
                    err,
                  );
                });
            }
          }
        }
      },

      handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
        const order = payload.data?.order;
        if (!order) return;

        // Debounce per-order: bulk_update_order_item_status fires one DB trigger per
        // row, producing N rapid broadcasts with partial item state. Hold 80ms and
        // only process the last one to prevent flickering item counts.
        const existing = _broadcastDebounceTimers.get(order.id);
        if (existing) clearTimeout(existing);
        _broadcastDebounceTimers.set(
          order.id,
          setTimeout(() => {
            _broadcastDebounceTimers.delete(order.id);
            get()._processOrderBroadcast(payload);
          }, BROADCAST_DEBOUNCE_MS),
        );
      },

      _processOrderBroadcast: (payload: OrderBroadcastPayload) => {
        const order = payload.data?.order;
        if (!order) return;

        console.log("[KDSStore] Broadcast received:", {
          orderId: order.id,
          sessionId: order.session_id,
          tableNumber: order.table_number,
        });

        // Gate: order must have been fired to kitchen
        // Accept sent_to_kitchen_at OR status of sent_to_kitchen/preparing
        if (
          !order.sent_to_kitchen_at &&
          order.status !== "sent_to_kitchen" &&
          order.status !== "preparing"
        ) {
          return;
        }

        // v2 (header-only) broadcasts: no items in payload, handle via refetch
        if (isHeaderOnlyBroadcast(order)) {
          const { tickets, _ticketIdsByOrderId } = get();
          const orderTids = _ticketIdsByOrderId[order.id];

          // Terminal statuses: remove tickets immediately from header alone
          if (TERMINAL_ORDER_STATUSES.has(order.status)) {
            let hasProtected = false;
            if (orderTids) {
              for (const tid of orderTids) {
                if (_pendingActions.has(tid) || _recalledTicketIds.has(tid)) {
                  hasProtected = true;
                  break;
                }
              }
            }
            if (!hasProtected && orderTids?.size) {
              const filtered = tickets.filter(
                (t) => !orderTids!.has(t.ticket_id),
              );
              const bucketed = smartBucketTickets(
                filtered,
                get().ticketsByStatus,
                get().prioritizedTicketIds,
                get().newOrderPosition,
              );
              set({ tickets: filtered, ...bucketed });
            }
            return;
          }

          // Track potential new order for sound notification after refetch
          if (!orderTids?.size) {
            _pendingNewOrderSounds.add(order.id);
          }

          // Fast refetch for authoritative ticket data
          const locationId = order.location_id;
          if (locationId) {
            const allProtected =
              orderTids &&
              orderTids.size > 0 &&
              Array.from(orderTids).every((tid) => _pendingActions.has(tid));
            if (!allProtected) {
              get().scheduleRefetch(locationId, true);
            }
          }
          return;
        }

        // Legacy v1 full broadcast path — skip if no items (payment-only broadcast)
        if (!order.order_items || order.order_items.length === 0) return;

        const {
          tickets,
          kdsDisplayId,
          routingMode,
          cachedRules,
          _ticketIdsByOrderId,
          _ticketsById,
        } = get();

        // O(1) lookup for tickets belonging to this order
        const orderTids = _ticketIdsByOrderId[order.id];
        const hadExistingTickets = !!orderTids?.size;

        // If every ticket for this order has a pending action, this broadcast is our own echo —
        // optimistic state is already correct, skip the entire processing pipeline.
        if (
          orderTids &&
          orderTids.size > 0 &&
          Array.from(orderTids).every((tid) => _pendingActions.has(tid))
        ) {
          return;
        }

        // Terminal statuses: remove all tickets for this order (unless protected by recall/pending)
        if (TERMINAL_ORDER_STATUSES.has(order.status)) {
          let hasProtected = false;
          if (orderTids) {
            for (const tid of orderTids) {
              if (_pendingActions.has(tid) || _recalledTicketIds.has(tid)) {
                hasProtected = true;
                break;
              }
            }
          }
          if (!hasProtected) {
            if (hadExistingTickets) {
              const filtered = tickets.filter(
                (t) => !orderTids!.has(t.ticket_id),
              );
              const bucketed = smartBucketTickets(
                filtered,
                get().ticketsByStatus,
                get().prioritizedTicketIds,
                get().newOrderPosition,
              );
              set({ tickets: filtered, ...bucketed });
            }
            return;
          }
          // Protected tickets exist — fall through to normal broadcast processing
          // overlayPendingActions will preserve the recalled ticket's optimistic state
        }

        // Schedule a background refetch for authoritative server state.
        // Skip when all tickets for this order have pending actions — the broadcast
        // is our own echo and the optimistic state is already correct.
        const locationId = order.location_id;
        if (locationId) {
          const allProtected =
            orderTids &&
            orderTids.size > 0 &&
            Array.from(orderTids).every((tid) => _pendingActions.has(tid));
          if (!allProtected) {
            get().scheduleRefetch(locationId);
          }
        }

        // Client-side display filtering — always filter when display has routing rules
        let filteredOrder = order;
        if (shouldUseDisplayFilter(kdsDisplayId, routingMode, cachedRules)) {
          const filteredItems = order.order_items.filter((item) =>
            itemMatchesRules(item, cachedRules!, order.order_type),
          );
          if (filteredItems.length === 0) {
            // Track for sound: if this is a new order, the server refetch may add it
            if (!hadExistingTickets) _pendingNewOrderSounds.add(order.id);
            return;
          }
          filteredOrder = { ...order, order_items: filteredItems };
        }

        // Build new tickets from broadcast
        const newTickets = buildTicketsFromBroadcast(filteredOrder);
        if (__DEV__) {
          console.log("[KDS Debug] broadcast built tickets", {
            orderId: order.id,
            orderStatus: order.status,
            existingTicketsForOrder: orderTids?.size ?? 0,
            builtCount: newTickets.length,
            builtIds: newTickets.map((t) => t.ticket_id),
          });
        }

        // Stabilize ticket_id and start_time_epoch for existing tickets so that:
        // (a) mergeTickets reuses the same reference (no FlatList re-mount animation)
        // (b) prioritizedTicketIds still matches the old ticket_id → priority preserved
        // (c) separate fire rounds for the same order stay as separate tickets
        const existingForOrder = orderTids
          ? Array.from(orderTids)
              .map((tid) => _ticketsById[tid])
              .filter(Boolean)
          : [];
        let stabilizedNewTickets = newTickets;
        if (existingForOrder.length > 0) {
          const itemSignature = (t: KDSTicket) => {
            const ids = t.items
              .map((i) => i.id)
              .sort()
              .join(",");
            return `${t.course_number}|${ids}`;
          };

          const existingByTicketId = new Map<string, KDSTicket>();
          const existingBySignature = new Map<string, KDSTicket[]>();
          for (const t of existingForOrder) {
            existingByTicketId.set(t.ticket_id, t);
            const sig = itemSignature(t);
            const bucket = existingBySignature.get(sig);
            if (bucket) bucket.push(t);
            else existingBySignature.set(sig, [t]);
          }

          stabilizedNewTickets = newTickets.map((newT) => {
            let existing = existingByTicketId.get(newT.ticket_id);

            // fire_time changes can regenerate ticket_id; recover identity via
            // stable signature (course + item ids) so recalls/pending actions survive.
            if (!existing) {
              const sig = itemSignature(newT);
              const bucket = existingBySignature.get(sig);
              if (bucket && bucket.length > 0) {
                existing = bucket.shift();
                if (__DEV__ && existing) {
                  console.log(
                    "[KDS Debug] broadcast stabilized ticket by signature",
                    {
                      orderId: order.id,
                      oldTicketId: existing.ticket_id,
                      newComputedTicketId: newT.ticket_id,
                      signature: sig,
                    },
                  );
                }
              }
            }

            if (!existing) return newT; // New course — keep computed ID

            const recalledIds = new Set(
              existing.items.filter((i) => i.recalled).map((i) => i.id),
            );

            return {
              ...newT,
              ticket_id: existing.ticket_id,
              start_time_epoch: existing.start_time_epoch,
              start_time: existing.start_time,
              items: newT.items.map((item) =>
                recalledIds.has(item.id) && !item.recalled
                  ? { ...item, recalled: true }
                  : item,
              ),
            };
          });
        }

        // Remove old tickets for this order, add stabilized new ones
        const otherTickets = orderTids
          ? tickets.filter((t) => !orderTids.has(t.ticket_id))
          : tickets;
        const rawMerged = sortKdsTicketsStable(
          dedupeTicketsById([...otherTickets, ...stabilizedNewTickets]),
        );
        if (__DEV__) {
          console.log("[KDS Debug] broadcast merge", {
            orderId: order.id,
            otherTickets: otherTickets.length,
            stabilizedNewTickets: stabilizedNewTickets.length,
            mergedCount: rawMerged.length,
          });
        }

        // Overlay pending optimistic states to prevent broadcast clobber
        const overlaid = overlayPendingActions(rawMerged);

        // Merge with existing tickets to reuse unchanged references
        const { merged, mergedById, changed } = mergeTickets(
          overlaid,
          _ticketsById,
        );

        // Skip store update when nothing changed (e.g. payment-only broadcasts)
        if (!changed) return;

        const reconciled = reconcilePriorityFlags(
          merged,
          get().prioritizedTicketIds,
        );
        const bucketed = smartBucketTickets(
          reconciled,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        // Incremental order-id index update: only touch the one order this broadcast is for
        const prevOrderIndex = get()._ticketIdsByOrderId;
        const newTidSet = new Set(stabilizedNewTickets.map((t) => t.ticket_id));
        const updatedOrderIndex = { ...prevOrderIndex, [order.id]: newTidSet };

        set({
          tickets: reconciled,
          _ticketsById: mergedById,
          _ticketIdsByOrderId: updatedOrderIndex,
          ...bucketed,
        });

        // Fire new-order callback (for sound notifications)
        if (!hadExistingTickets && newTickets.length > 0) {
          const cb = get()._onNewOrderCallback;
          if (cb) cb(order.order_source ?? null);
        }
      },

      incrementTimerTick: () => {
        set((state) => ({
          timerTick: state.timerTick + 1,
          nowEpochMs: Date.now(),
        }));
      },

      scheduleRefetch: (locationId: string, immediate?: boolean) => {
        if (_refetchTimeout) clearTimeout(_refetchTimeout);
        _refetchTimeout = setTimeout(
          () => {
            get()._backgroundFetchTickets(locationId);
          },
          immediate ? 300 : 1500,
        );
      },

      // ─── Long-Press Actions ─────────────────────────────────────────

      recallTicket: (ticketId: string) => {
        const { tickets, _ticketsById } = get();
        const ticket = _ticketsById[ticketId];
        if (!ticket || ticket.status !== "ready") return;

        const recallableItemIds = ticket.items
          .filter((item) => isRecallableKitchenItem(item))
          .map((i) => i.id);
        if (recallableItemIds.length === 0) return;

        const recallStatus = getKitchenSentStatus();
        const recallTicketStatus: KDSTicket["status"] =
          recallStatus === "preparing" ? "cooking" : "pending";

        if (__DEV__) {
          console.log("[KDS Debug] recallTicket start", {
            ticketId,
            orderId: ticket.db_order_id,
            workflowSentStatus: recallStatus,
            recallTicketStatus,
            recallableItemIds,
            itemStatusesBefore: ticket.items.map((i) => ({
              id: i.id,
              status: i.kitchen_status,
              voided: Boolean(i.is_voided),
              refundedQty: i.refunded_quantity ?? 0,
            })),
          });
        }

        // Register pending action (full ticket override — recall replaces all item statuses)
        const itemStatusMap = new Map<string, string>();
        for (const id of recallableItemIds) itemStatusMap.set(id, recallStatus);
        setPendingAction(ticketId, {
          ticketId,
          targetStatus: recallTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
        });

        // Optimistic: reset all items, ticket to recall status, mark as recalled
        addRecalledTicketId(ticketId);
        const recallableSet = new Set(recallableItemIds);
        const updatedTickets = tickets.map((t) =>
          t.ticket_id === ticketId
            ? {
                ...t,
                status: recallTicketStatus,
                items: t.items.map((item) => ({
                  ...item,
                  kitchen_status: recallableSet.has(item.id)
                    ? recallStatus
                    : item.kitchen_status,
                  recalled: true,
                })),
              }
            : t,
        );

        const updatedTicket = updatedTickets.find(
          (t) => t.ticket_id === ticketId,
        );
        const updatedById = updatedTicket
          ? { ..._ticketsById, [ticketId]: updatedTicket }
          : _ticketsById;

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          _ticketIdsByOrderId: buildOrderIdIndex(updatedById),
          ...bucketed,
        });

        if (__DEV__) {
          const optimisticTicket = updatedById[ticketId];
          console.log("[KDS Debug] recallTicket optimistic applied", {
            ticketId,
            optimisticTicketStatus: optimisticTicket?.status,
            optimisticItemStatuses: optimisticTicket?.items?.map((i) => ({
              id: i.id,
              status: i.kitchen_status,
              recalled: Boolean(i.recalled),
            })),
          });
        }

        // Backend: recall via RPC with cancellable retry
        const retryKey = `recall_${ticketId}`;
        const client = getClient();
        if (client) {
          const targetOrderStatus = getOrderSentStatus();
          const orderId = ticket.db_order_id;
          scheduleRetry(
            retryKey,
            async () => {
              // Primary persistence path: write order_items kitchen_status via the
              // same RPC used by normal KDS transitions.
              const bulkResult = await OrderService.bulkUpdateOrderItemStatus(
                client,
                recallableItemIds,
                recallStatus,
              );
              if (bulkResult.error) throw bulkResult.error;

              if (__DEV__) {
                console.log("[KDS Debug] recallTicket bulkUpdate success", {
                  ticketId,
                  orderId,
                  recallableItemIds,
                  targetStatus: recallStatus,
                  result: bulkResult.data,
                });
              }

              // Best-effort compatibility call: some environments rely on recall_kds_items
              // to reset display-specific rows. Do not fail the whole recall if this RPC
              // is out-of-sync (e.g., missing kds_item_status.updated_at column).
              const recallResult = await OrderService.recallOrderItems(
                client,
                recallableItemIds,
                recallStatus,
              );
              if (recallResult.error) {
                console.warn(
                  "[KDSStore] recallOrderItems non-fatal after bulkUpdate:",
                  recallResult.error,
                );
              } else if (__DEV__) {
                console.log(
                  "[KDS Debug] recallTicket recallOrderItems success",
                  {
                    ticketId,
                    orderId,
                    recallableItemIds,
                    targetStatus: recallStatus,
                    result: recallResult.data,
                  },
                );
              }
            },
            0,
            () => {
              if (orderId) {
                OrderService.updateOrderStatus(
                  client,
                  orderId,
                  targetOrderStatus,
                ).then(({ error }) => {
                  if (
                    error &&
                    error.code !== "P0001" &&
                    !error.message?.includes("already in")
                  ) {
                    console.error(
                      "[KDSStore] Failed to reopen order status after recall:",
                      error,
                    );
                  }

                  if (__DEV__) {
                    console.log(
                      "[KDS Debug] recallTicket updateOrderStatus result",
                      {
                        ticketId,
                        orderId,
                        targetOrderStatus,
                        error: error ?? null,
                      },
                    );
                  }
                });
              }

              if (_pendingActions.has(ticketId)) {
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              }
            },
            () => {
              deletePendingAction(ticketId);
              const lastLoc = get()._lastLocationId;
              if (lastLoc) get().scheduleRefetch(lastLoc);
            },
          );
        }
      },

      isTicketRecalled: (ticketId: string) => _recalledTicketIds.has(ticketId),

      prioritizeTicket: (ticketId: string) => {
        const { tickets, _ticketsById, prioritizedTicketIds } = get();
        const ticket = _ticketsById[ticketId];
        if (!ticket) return;
        const nextPriorityState = !prioritizedTicketIds.has(ticketId);

        const itemIds = ticket.items.map((i) => i.id);

        // Register pending action to protect against broadcast clobber
        const itemStatusMap = new Map<string, string>();
        for (const item of ticket.items)
          itemStatusMap.set(item.id, item.kitchen_status);
        setPendingAction(ticketId, {
          ticketId,
          targetStatus: ticket.status,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
          prioritized: nextPriorityState,
        });

        // Toggle membership in prioritized set
        const nextPrioritized = new Set(prioritizedTicketIds);
        if (nextPriorityState) nextPrioritized.add(ticketId);
        else nextPrioritized.delete(ticketId);

        // Mark ticket + items with prioritized flag
        const updatedTickets = tickets.map((t) =>
          t.ticket_id === ticketId
            ? {
                ...t,
                prioritized: nextPriorityState,
                items: t.items.map((i) => ({
                  ...i,
                  is_prioritized: nextPriorityState,
                })),
              }
            : t,
        );

        // Immediate reorder — prevBucket ordering ensures only the new ticket moves
        // (appends to end of priority section), so LinearTransition animates smoothly.
        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          nextPrioritized,
          get().newOrderPosition,
        );
        set({
          tickets: updatedTickets,
          prioritizedTicketIds: nextPrioritized,
          ...bucketed,
        });

        // Backend sync — clear pending action on success
        const client = getClient();
        if (client && itemIds.length > 0) {
          scheduleRetry(
            `priority_${ticketId}`,
            () =>
              OrderService.togglePriorityOnItems(
                client,
                itemIds,
                nextPriorityState,
              ),
            0,
            () => {
              const loc = get()._lastLocationId;
              if (loc) get().scheduleRefetch(loc);
            },
            () => {
              deletePendingAction(ticketId);
              const loc = get()._lastLocationId;
              if (loc) get().scheduleRefetch(loc);
            },
          );
        }
      },

      toggleRush: (ticketId: string) => {
        const { tickets, _ticketsById } = get();
        const ticket = _ticketsById[ticketId];
        if (!ticket) return;

        const currentRush = ticket.items.some((i) => i.rush);
        const newRush = !currentRush;
        const itemIds = ticket.items.map((i) => i.id);

        // Register pending action to protect against broadcast clobber
        const itemStatusMap = new Map<string, string>();
        for (const item of ticket.items)
          itemStatusMap.set(item.id, item.kitchen_status);
        setPendingAction(ticketId, {
          ticketId,
          targetStatus: ticket.status,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
          rushOverride: newRush,
        });

        // Optimistic: toggle rush on all items
        const updatedTickets = tickets.map((t) =>
          t.ticket_id === ticketId
            ? {
                ...t,
                items: t.items.map((item) => ({ ...item, rush: newRush })),
              }
            : t,
        );

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        set({ tickets: updatedTickets, ...bucketed });

        // Backend: toggle rush via RPC with cancellable retry
        const client = getClient();
        if (client && itemIds.length > 0) {
          scheduleRetry(
            `rush_${ticketId}`,
            () => OrderService.toggleRushOnItems(client, itemIds, newRush),
            0,
            () => {
              if (_pendingActions.has(ticketId)) {
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              }
            },
            () => {
              deletePendingAction(ticketId);
              const lastLoc = get()._lastLocationId;
              if (lastLoc) get().scheduleRefetch(lastLoc);
            },
          );
        }
      },

      markItemDone: (ticketId: string, itemId: string) => {
        const { tickets, _ticketsById } = get();
        const ticket = _ticketsById[ticketId];
        if (!ticket) return;

        const item = ticket.items.find((i) => i.id === itemId);
        if (!item || item.kitchen_status === "ready") return;

        // Optimistic: mark item as "ready"
        const updatedItems = ticket.items.map((i) =>
          i.id === itemId ? { ...i, kitchen_status: "ready" } : i,
        );

        // Re-derive ticket status
        const actionableUpdatedItems = updatedItems.filter((i) =>
          isActionableKitchenItem(i),
        );
        const allReady =
          actionableUpdatedItems.length === 0 ||
          actionableUpdatedItems.every((i) => i.kitchen_status === "ready");
        const anySent = actionableUpdatedItems.some(
          (i) => i.kitchen_status === "sent",
        );
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
        setPendingAction(ticketId, {
          ticketId,
          targetStatus: newTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
        });

        const updatedTickets = tickets.map((t) => {
          if (t.ticket_id !== ticketId) return t;
          const resetEpoch = allReady && _recalledTicketIds.has(ticketId);
          return {
            ...t,
            status: newTicketStatus,
            items: updatedItems,
            ...(resetEpoch ? { start_time_epoch: Date.now() } : {}),
          };
        });

        const updatedById = {
          ..._ticketsById,
          [ticketId]: {
            ...ticket,
            status: newTicketStatus,
            items: updatedItems,
            ...(allReady && _recalledTicketIds.has(ticketId)
              ? { start_time_epoch: Date.now() }
              : {}),
          },
        };

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          ...bucketed,
        });

        // Backend: mark item ready with action-specific retry key to avoid cancelling ticket-level retries
        const retryKey = `item_${ticketId}_${itemId}`;
        const client = getClient();
        if (client) {
          scheduleRetry(
            retryKey,
            () =>
              OrderService.bulkUpdateOrderItemStatus(
                client,
                [itemId],
                "ready",
                { keyOverride: toBulkUpdateStatusKey([itemId], "ready") },
              ),
            0,
            () => {
              // Only refetch if pending action hasn't already been reconciled by broadcast echo
              if (_pendingActions.has(ticketId)) {
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              }
            },
            () => {
              deletePendingAction(ticketId);
              const lastLoc = get()._lastLocationId;
              if (lastLoc) get().scheduleRefetch(lastLoc);
            },
          );
        }
      },

      // ─── Done Ticket Actions ────────────────────────────────────────

      recallDoneTicket: (ticketId: string) => {
        const { doneTickets, tickets, _ticketsById } = get();
        const ticket = doneTickets.find((t) => t.ticket_id === ticketId);
        if (!ticket) return;

        const recallableItemIds = ticket.items
          .filter((item) => isRecallableKitchenItem(item))
          .map((i) => i.id);
        if (recallableItemIds.length === 0) return;

        const recallStatus = getKitchenSentStatus();
        const recallTicketStatus: KDSTicket["status"] =
          recallStatus === "preparing" ? "cooking" : "pending";

        if (__DEV__) {
          console.log("[KDS Debug] recallDoneTicket start", {
            ticketId,
            orderId: ticket.db_order_id,
            workflowSentStatus: recallStatus,
            recallTicketStatus,
            recallableItemIds,
            itemStatusesBefore: ticket.items.map((i) => ({
              id: i.id,
              status: i.kitchen_status,
              voided: Boolean(i.is_voided),
              refundedQty: i.refunded_quantity ?? 0,
            })),
          });
        }

        // Register pending action to protect optimistic state from broadcast clobber
        const itemStatusMap = new Map<string, string>();
        for (const id of recallableItemIds) itemStatusMap.set(id, recallStatus);
        setPendingAction(ticketId, {
          ticketId,
          targetStatus: recallTicketStatus,
          itemStatuses: itemStatusMap,
          timestamp: Date.now(),
        });

        // Move from done → active tickets with workflow-aware status
        addRecalledTicketId(ticketId);
        const recallableSet = new Set(recallableItemIds);
        const restoredTicket: KDSTicket = {
          ...ticket,
          status: recallTicketStatus,
          items: ticket.items.map((item) => ({
            ...item,
            kitchen_status: recallableSet.has(item.id)
              ? recallStatus
              : item.kitchen_status,
            recalled: true,
          })),
        };
        const updatedDone = doneTickets.filter((t) => t.ticket_id !== ticketId);
        const updatedTickets = [...tickets, restoredTicket];
        const updatedById = { ..._ticketsById, [ticketId]: restoredTicket };

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          _ticketIdsByOrderId: buildOrderIdIndex(updatedById),
          ...bucketed,
          doneTickets: updatedDone,
          doneCount: updatedDone.length,
        });

        if (__DEV__) {
          const optimisticTicket = updatedById[ticketId];
          console.log("[KDS Debug] recallDoneTicket optimistic applied", {
            ticketId,
            optimisticTicketStatus: optimisticTicket?.status,
            optimisticItemStatuses: optimisticTicket?.items?.map((i) => ({
              id: i.id,
              status: i.kitchen_status,
              recalled: Boolean(i.recalled),
            })),
          });
        }

        // Backend: recall via RPC with cancellable retry
        const retryKey = `recall_done_${ticketId}`;
        const client = getClient();
        if (client) {
          const targetOrderStatus = getOrderSentStatus();
          const orderId = ticket.db_order_id;
          scheduleRetry(
            retryKey,
            async () => {
              // Primary persistence path: write order_items kitchen_status via the
              // same RPC used by normal KDS transitions.
              const bulkResult = await OrderService.bulkUpdateOrderItemStatus(
                client,
                recallableItemIds,
                recallStatus,
              );
              if (bulkResult.error) throw bulkResult.error;

              if (__DEV__) {
                console.log("[KDS Debug] recallDoneTicket bulkUpdate success", {
                  ticketId,
                  orderId,
                  recallableItemIds,
                  targetStatus: recallStatus,
                  result: bulkResult.data,
                });
              }

              // Best-effort compatibility call: some environments rely on recall_kds_items
              // to reset display-specific rows. Do not fail the whole recall if this RPC
              // is out-of-sync (e.g., missing kds_item_status.updated_at column).
              const recallResult = await OrderService.recallOrderItems(
                client,
                recallableItemIds,
                recallStatus,
              );
              if (recallResult.error) {
                console.warn(
                  "[KDSStore] recallDoneOrderItems non-fatal after bulkUpdate:",
                  recallResult.error,
                );
              } else if (__DEV__) {
                console.log(
                  "[KDS Debug] recallDoneTicket recallOrderItems success",
                  {
                    ticketId,
                    orderId,
                    recallableItemIds,
                    targetStatus: recallStatus,
                    result: recallResult.data,
                  },
                );
              }
            },
            0,
            () => {
              if (orderId) {
                OrderService.updateOrderStatus(
                  client,
                  orderId,
                  targetOrderStatus,
                ).then(({ error }) => {
                  if (
                    error &&
                    error.code !== "P0001" &&
                    !error.message?.includes("already in")
                  ) {
                    console.error(
                      "[KDSStore] Failed to reopen order status after done-recall:",
                      error,
                    );
                  }

                  if (__DEV__) {
                    console.log(
                      "[KDS Debug] recallDoneTicket updateOrderStatus result",
                      {
                        ticketId,
                        orderId,
                        targetOrderStatus,
                        error: error ?? null,
                      },
                    );
                  }
                });
              }

              deletePendingAction(ticketId);
            },
            () => {
              deletePendingAction(ticketId);
              const lastLoc = get()._lastLocationId;
              if (lastLoc) get().scheduleRefetch(lastLoc);
            },
          );
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
        const mutations = new Map<
          string,
          {
            ticketStatus: KDSTicket["status"];
            newStatus: "preparing" | "ready" | "served";
          }
        >();
        const batchedItemIds: Record<
          "preparing" | "ready" | "served",
          string[]
        > = {
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
            const ticketStatus: KDSTicket["status"] =
              newStatus === "preparing" ? "cooking" : "ready";
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
        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );
        const updatedDone =
          servedTickets.length > 0
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
          for (const item of ticket.items)
            itemStatusMap.set(item.id, targetItemStatus);
          setPendingAction(tid, {
            ticketId: tid,
            targetStatus: removeIds.has(tid)
              ? "done"
              : (mutation!.ticketStatus as KDSTicket["status"]),
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
              () =>
                OrderService.bulkUpdateOrderItemStatus(client, ids, status, {
                  keyOverride: toBulkUpdateStatusKey(ids, status)
                }),
              0,
              () => {
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              },
              () => {
                for (const [tid] of ticketIndex) {
                  const m = mutations.get(tid);
                  const effectiveStatus = removeIds.has(tid)
                    ? "served"
                    : m?.newStatus;
                  if (effectiveStatus === status) deletePendingAction(tid);
                }
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              },
            );
          }
        }
      },

      bulkMarkTicketsDone: (ticketIds: string[]) => {
        const { tickets, _ticketsById } = get();
        const ticketSet = new Set(ticketIds);
        const matchedTickets = tickets.filter((t) =>
          ticketSet.has(t.ticket_id),
        );
        if (matchedTickets.length === 0) return;

        // Build single optimistic state update for ALL tickets at once
        const removedIds = new Set<string>();
        const newDoneTickets: KDSTicket[] = [];

        for (const ticket of matchedTickets) {
          const actionableItemIds = ticket.items
            .filter((i) => isActionableKitchenItem(i))
            .map((i) => i.id);

          // Cancel per-item retries
          for (const id of actionableItemIds) {
            cancelRetry(`item_${ticket.ticket_id}_${id}`);
          }

          // Register pending action
          const itemStatusMap = new Map<string, string>();
          for (const id of actionableItemIds) itemStatusMap.set(id, "served");
          if (actionableItemIds.length > 0) {
            setPendingAction(ticket.ticket_id, {
              ticketId: ticket.ticket_id,
              targetStatus: "done",
              itemStatuses: itemStatusMap,
              timestamp: Date.now(),
            });
          }

          removedIds.add(ticket.ticket_id);
          deleteRecalledTicketId(ticket.ticket_id);
          newDoneTickets.push({
            ...ticket,
            status: "done" as KDSTicket["status"],
            done_time_epoch: Date.now(),
          });

          // Fire backend RPC per ticket (async, non-blocking)
          const client = getClient();
          if (client && actionableItemIds.length > 0) {
            const retryKey = `advance_${ticket.ticket_id}_served`;
            scheduleRetry(
              retryKey,
              () =>
                OrderService.bulkUpdateOrderItemStatus(
                  client,
                  actionableItemIds,
                  "served",
                  {
                    keyOverride: toBulkUpdateStatusKey(
                      actionableItemIds,
                      "served",
                    ),
                  },
                ),
              0,
              () => {
                if (_pendingActions.has(ticket.ticket_id)) {
                  const lastLoc = get()._lastLocationId;
                  if (lastLoc) get().scheduleRefetch(lastLoc);
                }
              },
              () => {
                deletePendingAction(ticket.ticket_id);
                const lastLoc = get()._lastLocationId;
                if (lastLoc) get().scheduleRefetch(lastLoc);
              },
            );
          }
        }

        // Single state update for all tickets
        const updatedTickets = tickets.filter(
          (t) => !removedIds.has(t.ticket_id),
        );
        const updatedById = { ..._ticketsById };
        for (const id of removedIds) delete updatedById[id];
        const updatedDone = [...newDoneTickets, ...get().doneTickets].slice(
          0,
          50,
        );

        const bucketed = smartBucketTickets(
          updatedTickets,
          get().ticketsByStatus,
          get().prioritizedTicketIds,
          get().newOrderPosition,
        );

        set({
          tickets: updatedTickets,
          _ticketsById: updatedById,
          _ticketIdsByOrderId: buildOrderIdIndex(updatedById),
          ...bucketed,
          doneTickets: updatedDone,
          doneCount: updatedDone.length,
          selectedTicketIds: new Set<string>(),
        });
      },

      // ─── Cleanup (for unmount) ──────────────────────────────────────
      _cleanup: () => {
        cancelAllRetries();
        _pendingActions.clear();
        _pendingNewOrderSounds.clear();
        if (_refetchTimeout) {
          clearTimeout(_refetchTimeout);
          _refetchTimeout = null;
        }
        _broadcastDebounceTimers.forEach((t) => clearTimeout(t));
        _broadcastDebounceTimers.clear();
        _fetchInFlight = false;
      },
    }),
    {
      name: "kds-ticket-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
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
        enrichedRules: state.enrichedRules,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          state.isInitialLoading = false;
          // Rebuild tickets array + indexes + buckets from persisted _ticketsById
          const byId = state._ticketsById ?? {};
          const tickets = Object.values(byId);
          state.tickets = tickets;
          state._ticketIdsByOrderId = buildOrderIdIndex(byId);
          const bucketed = smartBucketTickets(tickets, {
            pending: [],
            cooking: [],
            ready: [],
          });
          state.ticketsByStatus = bucketed.ticketsByStatus;
          state.counts = bucketed.counts;
          if (!(state.selectedTicketIds instanceof Set)) {
            state.selectedTicketIds = new Set<string>();
          }
          if (!(state.prioritizedTicketIds instanceof Set)) {
            const derived = new Set<string>();
            for (const t of tickets) {
              if (t.prioritized) derived.add(t.ticket_id);
            }
            state.prioritizedTicketIds = derived;
          }
        }
      },
    },
  ),
);
