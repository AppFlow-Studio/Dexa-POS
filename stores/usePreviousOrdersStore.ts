import type { OrderBroadcastPayload } from "@/hooks/realtime/useOrdersRealtime";
import {
    getCurrentBusinessDay,
    type BusinessDayConfig,
} from "@/lib/businessDay";
import {
    derivePaidStatus,
    derivePaymentRefundState,
} from "@/lib/paymentStatus";
import { OrderProfile, PaymentType, PreviousOrder } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { RefundService } from "@/services/refundService";
import { projectToSummary, todayOrdersCache } from "@/stores/todayOrdersCache";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type {
    RefundReasonType,
    RefundRequest,
    RefundResult,
    RefundRpcOutcome,
} from "@/types/refunds";
import {
    FetchedOrderData,
    normalizeFetchedOrder,
    transformBroadcastToOrder,
} from "@/utils/orderTransformers";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

/** Metadata passed from fraud guard to tag refund records and audit logs. */
export interface RefundFraudMetadata {
  fraudFlags?: string[];
  velocityCount?: number;
  approvedByManagerId?: string;
  approvedByManagerName?: string;
}

/** Same source as useOrdersQuery / reconcile: selected store, then floor plan fallback */
function resolveHistoryLocationId(): string | null {
  const storeId = useStoreSettingsStore.getState().selectedStore?.id ?? null;
  if (storeId) return storeId;
  return useFloorPlanStore.getState().locationId;
}

/** Resolve the BusinessDayConfig from the current location settings. */
function resolveBusinessDayConfig(): BusinessDayConfig | null {
  const store = useStoreSettingsStore.getState().selectedStore;
  if (!store?.timezone) return null;
  return {
    timezone: store.timezone,
    rolloverHour: store.business_day_start_hour ?? 0,
  };
}

/** DB row id and local order id may both appear in URLs / lookups */
function buildOrderLookupMap(
  orders: PreviousOrder[],
): Record<string, PreviousOrder> {
  const lookup: Record<string, PreviousOrder> = {};
  for (const o of orders) {
    if (o.db_order_id) lookup[o.db_order_id] = o;
    if (o.orderId) lookup[o.orderId] = o;
  }
  return lookup;
}

function _derivePaymentStatus(
  profile: OrderProfile,
): PreviousOrder["paymentStatus"] {
  const derived = derivePaidStatus(profile);
  if (derived === "Paid") return "Paid";
  if (derived === "Refunded") return "Refunded";
  if (derived === "Partial") return "In Progress";
  if (profile.paid_status === "Unpaid") return "Unpaid";
  return "Unpaid";
}

function _isFinalState(profile: OrderProfile): boolean {
  return (
    profile.check_status === "Closed" ||
    profile.paid_status === "Paid" ||
    profile.paid_status === "Refunded" ||
    profile.order_status === "completed" ||
    profile.order_status === "void" ||
    profile.order_status === "cancelled"
  );
}

const HISTORY_REFRESH_COALESCE_MS = 4000;
let refreshPreviousOrdersInFlight: Promise<void> | null = null;

// Global client reference
let _supabaseClient: SupabaseClient | null = null;
export const setPreviousOrdersSupabaseClient = (
  client: SupabaseClient | null,
) => {
  _supabaseClient = client;
};

interface RefundItem {
  itemId: string;
  quantity: number;
  reason: string;
  refundedAt: string;
  refundedBy: string;
}

interface RefundRecord {
  id: string;
  orderId: string;
  type: "full" | "partial";
  items: RefundItem[];
  totalRefunded: number;
  reason: string;
  refundedAt: string;
  refundedBy: string;
  paymentMethod: PaymentType;
}

const toRefundReasonType = (reason: string): RefundReasonType => {
  switch (reason) {
    case "customer_request":
    case "item_quality":
    case "wrong_item":
    case "never_received":
    case "duplicate_charge":
    case "price_adjustment":
    case "order_cancelled":
    case "kitchen_error":
    case "manager_comp":
    case "other":
      return reason;
    default:
      return "other";
  }
};

const MAX_IN_MEMORY_PREVIOUS_ORDERS = 200;
const INITIAL_FETCH_SIZE = 30;
const LOAD_MORE_PAGE_SIZE = 30;
const LOAD_MORE_COOLDOWN_MS = 2000;

// Cooldown tracking for onEndReached cascade prevention
let _lastLoadMoreCompletedAt = 0;

export type DateWindowLabel = "today" | "yesterday" | "last_7_days" | "custom";

export interface DateWindow {
  startDate: string | null; // ISO date string, null = today (server computes)
  endDate: string | null; // ISO date string
  label: DateWindowLabel;
  // Resolved bounds from RPC (cached for broadcast guard + loadMore)
  _resolvedStartTs: string | null;
  _resolvedEndTs: string | null;
}

const DEFAULT_DATE_WINDOW: DateWindow = {
  startDate: null,
  endDate: null,
  label: "today",
  _resolvedStartTs: null,
  _resolvedEndTs: null,
};

interface PreviousOrdersState {
  previousOrders: PreviousOrder[];
  refunds: RefundRecord[];
  newOrdersCount: number; // Tracks how many new orders are available on server
  _orderLookup: Record<string, PreviousOrder>;
  /** Successful refresh timestamp (for coalescing with bootstrap + tab mount) */
  lastHistoryRefreshAt: number | null;
  /** Location id used for last successful refresh (invalidates throttle on store switch) */
  _lastRefreshLocationId: string | null;

  // Date window for business-day-aware filtering
  dateWindow: DateWindow;

  // Pagination state
  _currentOffset: number;
  _hasMore: boolean;
  _isLoadingMore: boolean;

  // Actions
  addOrderToHistory: (order: OrderProfile) => void;
  getOrderById: (orderId: string) => PreviousOrder | undefined;
  searchOrders: (query: string) => PreviousOrder[];
  getOrdersByDate: (date: Date) => PreviousOrder[];
  setDateWindow: (window: {
    startDate: string | null;
    endDate: string | null;
    label: DateWindowLabel;
  }) => void;
  refreshPreviousOrders: (opts?: { force?: boolean }) => Promise<void>; // Full refresh from backend
  loadMoreOrders: () => Promise<void>; // Paginated load-more
  checkForNewOrders: () => Promise<number>; // Check for new orders (lightweight)
  clearNewOrdersCount: () => void; // Reset new orders counter

  // Refund actions
  refundFullOrder: (
    orderId: string,
    reason: string,
    initiatedByStaffId: string,
    initiatedByName: string,
    paymentMethod: PaymentType,
    metadata?: RefundFraudMetadata,
  ) => Promise<RefundRpcOutcome<RefundResult> | undefined>;
  refundItems: (
    orderId: string,
    items: Array<{ itemId: string; quantity: number; reason: string }>,
    initiatedByStaffId: string,
    initiatedByName: string,
    paymentMethod: PaymentType,
    metadata?: RefundFraudMetadata,
  ) => Promise<RefundRpcOutcome<RefundResult> | undefined>;
  getRefundsForOrder: (orderId: string) => RefundRecord[];
  patchPreviousOrder: (orderId: string, patch: Partial<PreviousOrder>) => void;
  _handleOrderBroadcast: (payload: OrderBroadcastPayload) => void;
}

/** Transform a fetched DB order row into a PreviousOrder. */
function _transformFetchedOrder(
  fo: FetchedOrderData,
  index: number,
  totalCount: number,
): PreviousOrder {
  const broadcastData = normalizeFetchedOrder(fo);
  const profile = transformBroadcastToOrder(broadcastData, undefined);

  const serialNo = profile.display_number
    ? profile.display_number.replace(/\D/g, "")
    : (totalCount - index).toString().padStart(3, "0");

  const orderTimestamp = profile.opened_at || new Date().toISOString();
  const orderDate = new Date(orderTimestamp);

  return {
    serialNo,
    timestamp: orderTimestamp,
    orderDate: orderDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    orderTime: orderDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    orderId: profile.id,
    display_number: profile.display_number || `#${serialNo}`,
    paymentStatus: _derivePaymentStatus(profile),
    customer: profile.customer_name || "Walk-In Customer",
    server: profile.server_name || "Unknown",
    opened_at: profile.opened_at || orderTimestamp,
    closed_at: profile.closed_at || "",
    sent_to_kitchen_at: profile.sent_to_kitchen_at || "",
    last_activity_at: profile.last_activity_at || orderTimestamp,
    itemCount: profile.items.length,
    amount_paid: profile.amount_paid || 0,
    amount_due: profile.amount_due || 0,
    cash_amount_due: profile.cash_amount_due || 0,
    type: (profile.order_type || "Dine In") as any,
    total: profile.total_amount || 0,
    tax: profile.total_tax || 0,
    items: profile.items,
    notes: profile.notes,
    voided: profile.order_status === "void",
    refunded:
      profile.paid_status === "Refunded" ||
      (profile.order_status === "refunded" && profile.paid_status !== "Paid") ||
      ((profile.payments || []).some(
        (p) => p.isVoided === true || p.status === "voided",
      ) &&
        !(profile.payments || []).some(
          (p) => !p.isVoided && p.status === "captured",
        )),
    refundedAmount: 0,
    originalTotal: profile.total_amount || 0,
    payments: profile.payments,
    service_location_id: profile.service_location_id ?? undefined,
    service_location_name: profile.service_location_name,
    station_id: profile.station_id,
    station_name: profile._sourceStationName || undefined,
    checkStatus: profile.check_status || "Opened",
    db_order_id: profile.db_order_id,
    order_source: profile.order_source ?? null,
    delivery_platform: profile.delivery_platform ?? null,
    reversals: profile.reversals,
    order_refund_items: profile.order_refund_items,
    created_by_staff_profile_id: profile.created_by_staff_profile_id ?? null,
  };
}

export const usePreviousOrdersStore = create<PreviousOrdersState>(
  (set, get) => ({
    previousOrders: [],
    refunds: [],
    newOrdersCount: 0,
    _orderLookup: {},
    lastHistoryRefreshAt: null,
    _lastRefreshLocationId: null,
    dateWindow: { ...DEFAULT_DATE_WINDOW },
    _currentOffset: 0,
    _hasMore: false,
    _isLoadingMore: false,

    setDateWindow: (window) => {
      set({
        dateWindow: {
          ...window,
          _resolvedStartTs: null,
          _resolvedEndTs: null,
        },
        previousOrders: [],
        _orderLookup: {},
        _currentOffset: 0,
        _hasMore: false, // Block loadMore until refresh resolves bounds + sets _hasMore
        _isLoadingMore: false,
        newOrdersCount: 0,
      });
      void get().refreshPreviousOrders({ force: true });
    },

    addOrderToHistory: (order: OrderProfile) => {
      // An order should be added to history if it has reached a final state.
      // Final states are:
      // 1. Order Status: completed, void, or cancelled (order lifecycle complete)
      // 2. Check Status: Closed (dine-in check has been closed for audit trail)
      // 3. Payment Status: Paid (order has been fully paid regardless of other status)

      const isFinalOrderStatus =
        order.order_status === "completed" ||
        order.order_status === "void" ||
        order.order_status === "cancelled";

      const isClosedCheck = order.check_status === "Closed";

      const isPaid = order.paid_status === "Paid";

      const isFinalState = isFinalOrderStatus || isClosedCheck || isPaid;

      if (!isFinalState) {
        return;
      }

      // Check if order already exists in history (O(1) lookup)
      const lookup = get()._orderLookup;
      const lookupKey = order.db_order_id || order.id;
      if (lookup[lookupKey]) {
        return; // Don't add duplicates
      }

      // Date window guard: only add if order falls within the current viewed window
      const { _resolvedStartTs, _resolvedEndTs } =
        get().dateWindow ?? DEFAULT_DATE_WINDOW;
      if (_resolvedStartTs && _resolvedEndTs) {
        const orderCreatedAt = order.opened_at;
        if (orderCreatedAt) {
          const orderTime = new Date(orderCreatedAt).getTime();
          if (
            orderTime < new Date(_resolvedStartTs).getTime() ||
            orderTime >= new Date(_resolvedEndTs).getTime()
          ) {
            return; // Order outside current date window
          }
        }
      }

      // Use the actual order timestamp, not current time
      const orderTimestamp = order.opened_at || new Date().toISOString();
      const orderDate = new Date(orderTimestamp);

      const serialNo = (get().previousOrders.length + 1)
        .toString()
        .padStart(3, "0");

      // Calculate total from items if total_amount is not available
      const finalTotal = order.total_amount || 0;

      // Determine order type with proper casting
      const orderType = (order.order_type || "Dine In") as
        | "Dine In"
        | "Takeaway"
        | "Delivery";

      const previousOrder: PreviousOrder = {
        serialNo,
        // Store ISO timestamp for filtering/sorting
        timestamp: orderTimestamp,
        // Keep formatted strings for display
        orderDate: orderDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        orderTime: orderDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        orderId: order.id,
        display_number: order.display_number || `#${serialNo}`,
        paymentStatus: _derivePaymentStatus(order),
        customer: order.customer_name || "Walk-In Customer",
        server: order.server_name || "Unknown",
        opened_at: order.opened_at || orderTimestamp,
        closed_at: order.closed_at || "",
        sent_to_kitchen_at: order.sent_to_kitchen_at || "",
        last_activity_at: order.last_activity_at || orderTimestamp,
        itemCount: order.items.length,
        amount_paid: order.amount_paid || 0,
        amount_due: order.amount_due || 0,
        cash_amount_due: order.cash_amount_due || 0,
        type: orderType,
        total: finalTotal,
        items: order.items,
        notes: order.notes, // Order-level notes (customer requests, special instructions)
        // Additional fields for refund tracking
        refunded: false,
        refundedAmount: 0,
        originalTotal: finalTotal,
        payments: order.payments,
        service_location_id: order.service_location_id ?? undefined,
        service_location_name: order.service_location_name,
        // Station tracking for view_scope awareness
        station_id: order.station_id,
        station_name: order._sourceStationName || undefined,
        // Check management
        checkStatus: order.check_status || "Opened",
        db_order_id: order.db_order_id,
        reversals: order.reversals,
        order_refund_items: order.order_refund_items,
        order_source: order.order_source ?? null,
        delivery_platform: order.delivery_platform ?? null,
        created_by_staff_profile_id: order.created_by_staff_profile_id ?? null,
      };

      set((state) => {
        let previousOrders = [...state.previousOrders, previousOrder];
        // Sort newest first and enforce memory cap
        previousOrders.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        if (previousOrders.length > MAX_IN_MEMORY_PREVIOUS_ORDERS) {
          previousOrders = previousOrders.slice(
            0,
            MAX_IN_MEMORY_PREVIOUS_ORDERS,
          );
        }
        return {
          previousOrders,
          _orderLookup: buildOrderLookupMap(previousOrders),
        };
      });

      // Write-through to MMKV cache for instant boot rendering
      const locationId = resolveHistoryLocationId();
      const config = resolveBusinessDayConfig();
      if (locationId && config) {
        todayOrdersCache.upsert(
          locationId,
          config,
          projectToSummary(previousOrder),
        );
      }
    },

    getOrderById: (orderId: string) => {
      const lookup = get()._orderLookup;
      return (
        lookup[orderId] ??
        get().previousOrders.find(
          (o) => o.orderId === orderId || o.db_order_id === orderId,
        )
      );
    },

    searchOrders: (query: string) => {
      const orders = get().previousOrders;
      const lowerQuery = query.toLowerCase();

      return orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.server.toLowerCase().includes(lowerQuery) ||
          order.items.some((item) =>
            item.name.toLowerCase().includes(lowerQuery),
          ) ||
          order.customer.toLowerCase().includes(lowerQuery),
      );
    },

    getOrdersByDate: (date: Date) => {
      const orders = get().previousOrders;
      const targetDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return orders.filter((order) => order.orderDate === targetDate);
    },

    refreshPreviousOrders: async (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      const client = _supabaseClient;
      if (!client) {
        console.warn(
          "Supabase client not initialized in usePreviousOrdersStore",
        );
        return;
      }

      const locationId = resolveHistoryLocationId();
      if (!locationId) {
        console.warn(
          "Location ID not found for history (selected store / floor plan)",
        );
        return;
      }

      const st = get();
      if (
        !force &&
        st._lastRefreshLocationId === locationId &&
        st.lastHistoryRefreshAt != null &&
        Date.now() - st.lastHistoryRefreshAt < HISTORY_REFRESH_COALESCE_MS
      ) {
        return;
      }

      if (refreshPreviousOrdersInFlight) {
        return refreshPreviousOrdersInFlight;
      }

      refreshPreviousOrdersInFlight = (async () => {
        if (__DEV__)
          console.log("Refreshing previous orders data from backend...");

        try {
          // Step 1: Resolve business day bounds
          // Defensive fallback for hot reload (dateWindow may not exist in old store state)
          const dateWindow = get().dateWindow ?? DEFAULT_DATE_WINDOW;
          let startTs: string | null = null;
          let endTs: string | null = null;

          // Strategy 1: Server RPC (authoritative)
          try {
            const bounds = await OrderService.getBusinessDayBounds(
              client,
              locationId,
              dateWindow.startDate,
              dateWindow.endDate,
            );
            if (bounds) {
              startTs = bounds.start_ts;
              endTs = bounds.end_ts;
              console.log(
                `[PreviousOrders] ✅ Business day bounds (server): ${startTs} → ${endTs}`,
              );
            }
          } catch (rpcErr) {
            console.warn(
              "[PreviousOrders] RPC get_business_day_bounds failed:",
              rpcErr,
            );
          }

          // Strategy 2: Client-side Luxon (if RPC failed)
          if (!startTs || !endTs) {
            try {
              const config = resolveBusinessDayConfig();
              if (config) {
                const {
                  getBusinessDayBounds: getLocalBounds,
                  getCurrentBusinessDay: getLocalDay,
                } = require("@/lib/businessDay");
                if (dateWindow.label === "today" || !dateWindow.startDate) {
                  const localDay = getLocalDay(config);
                  const localBounds = getLocalBounds(localDay, config);
                  startTs = localBounds.startUtc;
                  endTs = localBounds.endUtc;
                } else {
                  const localBounds = getLocalBounds(
                    dateWindow.startDate,
                    config,
                  );
                  startTs = localBounds.startUtc;
                  endTs = dateWindow.endDate
                    ? getLocalBounds(dateWindow.endDate, config).endUtc
                    : localBounds.endUtc;
                }
                console.log(
                  `[PreviousOrders] ⚠️ Using Luxon fallback bounds: ${startTs} → ${endTs}`,
                );
              }
            } catch (luxonErr) {
              console.warn("[PreviousOrders] Luxon fallback failed:", luxonErr);
            }
          }

          // Strategy 3: Plain JS Date (absolute last resort — no dependencies)
          if (!startTs || !endTs) {
            const store = useStoreSettingsStore.getState().selectedStore;
            const tz = store?.timezone || "America/New_York";
            const rollover = store?.business_day_start_hour ?? 0;
            // Get current time in merchant timezone using Intl
            const nowStr = new Date().toLocaleString("en-US", { timeZone: tz });
            const localNow = new Date(nowStr);
            const localHour = localNow.getHours();
            // Compute business day start in local time
            const dayStart = new Date(localNow);
            dayStart.setHours(rollover, 0, 0, 0);
            if (localHour < rollover) {
              dayStart.setDate(dayStart.getDate() - 1);
            }
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);
            // Convert back to UTC ISO strings (approximate — Intl round-trip)
            startTs = dayStart.toISOString();
            endTs = dayEnd.toISOString();
            console.log(
              `[PreviousOrders] 🔧 Using JS Date fallback bounds: ${startTs} → ${endTs}`,
            );
          }

          // Cache resolved bounds for broadcast guard + loadMore
          set({
            dateWindow: {
              ...dateWindow,
              _resolvedStartTs: startTs,
              _resolvedEndTs: endTs,
            },
          });

          // Step 2: Fetch orders within the business day window
          const { data: fetchedOrders, error } =
            await OrderService.getHistoryOrders(
              client,
              locationId,
              INITIAL_FETCH_SIZE,
              null,
              startTs,
              endTs,
            );

          if (error) {
            console.error("Failed to fetch previous orders:", error);
            return;
          }

          if (!fetchedOrders) return;

          // Transform fetched data into PreviousOrder objects using extracted helper
          const newPreviousOrders: PreviousOrder[] = fetchedOrders.map(
            (fo, index) =>
              _transformFetchedOrder(
                fo as FetchedOrderData,
                index,
                fetchedOrders.length,
              ),
          );

          // Skip pre-sort: the merged result is sorted below, and the Map merge
          // loses ordering anyway.

          const existingPreviousOrders = get().previousOrders;

          // Build merge map — filtered when date-bounded, full when not
          const ordersMap = new Map<string, PreviousOrder>();
          if (startTs && endTs) {
            // Filtered merge: only keep existing orders within the current date window.
            // This drops stale orders from other days while preserving broadcast-added
            // orders from today (avoids race condition where broadcast arrives mid-refresh).
            const startTime = new Date(startTs).getTime();
            const endTime = new Date(endTs).getTime();
            existingPreviousOrders.forEach((order) => {
              const key = order.db_order_id || order.orderId;
              const orderTime = new Date(order.timestamp).getTime();
              if (orderTime >= startTime && orderTime < endTime) {
                ordersMap.set(key, order);
              }
            });
          } else {
            // No date bounds (fallback): full merge to preserve all existing orders
            existingPreviousOrders.forEach((order) => {
              const key = order.db_order_id || order.orderId;
              ordersMap.set(key, order);
            });
          }

          // Overlay fetched data — server wins on duplicates
          newPreviousOrders.forEach((order) => {
            const key = order.db_order_id || order.orderId;
            ordersMap.set(key, order);
          });

          // Convert map values back to an array
          let mergedPreviousOrders = Array.from(ordersMap.values());

          // Sort by timestamp descending (newest first)
          mergedPreviousOrders.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );

          const newLookup = buildOrderLookupMap(mergedPreviousOrders);
          const now = Date.now();
          set({
            previousOrders: mergedPreviousOrders,
            newOrdersCount: 0,
            _orderLookup: newLookup,
            lastHistoryRefreshAt: now,
            _lastRefreshLocationId: locationId,
            // Reset pagination state on refresh
            _currentOffset: mergedPreviousOrders.length,
            _hasMore: fetchedOrders.length === INITIAL_FETCH_SIZE,
            _isLoadingMore: false,
          });
          if (__DEV__)
            console.log(
              `Previous orders refreshed: ${mergedPreviousOrders.length} orders loaded (window: ${dateWindow.label}).`,
            );

          // Bulk-write to MMKV cache for instant boot rendering (today only)
          if (dateWindow.label === "today") {
            const config = resolveBusinessDayConfig();
            if (config) {
              const businessDay = getCurrentBusinessDay(config);
              todayOrdersCache.writeFromRefresh(
                locationId,
                businessDay,
                mergedPreviousOrders,
              );
              todayOrdersCache.evictStale(locationId, businessDay);
            }
          }
        } catch (err) {
          console.error("Error in refreshPreviousOrders:", err);
        } finally {
          refreshPreviousOrdersInFlight = null;
        }
      })();

      await refreshPreviousOrdersInFlight;
    },

    // Check for new orders by fetching latest 10 and comparing IDs
    checkForNewOrders: async () => {
      const client = _supabaseClient;
      if (!client) {
        return 0;
      }

      const locationId = resolveHistoryLocationId();
      if (!locationId) {
        return 0;
      }

      try {
        // Fetch only the latest 10 orders within current date window (lightweight check)
        const { _resolvedStartTs, _resolvedEndTs } =
          get().dateWindow ?? DEFAULT_DATE_WINDOW;
        const { data: latestOrders, error } =
          await OrderService.getHistoryOrders(
            client,
            locationId,
            10,
            null,
            _resolvedStartTs,
            _resolvedEndTs,
          );

        if (error || !latestOrders) {
          return 0;
        }

        const lookup = get()._orderLookup;

        let newCount = 0;
        for (const row of latestOrders) {
          const id = row.id as string;
          if (!id) continue;

          const normalized = normalizeFetchedOrder(row as FetchedOrderData);
          const profile = transformBroadcastToOrder(normalized, undefined);
          const existing = lookup[id];

          if (!existing) {
            const known = get().previousOrders.some(
              (po) => po.db_order_id === id || po.orderId === id,
            );
            if (!known) newCount++;
          } else {
            // Patch if payment status or check status changed
            const newPaymentStatus = _derivePaymentStatus(profile);
            if (
              existing.paymentStatus !== newPaymentStatus ||
              existing.checkStatus !== profile.check_status
            ) {
              get()._handleOrderBroadcast({
                operation: "UPDATE",
                data: { order: normalized },
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        // Update state
        set({ newOrdersCount: newCount });
        return newCount;
      } catch (err) {
        console.error("Error checking for new orders:", err);
        return 0;
      }
    },

    // Clear the new orders counter (called after user taps refresh)
    clearNewOrdersCount: () => {
      set({ newOrdersCount: 0 });
    },

    loadMoreOrders: async () => {
      const { _isLoadingMore, _hasMore, _currentOffset } = get();
      if (_isLoadingMore || !_hasMore) return;

      // Cooldown: prevent onEndReached cascade
      if (Date.now() - _lastLoadMoreCompletedAt < LOAD_MORE_COOLDOWN_MS) return;

      // Block pagination until date bounds are resolved (refresh must complete first)
      const { _resolvedStartTs, _resolvedEndTs } =
        get().dateWindow ?? DEFAULT_DATE_WINDOW;
      if (!_resolvedStartTs || !_resolvedEndTs) {
        if (__DEV__)
          console.log(
            "[loadMoreOrders] Skipped — waiting for date bounds to resolve",
          );
        return;
      }

      const client = _supabaseClient;
      if (!client) return;

      const locationId = resolveHistoryLocationId();
      if (!locationId) return;

      set({ _isLoadingMore: true });

      try {
        const { data, error, hasMore } =
          await OrderService.getHistoryOrdersPaginated(
            client,
            locationId,
            LOAD_MORE_PAGE_SIZE,
            _currentOffset,
            null,
            _resolvedStartTs,
            _resolvedEndTs,
          );

        if (error || !data) {
          console.error("Failed to load more orders:", error);
          return;
        }

        const newOrders = data.map((fo, index) =>
          _transformFetchedOrder(fo as FetchedOrderData, index, data.length),
        );

        // Deduplicate against existing previousOrders
        const existingKeys = new Set<string>();
        for (const po of get().previousOrders) {
          if (po.db_order_id) existingKeys.add(po.db_order_id);
          if (po.orderId) existingKeys.add(po.orderId);
        }

        const uniqueNewOrders = newOrders.filter((o) => {
          const key = o.db_order_id || o.orderId;
          return !existingKeys.has(key);
        });

        if (uniqueNewOrders.length === 0) {
          set({
            _hasMore: hasMore,
            _currentOffset: _currentOffset + data.length,
            _isLoadingMore: false,
          });
          return;
        }

        set((state) => {
          let merged = [...state.previousOrders, ...uniqueNewOrders];

          // Sort by timestamp descending
          merged.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );

          // Safety cap: trim oldest if exceeding limit
          if (merged.length > MAX_IN_MEMORY_PREVIOUS_ORDERS) {
            merged = merged.slice(0, MAX_IN_MEMORY_PREVIOUS_ORDERS);
          }

          return {
            previousOrders: merged,
            _orderLookup: buildOrderLookupMap(merged),
            _currentOffset: _currentOffset + data.length,
            _hasMore: hasMore,
          };
        });
      } catch (err) {
        console.error("Error in loadMoreOrders:", err);
      } finally {
        _lastLoadMoreCompletedAt = Date.now();
        set({ _isLoadingMore: false });
      }
    },

    refundFullOrder: async (
      orderId: string,
      reason: string,
      initiatedByStaffId: string,
      initiatedByName: string,
      paymentMethod: PaymentType,
      metadata?: RefundFraudMetadata,
    ) => {
      const order = get().getOrderById(orderId);
      if (!order || order.refunded) {
        return;
      }

      if (_supabaseClient) {
        const refundService = new RefundService(_supabaseClient);
        const station = useStoreSettingsStore.getState().selectedStation;
        const refundRequest: RefundRequest = {
          orderId,
          refundType: { type: "full_payment" },
          reason: toRefundReasonType(reason),
          reasonDetail: reason,
          initiatedBy: initiatedByStaffId,
          approvedBy: metadata?.approvedByManagerId,
          payment_terminal_id: station?.payment_terminal?.id || "",
          payment_terminal: station?.payment_terminal || undefined,
          stationId: station?.id,
          metadata: metadata?.fraudFlags
            ? {
                fraud_flags: metadata.fraudFlags,
                velocity_count: metadata.velocityCount,
              }
            : undefined,
        };
        const result = await refundService.processRefund(refundRequest);
        if (result.kind === "error") {
          console.error("Refund failed:", result.error);
          return result;
        }
        if (result.kind === "verifying") {
          return result;
        }

        // Audit log for fraud-flagged refunds
        if (metadata?.fraudFlags?.includes("same_cashier_refund")) {
          _supabaseClient
            .from("audit_logs")
            .insert({
              action: "same_cashier_refund",
              action_category: "fraud_detection",
              actor_name: initiatedByName,
              staff_profile_id: initiatedByStaffId,
              resource_type: "order",
              resource_id: orderId,
              severity: metadata.fraudFlags.includes("velocity_blocked")
                ? "high"
                : "medium",
              metadata: {
                fraud_flags: metadata.fraudFlags,
                refund_amount: order.total,
                velocity_count: metadata.velocityCount,
                approved_by: metadata.approvedByManagerId,
                approved_by_name: metadata.approvedByManagerName,
              },
              location_id: useStoreSettingsStore.getState().selectedStore?.id,
              merchant_id:
                useStoreSettingsStore.getState().selectedStore?.merchant_id,
            })
            .then(({ error: auditErr }) => {
              if (auditErr)
                console.warn(
                  "[FraudGuard] audit_logs insert failed:",
                  auditErr,
                );
            });
        }
      }

      const paymentRefundableTotal = (order.payments ?? []).reduce(
        (sum, payment) => sum + (payment.amount ?? 0),
        0,
      );
      const fullRefundAmount = paymentRefundableTotal || order.total;

      const refundRecord: RefundRecord = {
        id: `refund_${Date.now()}`,
        orderId,
        type: "full",
        items: order.items.map((item) => ({
          itemId: item.id,
          quantity: item.quantity,
          reason,
          refundedAt: new Date().toISOString(),
          refundedBy: initiatedByName,
        })),
        totalRefunded: fullRefundAmount,
        reason,
        refundedAt: new Date().toISOString(),
        refundedBy: initiatedByName,
        paymentMethod,
      };

      // Update the order to mark it as refunded
      set((state) => {
        // Capture the updated order during the map pass (avoids redundant .find())
        let updatedOrder: PreviousOrder | undefined;
        const updatedOrders = state.previousOrders.map((o) => {
          if (o.orderId === orderId) {
            updatedOrder = {
              ...o,
              refunded: true,
              refundedAmount: fullRefundAmount,
              paymentStatus: "Refunded" as const,
            };
            return updatedOrder;
          }
          return o;
        });
        const newLookup = { ...state._orderLookup };
        if (updatedOrder) {
          newLookup[updatedOrder.db_order_id || updatedOrder.orderId] =
            updatedOrder;
        }
        return {
          refunds: [...state.refunds, refundRecord],
          previousOrders: updatedOrders,
          _orderLookup: newLookup,
        };
      });
    },

    refundItems: async (
      orderId: string,
      itemsToRefund: Array<{
        itemId: string;
        quantity: number;
        reason: string;
      }>,
      initiatedByStaffId: string,
      initiatedByName: string,
      paymentMethod: PaymentType,
      metadata?: RefundFraudMetadata,
    ) => {
      const order = get().previousOrders.find((o) => o.orderId === orderId);
      if (!order) {
        console.error("Refund failed: Order not found");
        return;
      }

      let totalRefundedInThisTx = 0;
      const refundItemsForRecord: RefundItem[] = [];

      // --- THIS IS THE CORRECTED LOGIC ---

      // 1. Calculate the total refund amount for this transaction
      // and prepare the items for the refund record.
      itemsToRefund.forEach(({ itemId, quantity, reason }) => {
        const item = order.items.find((i) => i.id === itemId);
        // Ensure we are refunding a valid item and a valid quantity
        const maxRefundable =
          (item?.quantity || 0) - (item?.refundedQuantity || 0);
        if (item && quantity > 0 && quantity <= maxRefundable) {
          totalRefundedInThisTx += item.price * quantity;
          refundItemsForRecord.push({
            itemId,
            quantity,
            reason,
            refundedAt: new Date().toISOString(),
            refundedBy: initiatedByName,
          });
        }
      });

      if (refundItemsForRecord.length === 0) {
        console.error("Refund failed: No valid items to refund.");
        return;
      }

      if (_supabaseClient) {
        const refundService = new RefundService(_supabaseClient);
        const station = useStoreSettingsStore.getState().selectedStation;
        const refundRequest: RefundRequest = {
          orderId,
          refundType: {
            type: "item_return",
            items: itemsToRefund.map((item) => ({
              orderItemId: item.itemId,
              quantityToRefund: item.quantity,
              reason: toRefundReasonType(item.reason),
              reasonDetail: item.reason,
            })),
          },
          reason: toRefundReasonType(
            itemsToRefund.map((i) => i.reason).find(Boolean) || "other",
          ),
          reasonDetail: itemsToRefund.map((i) => i.reason).join(", "),
          initiatedBy: initiatedByStaffId,
          approvedBy: metadata?.approvedByManagerId,
          payment_terminal_id: station?.payment_terminal?.id || "",
          payment_terminal: station?.payment_terminal || undefined,
          stationId: station?.id,
          metadata: metadata?.fraudFlags
            ? {
                fraud_flags: metadata.fraudFlags,
                velocity_count: metadata.velocityCount,
              }
            : undefined,
        };
        const result = await refundService.processRefund(refundRequest);
        if (result.kind === "error") {
          console.error("Refund failed:", result.error);
          return result;
        }
        if (result.kind === "verifying") {
          return result;
        }

        // Audit log for fraud-flagged refunds
        if (metadata?.fraudFlags?.includes("same_cashier_refund")) {
          _supabaseClient
            .from("audit_logs")
            .insert({
              action: "same_cashier_refund",
              action_category: "fraud_detection",
              actor_name: initiatedByName,
              staff_profile_id: initiatedByStaffId,
              resource_type: "order",
              resource_id: orderId,
              severity: metadata.fraudFlags.includes("velocity_blocked")
                ? "high"
                : "medium",
              metadata: {
                fraud_flags: metadata.fraudFlags,
                refund_amount: totalRefundedInThisTx,
                velocity_count: metadata.velocityCount,
                approved_by: metadata.approvedByManagerId,
                approved_by_name: metadata.approvedByManagerName,
              },
              location_id: useStoreSettingsStore.getState().selectedStore?.id,
              merchant_id:
                useStoreSettingsStore.getState().selectedStore?.merchant_id,
            })
            .then(({ error: auditErr }) => {
              if (auditErr)
                console.warn(
                  "[FraudGuard] audit_logs insert failed:",
                  auditErr,
                );
            });
        }
      }

      // 2. Create the new refund record object
      const newRefundRecord: RefundRecord = {
        id: `refund_${Date.now()}`,
        orderId,
        type: "partial",
        items: refundItemsForRecord,
        totalRefunded: totalRefundedInThisTx,
        reason: itemsToRefund
          .map((i) => i.reason)
          .filter(Boolean)
          .join(", "),
        refundedAt: new Date().toISOString(),
        refundedBy: initiatedByName,
        paymentMethod,
      };

      // 3. Update the state in a single `set` call
      set((state) => {
        // Capture updated order during map pass (avoids redundant .find())
        let updatedRefundOrder: PreviousOrder | undefined;
        const updatedPreviousOrders = state.previousOrders.map((o) => {
          if (o.orderId === orderId) {
            // Update the refunded quantities on the original order's items
            const updatedItems = o.items.map((originalItem) => {
              const refundInfo = itemsToRefund.find(
                (ri) => ri.itemId === originalItem.id,
              );
              if (refundInfo) {
                return {
                  ...originalItem,
                  refundedQuantity:
                    (originalItem.refundedQuantity || 0) + refundInfo.quantity,
                };
              }
              return originalItem;
            });

            const newTotalRefundedAmount =
              (o.refundedAmount || 0) + totalRefundedInThisTx;
            const paymentRefundState = derivePaymentRefundState(o.payments);
            const paymentRefundableTotal = (o.payments ?? []).reduce(
              (sum, payment) => sum + (payment.amount ?? 0),
              0,
            );
            const refundComparisonTotal = paymentRefundableTotal || o.total;
            const isFullyRefunded =
              paymentRefundState.isFullyRefunded ||
              newTotalRefundedAmount >= refundComparisonTotal - 0.001;

            updatedRefundOrder = {
              ...o,
              items: updatedItems,
              refunded: true,
              refundedAmount: newTotalRefundedAmount,
              paymentStatus: isFullyRefunded
                ? ("Refunded" as const)
                : ("Partially Refunded" as const),
            };
            return updatedRefundOrder;
          }
          return o;
        });

        return {
          previousOrders: updatedPreviousOrders,
          refunds: [...state.refunds, newRefundRecord],
          _orderLookup: buildOrderLookupMap(updatedPreviousOrders),
        };
      });
    },

    getRefundsForOrder: (orderId: string) => {
      return get().refunds.filter((refund) => refund.orderId === orderId);
    },

    _handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
      const { operation, data } = payload;
      if (!data?.order) return;

      const broadcastOrder = data.order;
      const dbOrderId = broadcastOrder.id;
      if (!dbOrderId) return;

      const lookup = get()._orderLookup;
      const existing = lookup[dbOrderId];

      if (operation === "DELETE") {
        // Not removing from history on soft delete — orders stay for audit trail
        return;
      }

      const normalized = normalizeFetchedOrder(
        broadcastOrder as unknown as FetchedOrderData,
      );
      const profile = transformBroadcastToOrder(normalized, undefined);

      if (existing) {
        get().patchPreviousOrder(existing.db_order_id || existing.orderId, {
          paymentStatus: _derivePaymentStatus(profile),
          refunded:
            profile.paid_status === "Refunded" ||
            (profile.order_status === "refunded" &&
              profile.paid_status !== "Paid") ||
            ((profile.payments || []).some(
              (p) => p.isVoided === true || p.status === "voided",
            ) &&
              !(profile.payments || []).some(
                (p) => !p.isVoided && p.status === "captured",
              )),
          amount_paid: profile.amount_paid ?? existing.amount_paid,
          amount_due: profile.amount_due ?? existing.amount_due,
          cash_amount_due: profile.cash_amount_due ?? existing.cash_amount_due,
          payments:
            (profile.payments?.length ?? 0) > 0
              ? profile.payments
              : existing.payments,
          checkStatus: profile.check_status || existing.checkStatus,
        });
      } else if (_isFinalState(profile)) {
        get().addOrderToHistory(profile);
      }
    },

    patchPreviousOrder: (orderId: string, patch: Partial<PreviousOrder>) => {
      set((state) => {
        // Find by db_order_id key first, then by orderId field
        let lookupKey: string | undefined;
        if (state._orderLookup[orderId]) {
          lookupKey = orderId;
        } else {
          for (const [key, order] of Object.entries(state._orderLookup)) {
            if (order.orderId === orderId || order.db_order_id === orderId) {
              lookupKey = key;
              break;
            }
          }
        }
        if (!lookupKey) return {};

        const existing = state._orderLookup[lookupKey];
        const updated = { ...existing, ...patch };
        const previousOrders = state.previousOrders.map((po) =>
          po.orderId === existing.orderId ? updated : po,
        );
        return {
          previousOrders,
          _orderLookup: buildOrderLookupMap(previousOrders),
        };
      });
    },
  }),
);
