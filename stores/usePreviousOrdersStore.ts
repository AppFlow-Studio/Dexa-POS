import type { OrderBroadcastPayload } from "@/hooks/realtime/useOrdersRealtime";
import {
    getBusinessDayBounds,
    getBusinessDayForTimestamp,
    getCurrentBusinessDay,
    type BusinessDayConfig,
} from "@/lib/businessDay";
import {
    getCachedWindowBounds,
    setCachedWindowBounds,
} from "@/lib/businessDayCache";
import { onDeltaNudge } from "@/lib/db/deltaNudge";
import {
    getOrdersMirrorState,
    isOrdersMirrorFresh,
    queryLocalHistoryPage,
    queryLocalHistorySummaries,
    type SqlValue,
} from "@/lib/db/historyQuery";
import { isLocalDbReady } from "@/lib/db/index";
import {
    resolveFetchedOrderPlatform,
    type OnlineOrderJoinRow,
} from "@/lib/fetchedOrderPlatform";
import { DEADLINES } from "@/lib/network/deadlines";
import { withDeadline } from "@/lib/network/withDeadline";
import { isOnlineOrderSource } from "@/lib/orderSource";
import {
    derivePaymentRefundState,
    derivePreviousOrderPaymentStatus,
} from "@/lib/paymentStatus";
import { applyRefundRecovery } from "@/lib/refundRecovery";
import { OrderProfile, PaymentType, PreviousOrder } from "@/lib/types";
import {
    DEFAULT_HISTORY_FILTERS,
    historyFilterKey,
    historyPageCount,
    isDefaultHistoryFilters,
    type HistoryOrderFilters,
} from "@/services/historyOrderFilters";
import {
    OrderService,
    type HistoryOrderSummary,
} from "@/services/orderService";
import { RefundService } from "@/services/refundService";
import {
    isCacheFresh,
    previousOrdersOfflineCache,
} from "@/stores/previousOrdersOfflineCache";
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

function resolvePreviousOrderTableName(
  tableIdOrName?: string | null,
  tableName?: string | null,
): string | undefined {
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (tableName?.trim() && !uuidLike.test(tableName.trim())) return tableName;
  if (!tableIdOrName) return undefined;
  return (
    useFloorPlanStore.getState().tablesById[tableIdOrName]?.name ??
    (tableName
      ? useFloorPlanStore.getState().tablesById[tableName]?.name
      : null) ??
    tableIdOrName
  );
}

/** Resolve the BusinessDayConfig from the current location settings. */
export function resolveBusinessDayConfig(): BusinessDayConfig | null {
  const store = useStoreSettingsStore.getState().selectedStore;
  if (!store?.timezone) return null;
  return {
    timezone: store.timezone,
    rolloverHour: store.business_day_start_hour ?? 0,
  };
}

/**
 * Synchronously resolve business-day bounds for a date window using the local
 * Luxon config — no network. Used by `setDateWindow` to populate
 * `_resolvedStartTs/_endTs` immediately on a pill tap, so the live-orders date
 * gate (which reads these bounds) never sees a null window between the tap and
 * the authoritative RPC refresh. The RPC overwrites these with server bounds.
 * Returns null when no business-day config is available (pre-login).
 */
function resolveLocalBounds(window: {
  startDate: string | null;
  endDate: string | null;
  label: DateWindowLabel;
}): { startTs: string; endTs: string } | null {
  const config = resolveBusinessDayConfig();
  if (!config) return null;
  try {
    if (window.label === "today" || !window.startDate) {
      const day = getCurrentBusinessDay(config);
      const b = getBusinessDayBounds(day, config);
      return { startTs: b.startUtc, endTs: b.endUtc };
    }
    const startB = getBusinessDayBounds(window.startDate, config);
    const endTs = window.endDate
      ? getBusinessDayBounds(window.endDate, config).endUtc
      : startB.endUtc;
    return { startTs: startB.startUtc, endTs };
  } catch {
    return null;
  }
}

/** `${label}|${startDate}|${endDate}` — the cache key for a date window. */
function windowKeyOf(window: {
  label: DateWindowLabel;
  startDate: string | null;
  endDate: string | null;
}): string {
  return `${window.label}|${window.startDate ?? ""}|${window.endDate ?? ""}`;
}

/**
 * Resolve the business-day window for the current date pill, cheapest first:
 *
 *   1. in-memory (`_resolvedStartTs/_resolvedEndTs` already on the store's
 *      dateWindow)
 *   2. persisted MMKV cache (same business day)
 *   3. server RPC (authoritative timezone/rollover) when online
 *   4. local Luxon (offline / no config)
 *
 * and persist the result to MMKV so a later session reuses it instead of
 * fetching the "time" again. The window only changes at the daily rollover,
 * so a session typically resolves it zero or one times, never per refresh.
 */
async function resolveWindowBounds(opts: {
  dw0: DateWindow;
  locationId: string;
  client: SupabaseClient | null;
  online: boolean;
}): Promise<{ startTs: string | null; endTs: string | null }> {
  const { dw0 } = opts;
  if (dw0._resolvedStartTs && dw0._resolvedEndTs) {
    return { startTs: dw0._resolvedStartTs, endTs: dw0._resolvedEndTs };
  }

  const windowKey = windowKeyOf(dw0);
  const config = resolveBusinessDayConfig();
  const cached = config
    ? getCachedWindowBounds(windowKey, (resolvedAt) => {
        try {
          return (
            getBusinessDayForTimestamp(resolvedAt, config) ===
            getCurrentBusinessDay(config)
          );
        } catch {
          return false;
        }
      })
    : null;
  if (cached) return cached;

  if (opts.online && opts.client) {
    try {
      const bounds = await OrderService.getBusinessDayBounds(
        opts.client,
        opts.locationId,
        dw0.startDate,
        dw0.endDate,
      );
      if (bounds) {
        setCachedWindowBounds(windowKey, bounds.start_ts, bounds.end_ts);
        return { startTs: bounds.start_ts, endTs: bounds.end_ts };
      }
    } catch {
      // fall through to the Luxon fallback below
    }
  }

  const localBounds = resolveLocalBounds(dw0);
  if (localBounds) {
    setCachedWindowBounds(windowKey, localBounds.startTs, localBounds.endTs);
    return localBounds;
  }
  return { startTs: null, endTs: null };
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

/**
 * An "empty draft" shell: a still-open order with no line items and a zero
 * total. These are created when a station opens an order (which assigns a
 * display number) but never adds any items — common with cross-station order
 * creation, where another terminal's abandoned draft surfaces here because the
 * history fetch is location-scoped, not station-scoped. They carry no business
 * meaning and only clutter the Previous Orders list (rendering as
 * "$0.00 / Awaiting Payment"), so they're filtered out of the history feed
 * entirely. They reappear the moment items are added — a subsequent fetch or
 * broadcast carries a non-empty payload and this guard no longer matches.
 *
 * Conservative on purpose: requires BOTH zero items AND a zero total, and only
 * applies to non-final orders, so a fully-voided-items order (non-zero stored
 * total) or any paid/closed/refunded historical order is never hidden.
 */
/**
 * Newest `updated_at` across a fetched page, for the cache signature.
 * Returns null when the rows carry no `updated_at` (e.g. a projection that
 * omits it), which `isCacheFresh` treats as unknown → stale.
 */
function latestUpdatedAtOf(
  rows: { updated_at?: string | null }[],
): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    const value = row?.updated_at;
    if (typeof value === "string" && (latest === null || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

/**
 * Belt-and-suspenders twin of `EMPTY_DRAFT_EXCLUSION_OR` in
 * services/historyOrderFilters.ts. The server query excludes these rows before
 * the exact count is taken (so "N of M" stays honest); this catches rows that
 * arrive by paths that bypass that query — broadcasts and the offline cache.
 * Keep the two predicates in step.
 */
function isEmptyDraftOrder(po: PreviousOrder): boolean {
  return (
    (po.items?.length ?? 0) === 0 &&
    (po.total ?? 0) === 0 &&
    !po.voided &&
    !po.refunded &&
    !po.closed_at &&
    po.paymentStatus !== "Paid"
  );
}

const HISTORY_REFRESH_COALESCE_MS = 4000;
const SET_DATE_WINDOW_DEBOUNCE_MS = 200;
let refreshPreviousOrdersInFlight: Promise<void> | null = null;
let _setDateWindowDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Trailing-edge debounce wrapper around `refreshPreviousOrders`. Used by
 * `setDateWindow` so rapid pill taps don't fire multiple RPC + fetch passes.
 * Module-level (not store-level) so the timer survives `set()` calls and a
 * single in-flight timer is shared across all callers.
 */
const _scheduleDebouncedRefresh = () => {
  if (_setDateWindowDebounceTimer) clearTimeout(_setDateWindowDebounceTimer);
  _setDateWindowDebounceTimer = setTimeout(() => {
    _setDateWindowDebounceTimer = null;
    // Deliberately NO force: a tab/date switch must not force a server round
    // trip. The local mirror answers when it's fresh; only pull-to-refresh
    // passes force so the merchant can always force a fresh fetch.
    void usePreviousOrdersStore.getState().refreshPreviousOrders();
  }, SET_DATE_WINDOW_DEBOUNCE_MS);
};

let _ownEchoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const OWN_ECHO_REFRESH_DEBOUNCE_MS = 800;

/**
 * Trailing-edge debounced, NON-forced Previous Orders refresh for the fan-out
 * layer. Called when an own-station broadcast echo is suppressed — the
 * in-memory list's broadcast patch is skipped for those, so a void / close /
 * reopen / payment initiated from the Previous Orders screen would otherwise
 * never reach the visible row. The refresh re-reads the mirror and (when the
 * backend moved) the server, converging the row without a manual
 * pull-to-refresh.
 *
 * No-ops unless a Previous Orders list surface is mounted, so ordering bursts
 * on the order screen never trigger background refreshes.
 */
export const schedulePreviousOrdersRefresh = () => {
  if (!usePreviousOrdersStore.getState()._isListMounted) return;
  if (_ownEchoRefreshTimer) clearTimeout(_ownEchoRefreshTimer);
  _ownEchoRefreshTimer = setTimeout(() => {
    _ownEchoRefreshTimer = null;
    void usePreviousOrdersStore.getState().refreshPreviousOrders();
  }, OWN_ECHO_REFRESH_DEBOUNCE_MS);
};

// Global client reference
let _supabaseClient: SupabaseClient | null = null;
export const setPreviousOrdersSupabaseClient = (
  client: SupabaseClient | null,
) => {
  _supabaseClient = client;
};

/**
 * Raw NetInfo-based online status. Lazily required to avoid a static import
 * cycle (offlineSyncService imports stores). Defaults to online if the service
 * isn't wired yet, so we never wrongly suppress a fetch.
 */
function isDeviceOnline(): boolean {
  try {
    const { getRawIsOnline } = require("@/services/offlineSyncService");
    return getRawIsOnline();
  } catch {
    return true;
  }
}

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
/**
 * Rows per page. The list shows exactly one page at a time and the merchant
 * steps between pages, so this is a hard page size rather than an initial
 * fetch that grows.
 */
export const HISTORY_PAGE_SIZE = 50;

/**
 * Phase 3 — when set, Previous Orders resolves its page from the local mirror
 * first (zero round trips + offline paging), then lets the server correct when
 * online. Off: today's server-only path, unchanged.
 */
const LOCAL_PREVIOUS_ORDERS_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_PREVIOUS_ORDERS === "1";

/** Where the currently displayed page came from. Drives the scope line. */
export type HistoryDataSource = "server" | "local" | "offline-local";

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
  /** Where the displayed page came from — "server" | "local" | "offline-local". */
  _source: HistoryDataSource;
  /**
   * `created_at` of the oldest order this device still holds locally, from the
   * mirror's `retention_floor`. The honest bound for the offline scope line:
   * how far back we can answer, not how many rows matched. Null when unknown.
   */
  _scopeFloor: string | null;
  refunds: RefundRecord[];
  _orderLookup: Record<string, PreviousOrder>;
  /** Successful refresh timestamp (for coalescing with bootstrap + tab mount) */
  lastHistoryRefreshAt: number | null;
  /** Location id used for last successful refresh (invalidates throttle on store switch) */
  _lastRefreshLocationId: string | null;

  // Date window for business-day-aware filtering
  dateWindow: DateWindow;

  /** True while a full refresh (initial fetch or filter switch) is in flight.
   *  Screens show a loading state when this is true and the list is empty. */
  _isRefreshing: boolean;

  // Pagination state
  _currentOffset: number; // Legacy offset cursor — kept for compat with refresh accounting
  _hasMore: boolean;
  _isLoadingMore: boolean;
  // Keyset cursor: `created_at` of the oldest order currently loaded. loadMore
  // requests rows older than this — constant-time vs offset-based skip.
  _oldestCursor: string | null;

  /**
   * Discriminator-only projection of every order in the current date window
   * matching the active search + status, independent of channel/provider.
   * Drives the tab and chip counts, which must describe the whole window rather
   * than the pages loaded so far.
   * Null until the first summary fetch resolves.
   */
  windowSummaries: HistoryOrderSummary[] | null;
  /** True when the window exceeded the summary row cap and counts under-report. */
  windowSummariesTruncated: boolean;

  /**
   * Server-side filter/sort state. `previousOrders` holds exactly the rows the
   * SERVER matched for these filters — the screen renders it as-is and does no
   * filtering, sorting or searching of its own. That's what makes the sort
   * cover the whole window and the "N of M" count trustworthy.
   */
  filters: HistoryOrderFilters;
  /**
   * `historyFilterKey` of the filters the loaded page belongs to. Guards
   * against a slow response for filter set A landing after the user switched
   * to B and replacing B's page with A's rows.
   */
  _loadedFilterKey: string;
  /** Exact server count for the active filters + window. Null until it lands. */
  totalMatchingCount: number | null;
  setFilters: (patch: Partial<HistoryOrderFilters>) => void;

  // ── Discrete pagination ──
  // `previousOrders` holds ONE page, not an accumulating list. Page N is
  // fetched independently so the merchant can step forward and back.
  /** Zero-based index of the page currently in `previousOrders`. */
  pageIndex: number;
  /** Total pages for the active filters, derived from `totalMatchingCount`. */
  pageCount: number;
  /** True while a page navigation is in flight. */
  _isPageLoading: boolean;
  goToPage: (pageIndex: number) => Promise<void>;

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
  /** True while a Previous Orders list surface (screen or section) is mounted.
   *  Gates background refreshes so they only run when a list is on screen. */
  _isListMounted: boolean;
  setListMounted: (mounted: boolean) => void;
}

/** Transform a fetched DB order row into a PreviousOrder. */
function _transformFetchedOrder(
  fo: FetchedOrderData,
  index: number,
  totalCount: number,
): PreviousOrder {
  const broadcastData = normalizeFetchedOrder(fo);

  // Online-ness and marketplace identity — see lib/fetchedOrderPlatform.ts for
  // why the join alone can't answer either question.
  const { isOnlineOrder, deliveryPlatform: _deliveryPlatform } =
    resolveFetchedOrderPlatform(
      fo as any,
      (fo as any).online_orders as OnlineOrderJoinRow[] | undefined,
    );

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
    paymentStatus: derivePreviousOrderPaymentStatus(profile),
    customer: profile.customer_name || "Walk-In Customer",
    customer_phone: profile.customer_phone ?? null,
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
    total_cash_amount: profile.total_cash_amount ?? profile.total_amount ?? 0,
    tax: profile.total_tax || 0,
    service_charge: profile.service_charge ?? 0,
    service_charge_name: profile.service_charge_name ?? null,
    service_charge_rate: profile.service_charge_rate ?? null,
    service_charge_is_taxable: profile.service_charge_is_taxable ?? null,
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
    service_location_name: resolvePreviousOrderTableName(
      profile.service_location_id,
      profile.service_location_name,
    ),
    station_id: profile.station_id,
    station_name: profile._sourceStationName || undefined,
    checkStatus: profile.check_status || "Opened",
    db_order_id: profile.db_order_id,
    order_source: profile.order_source ?? null,
    delivery_platform: _deliveryPlatform ?? profile.delivery_platform ?? null,
    platform_order_number: profile.platform_order_number ?? null,
    reversals: profile.reversals,
    order_refund_items: profile.order_refund_items,
    created_by_staff_profile_id: profile.created_by_staff_profile_id ?? null,
    _isOnlineOrder: isOnlineOrder,
  };
}

/** Rebuild a FetchedOrderData from mirror rows — payloads are verbatim server JSON. */
function mirrorRowToFetchedOrder(
  row: Record<string, SqlValue>,
  items: Record<string, SqlValue>[],
  payments: Record<string, SqlValue>[],
): FetchedOrderData {
  const header = safeJsonObject(row.payload);
  return {
    ...header,
    order_items: items.map((it) => safeJsonObject(it.payload)),
    order_payments: payments.map((p) => safeJsonObject(p.payload)),
  } as unknown as FetchedOrderData;
}

function safeJsonObject(value: SqlValue | undefined): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Phase 3 — resolve one page of Previous Orders from the local mirror, through
 * the SAME transform as the server path (zero render divergence). Returns null
 * when the local DB is unavailable → caller falls back to the server.
 */
async function resolveLocalHistoryPage(opts: {
  locationId: string;
  filters: HistoryOrderFilters;
  startTs: string | null;
  endTs: string | null;
  pageIndex: number;
  pageSize: number;
}): Promise<{ pageOrders: PreviousOrder[]; totalCount: number } | null> {
  if (!isLocalDbReady()) return null;
  const result = await queryLocalHistoryPage(opts);
  if (!result) return null;

  const pageOrders = result.orders
    .map((row, index) =>
      _transformFetchedOrder(
        mirrorRowToFetchedOrder(
          row,
          result.itemsByOrder[row.id as string] ?? [],
          result.paymentsByOrder[row.id as string] ?? [],
        ),
        index,
        result.orders.length,
      ),
    )
    .filter((po) => !isEmptyDraftOrder(po));

  if (__DEV__) {
    console.log(
      `[PreviousOrders][local] page ${opts.pageIndex}: ${pageOrders.length} rows, total ${result.totalCount}`,
    );
  }

  return { pageOrders, totalCount: result.totalCount };
}

/**
 * Phase 3 — resolve the window-wide tab/chip counts from the local mirror.
 * Same discriminator projection as the server summary fetch (channel/provider
 * forced to "all"), so counts are instant and correct offline. Returns null
 * when the local DB is unavailable → caller keeps the server summary path.
 */
async function resolveLocalHistorySummaries(opts: {
  locationId: string;
  filters: HistoryOrderFilters;
  startTs: string | null;
  endTs: string | null;
}): Promise<{ rows: HistoryOrderSummary[]; truncated: boolean } | null> {
  if (!isLocalDbReady()) return null;
  return queryLocalHistorySummaries(opts);
}

/**
 * Phase 3 — is the mirror provably current for this window RIGHT NOW?
 *
 * Two gates, cheapest first: the mirror must be fresh and cover the window
 * (`isOrdersMirrorFresh`, zero network), and the backend must not have moved
 * since the last server fetch (the count + newest-`updated_at` signature probe,
 * one tiny request). Freshness alone is not proof — the mirror can lag by a
 * delta cycle or a dropped broadcast.
 *
 * The probe result is cached for `MIRROR_TRUST_TTL_MS`, comfortably under the
 * 30 s delta cycle, so a merchant paging through a filtered result set pays for
 * at most one probe rather than one per page turn. That cache is what makes
 * filtered paging as close to zero-network as the default page.
 */
const MIRROR_TRUST_TTL_MS = 15_000;
let _mirrorTrust: {
  locationId: string;
  windowLabel: string;
  until: number;
} | null = null;

export function __resetMirrorTrustForTests(): void {
  _mirrorTrust = null;
}

async function canTrustMirror(opts: {
  client: SupabaseClient | null;
  locationId: string;
  windowLabel: string;
  startTs: string;
  endTs: string;
}): Promise<boolean> {
  const { client, locationId, windowLabel, startTs, endTs } = opts;
  if (!client) return false;
  if (!(await isOrdersMirrorFresh(locationId, startTs))) return false;

  if (
    _mirrorTrust &&
    _mirrorTrust.locationId === locationId &&
    _mirrorTrust.windowLabel === windowLabel &&
    _mirrorTrust.until > Date.now()
  ) {
    return true;
  }

  const cachedSig = previousOrdersOfflineCache.getSignature(locationId);
  // No signature to compare against — we cannot prove the backend hasn't
  // moved, so we don't claim it hasn't.
  if (!cachedSig || cachedSig.windowLabel !== windowLabel) return false;

  try {
    const live = await withDeadline(
      (signal) =>
        OrderService.getHistoryWindowSignature(
          client,
          locationId,
          startTs,
          endTs,
          signal,
        ),
      DEADLINES.read,
      "getHistoryWindowSignature",
    );
    if (live.error || !isCacheFresh(cachedSig, live, windowLabel)) return false;
  } catch {
    // Probe failed — don't trust the mirror blindly.
    return false;
  }

  _mirrorTrust = {
    locationId,
    windowLabel,
    until: Date.now() + MIRROR_TRUST_TTL_MS,
  };
  return true;
}

/**
 * Drop the cached "backend hasn't moved" verdict. Called wherever we learn the
 * backend HAS moved (a fresh server fetch, a realtime-driven refresh, an
 * explicit pull-to-refresh), so the next trust check probes again instead of
 * riding a verdict we already know is stale.
 */
function invalidateMirrorTrust(): void {
  _mirrorTrust = null;
}

// A broadcast means the backend moved, which is precisely what the cached
// verdict claims it hasn't. Dropping it here — at module scope, once — is what
// keeps a just-created order from being hidden behind a verdict issued
// seconds before it existed.
onDeltaNudge(invalidateMirrorTrust);

export const usePreviousOrdersStore = create<PreviousOrdersState>(
  (set, get) => ({
    previousOrders: [],
    _source: "server",
    _scopeFloor: null,
    refunds: [],
    _orderLookup: {},
    lastHistoryRefreshAt: null,
    _lastRefreshLocationId: null,
    dateWindow: { ...DEFAULT_DATE_WINDOW },
    _isRefreshing: false,
    _currentOffset: 0,
    _hasMore: false,
    _isLoadingMore: false,
    _oldestCursor: null,
    windowSummaries: null,
    windowSummariesTruncated: false,
    filters: { ...DEFAULT_HISTORY_FILTERS },
    _loadedFilterKey: historyFilterKey(DEFAULT_HISTORY_FILTERS),
    totalMatchingCount: null,
    pageIndex: 0,
    pageCount: 0,
    _isPageLoading: false,
    _isListMounted: false,

    /**
     * Load a specific page of the current filter set.
     *
     * Each page is an independent query, so this serves Next, Previous and any
     * direct jump identically. The previous page stays on screen until the new
     * one arrives (`_isPageLoading` drives an overlay rather than clearing the
     * list), so stepping through pages doesn't flash empty.
     */
    goToPage: async (pageIndex: number) => {
      const state = get();
      if (state._isPageLoading) return;

      const target = Math.max(0, pageIndex);
      // pageCount is 0 before the first count lands; allow page 0 regardless.
      if (state.pageCount > 0 && target >= state.pageCount) return;

      const locationId = resolveHistoryLocationId();
      if (!locationId) return;

      const { _resolvedStartTs, _resolvedEndTs } =
        state.dateWindow ?? DEFAULT_DATE_WINDOW;
      if (!_resolvedStartTs || !_resolvedEndTs) return;

      const activeFilters = state.filters;
      const activeFilterKey = historyFilterKey(activeFilters);

      // The page is an independent query under the filters/window captured
      // above. If the user switches a filter or date while the query is in
      // flight, the result belongs to the OLD view and must be discarded —
      // otherwise the stale page re-applies its old pageIndex (e.g. "page 2"
      // of a result set that only has 1 page) under the new filter.
      const stillCurrent = () =>
        historyFilterKey(get().filters) === activeFilterKey &&
        get().dateWindow?._resolvedStartTs === _resolvedStartTs &&
        get().dateWindow?._resolvedEndTs === _resolvedEndTs;

      // Always raise the loading overlay for a page turn — even when the local
      // mirror answers in a few ms, the switch must never look like a silent
      // no-op. Cleared in `finally` on every path.
      set({ _isPageLoading: true });
      try {
        // ── Phase 3: local-first resolution (flag-gated) ───────────
        const online = isDeviceOnline();
        const local = LOCAL_PREVIOUS_ORDERS_ENABLED
          ? await resolveLocalHistoryPage({
              locationId,
              filters: activeFilters,
              startTs: _resolvedStartTs,
              endTs: _resolvedEndTs,
              pageIndex: target,
              pageSize: HISTORY_PAGE_SIZE,
            })
          : null;

        if (local && stillCurrent()) {
          set({
            previousOrders: local.pageOrders,
            _orderLookup: buildOrderLookupMap(local.pageOrders),
            pageIndex: target,
            _loadedFilterKey: activeFilterKey,
            totalMatchingCount: local.totalCount,
            pageCount: historyPageCount(local.totalCount, HISTORY_PAGE_SIZE),
            _source: online ? "local" : "offline-local",
          });
        }

        // Resolution rule:
        //  - default paging → local only (zero round trips); server only when
        //    the request steps past the local window.
        //  - filtered / searched → local paints instantly, then the server
        //    corrects UNLESS the mirror is provably current (see below).
        //  - offline → local stands.
        const beyondLocalWindow =
          !local ||
          target >= historyPageCount(local.totalCount, HISTORY_PAGE_SIZE);
        // Offline gates the whole thing off, same as refreshPreviousOrders:
        // there's no network to correct from, so the local page stands even
        // when it's stale, empty, or past the mirror's window. Without this
        // gate, `!online` used to be OR'd in as its own reason to want the
        // server — which did the opposite of "offline → local stands" below:
        // it forced a round trip that had no network to complete on, so the
        // await never resolved and `_isPageLoading` stayed true (dim overlay
        // stuck) even though the local rows had already painted.
        let wantsServer =
          online &&
          (!LOCAL_PREVIOUS_ORDERS_ENABLED ||
            !local ||
            !isDefaultHistoryFilters(activeFilters) ||
            beyondLocalWindow);

        const client = _supabaseClient;

        // A filtered page used to cost a round trip EVERY page turn, even
        // though `refresh()` already knows how to prove the mirror is current.
        // Same proof, same probe (cached for one delta cycle): when the mirror
        // is fresh, covers the window, and the backend signature hasn't moved,
        // the local result IS the server result — so paging a search is as
        // cheap as paging the default view. Anything that reaches past the
        // retained window still goes to the server; that is the correctness
        // boundary and it does not move.
        if (
          wantsServer &&
          LOCAL_PREVIOUS_ORDERS_ENABLED &&
          local &&
          online &&
          !beyondLocalWindow &&
          (await canTrustMirror({
            client,
            locationId,
            windowLabel: (get().dateWindow ?? DEFAULT_DATE_WINDOW).label,
            startTs: _resolvedStartTs,
            endTs: _resolvedEndTs,
          }))
        ) {
          wantsServer = false;
        }

        if (!wantsServer) return;

        if (!client) return;
        if (!stillCurrent()) return; // the user moved on during the local query

        // NetInfo says reachable, but reachable isn't fast — bound the round
        // trip so a degraded connection can't hang the page-turn overlay
        // forever. A DeadlineExceededError propagates to goToPage's outer
        // catch, which logs and falls through to `finally` — same outcome as
        // a normal fetch error: the already-painted local page just stands.
        const { data, error, totalCount } = await withDeadline(
          (signal) =>
            OrderService.getFilteredHistoryPage(client, {
              locationId,
              filters: activeFilters,
              limit: HISTORY_PAGE_SIZE,
              offset: target * HISTORY_PAGE_SIZE,
              startTs: _resolvedStartTs,
              endTs: _resolvedEndTs,
              // Re-count on page moves: a refund or void elsewhere can change the
              // total while the merchant is paging, and a stale total would let
              // them step past the end.
              withCount: true,
              signal,
            }),
          DEADLINES.read,
          "getFilteredHistoryPage",
        );

        if (error || !data) {
          console.error("[PreviousOrders] page fetch failed:", error);
          return;
        }
        // Discard a page whose filters/window the user already moved on from.
        if (!stillCurrent()) return;

        const pageOrders = data
          .map((fo, index) =>
            _transformFetchedOrder(fo as FetchedOrderData, index, data.length),
          )
          .filter((po) => !isEmptyDraftOrder(po));

        set({
          previousOrders: pageOrders,
          _orderLookup: buildOrderLookupMap(pageOrders),
          pageIndex: target,
          _loadedFilterKey: activeFilterKey,
          _source: "server",
          ...(totalCount != null
            ? {
                totalMatchingCount: totalCount,
                pageCount: historyPageCount(totalCount, HISTORY_PAGE_SIZE),
              }
            : {}),
        });
      } catch (err) {
        console.error("[PreviousOrders] page fetch threw:", err);
      } finally {
        set({ _isPageLoading: false });
      }
    },

    /**
     * Change one or more filters. Because the server owns the result set, any
     * change invalidates the loaded pages AND the cursor — page 2 of the old
     * filter must never be appended to page 1 of the new one. Clearing here and
     * refetching is what keeps that impossible by construction.
     *
     * No-ops when the filter set is unchanged, so a component re-render that
     * re-sends the same value doesn't wipe the list and refetch.
     */
    setFilters: (patch) => {
      const current = get().filters;
      const next = { ...current, ...patch };
      if (historyFilterKey(next) === historyFilterKey(current)) return;

      // When a local source is available, keep the current rows visible while
      // the (debounced) local repaint is on its way — a stale-while-revalidate
      // transition instead of a skeleton flash. Only blank to a skeleton when
      // there is no local source to paint from (server-only path). `_isRefreshing`
      // is ALWAYS set so the subtle loading strip shows during the repaint.
      const localSourceReady =
        LOCAL_PREVIOUS_ORDERS_ENABLED && isLocalDbReady();
      set({
        filters: next,
        previousOrders: localSourceReady ? get().previousOrders : [],
        _isRefreshing: true,
        _orderLookup: {},
        _currentOffset: 0,
        _hasMore: false,
        _isLoadingMore: false,
        _oldestCursor: null,
        totalMatchingCount: null,
        // A new filter set is a new result set — always start at its first page.
        pageIndex: 0,
        pageCount: 0,
        // Channel/provider don't affect counts, so only drop the summaries when
        // the axes they DO depend on change. Avoids a count flicker on every
        // tab tap.
        ...(next.status !== current.status || next.search !== current.search
          ? { windowSummaries: null, windowSummariesTruncated: false }
          : {}),
      });
      _scheduleDebouncedRefresh();
    },

    setDateWindow: (window) => {
      // Resolve bounds synchronously (Luxon, no network) so the live-orders
      // date gate has a window to filter against immediately — before the
      // debounced RPC refresh returns authoritative bounds. Without this, the
      // gate sees null bounds for ~200ms+ and leaks out-of-window orders (e.g.
      // 4-day-old orders flashing under the freshly-tapped "Today" pill).
      const localBounds = resolveLocalBounds(window);
      // When a local source is available, keep the current rows + counts
      // visible while the (debounced) local repaint is on its way — a
      // stale-while-revalidate transition instead of a skeleton flash / 0
      // counts. Only blank when there is no local source to paint from.
      // `_isRefreshing` is ALWAYS set so the subtle loading strip shows during
      // the repaint.
      const localSourceReady =
        LOCAL_PREVIOUS_ORDERS_ENABLED && isLocalDbReady();
      set({
        dateWindow: {
          ...window,
          _resolvedStartTs: localBounds?.startTs ?? null,
          _resolvedEndTs: localBounds?.endTs ?? null,
        },
        previousOrders: localSourceReady ? get().previousOrders : [],
        _isRefreshing: true,
        _orderLookup: {},
        _currentOffset: 0,
        _hasMore: false, // Block loadMore until refresh resolves bounds + sets _hasMore
        _isLoadingMore: false,
        _oldestCursor: null,
        // A new date window is a new result set — always start at its first
        // page. Without this, switching dates while on page 2 of a long window
        // re-queries page 2 of the NEW window (empty when it only has one
        // page), and the fresh gate then short-circuits with that empty result
        // — "0 orders until refresh".
        pageIndex: 0,
        pageCount: 0,
        // Counts belong to the old window — when a local source can repaint
        // them instantly, keep the old numbers rather than flashing 0.
        ...(localSourceReady
          ? {}
          : { windowSummaries: null, windowSummariesTruncated: false }),
      });
      // Trailing-edge debounce: rapid pill taps (Today → Yesterday → Last 7
      // → Yesterday) only fire one refetch for the final selection. UI
      // updates immediately above; the network call is what we collapse.
      _scheduleDebouncedRefresh();
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
        "Dine In" | "Takeaway" | "Delivery";

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
        paymentStatus: derivePreviousOrderPaymentStatus(order),
        customer: order.customer_name || "Walk-In Customer",
        customer_phone: order.customer_phone ?? null,
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
        total_cash_amount: order.total_cash_amount ?? finalTotal,
        tax: order.total_tax ?? 0,
        service_charge: order.service_charge ?? 0,
        service_charge_name: order.service_charge_name ?? null,
        service_charge_rate: order.service_charge_rate ?? null,
        service_charge_is_taxable: order.service_charge_is_taxable ?? null,
        items: order.items,
        notes: order.notes, // Order-level notes (customer requests, special instructions)
        // Additional fields for refund tracking
        refunded: false,
        refundedAmount: 0,
        originalTotal: finalTotal,
        payments: order.payments,
        service_location_id: order.service_location_id ?? undefined,
        service_location_name: resolvePreviousOrderTableName(
          order.service_location_id,
          order.service_location_name,
        ),
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
        platform_order_number: order.platform_order_number ?? null,
        created_by_staff_profile_id: order.created_by_staff_profile_id ?? null,
        // Broadcast orders don't carry the online_orders join, so fall back to
        // order_source. Server-fetched orders (in _transformFetchedOrder) use
        // the authoritative online_orders join instead.
        _isOnlineOrder: isOnlineOrderSource(order.order_source),
        // Flag as offline/unsynced when archived without a backend row while the
        // device is offline. Drives the row's "Offline" badge; cleared when the
        // order later syncs and a server fetch replaces this entry.
        _offlineUnsynced: !order.db_order_id && !isDeviceOnline(),
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

      // Merge this order INTO the persisted offline snapshot so it survives
      // navigating away + re-entering (re-entry hydrates from this cache).
      //
      // Critically, merge into the *cached* list — NOT get().previousOrders.
      // addOrderToHistory often fires from archiveOrder while the Previous
      // Orders screen is unmounted, so the in-memory list is [] (wiped on
      // leave). Writing that would clobber the cached server snapshot. Reading
      // the cache, prepending the new order, and writing back keeps the
      // snapshot additive. When online the next server fetch overwrites it.
      const locationId = resolveHistoryLocationId();
      if (locationId) {
        const cached = previousOrdersOfflineCache.get(locationId);
        const base = cached?.orders ?? [];
        // Dedupe by db_order_id / orderId so a re-archive or a later synced
        // copy doesn't duplicate the row.
        const newKey = previousOrder.db_order_id || previousOrder.orderId;
        const deduped = base.filter(
          (o) => (o.db_order_id || o.orderId) !== newKey,
        );
        // Insert by position rather than re-sorting. This runs on EVERY
        // archived order — i.e. during checkout — and the cached list is
        // already newest-first, so a full sort of up to 200 rows was pure
        // main-thread cost on the till's critical path. The new order is
        // almost always the newest, making this an O(1) unshift in practice.
        const newTs = new Date(previousOrder.timestamp).getTime();
        let insertAt = 0;
        while (
          insertAt < deduped.length &&
          new Date(deduped[insertAt].timestamp).getTime() > newTs
        ) {
          insertAt++;
        }
        const mergedCache = [
          ...deduped.slice(0, insertAt),
          previousOrder,
          ...deduped.slice(insertAt),
        ];
        previousOrdersOfflineCache.set(
          locationId,
          mergedCache,
          cached?.windowLabel ??
            (get().dateWindow ?? DEFAULT_DATE_WINDOW).label,
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
        // setDateWindow may have optimistically flagged a refresh; clear it so
        // the loading state doesn't stick when no fetch actually runs.
        if (get()._isRefreshing) set({ _isRefreshing: false });
        return;
      }

      // ── Phase 3: local-first paint (flag-gated) ──────────────
      const st0 = get();
      const dw0 = st0.dateWindow ?? DEFAULT_DATE_WINDOW;
      const online = isDeviceOnline();

      // Resolve the business-day window BEFORE touching the mirror, cheapest
      // first: in-memory → persisted MMKV cache → server RPC (online) → Luxon
      // (offline). The window only changes at the daily rollover, so the
      // resolved bounds are saved locally and reused — no "fetch the time"
      // round trip on every refresh.
      const { startTs, endTs } = await resolveWindowBounds({
        dw0,
        locationId,
        client,
        online,
      });
      // Persist to state so the live-orders gate, paging and later cycles
      // reuse the SAME bounds (they only change at the daily rollover).
      if (
        startTs &&
        endTs &&
        (startTs !== dw0._resolvedStartTs || endTs !== dw0._resolvedEndTs)
      ) {
        set({
          dateWindow: {
            ...dw0,
            _resolvedStartTs: startTs,
            _resolvedEndTs: endTs,
          },
        });
      }
      // NEVER query the mirror unbounded: without a resolved window a local
      // page would show every order in the DB under "Today" (wrong dates) —
      // e.g. first launch before the merchant timezone has hydrated.
      const windowReady = Boolean(startTs && endTs);
      const local =
        LOCAL_PREVIOUS_ORDERS_ENABLED && windowReady
          ? await resolveLocalHistoryPage({
              locationId,
              filters: st0.filters,
              startTs,
              endTs,
              pageIndex: st0.pageIndex,
              pageSize: HISTORY_PAGE_SIZE,
            })
          : null;
      if (local) {
        set({
          previousOrders: local.pageOrders,
          _orderLookup: buildOrderLookupMap(local.pageOrders),
          pageIndex: st0.pageIndex,
          totalMatchingCount: local.totalCount,
          pageCount: historyPageCount(local.totalCount, HISTORY_PAGE_SIZE),
          _source: isDeviceOnline() ? "local" : "offline-local",
          _isRefreshing: false,
        });
        // How far back this device can actually answer for. The scope line
        // shows THIS, not the match count — "the most recent 3 orders" was the
        // count of rows matching the current filter, which says nothing about
        // coverage and read as a claim about retention.
        void getOrdersMirrorState(locationId).then((state) => {
          set({ _scopeFloor: state?.retentionFloor ?? null });
        });
        // ── Local tab counts (window-wide, no network) ───────
        // The mirror holds every order in the window, so channel / provider /
        // status tabs get exact counts immediately — and they survive offline.
        // The server summary fetch (Step 2a) still overwrites when the mirror
        // is stale and we fall through to the server path below.
        if (LOCAL_PREVIOUS_ORDERS_ENABLED && startTs && endTs) {
          const summaries = await resolveLocalHistorySummaries({
            locationId,
            filters: st0.filters,
            startTs,
            endTs,
          });
          if (summaries) {
            set({
              windowSummaries: summaries.rows,
              windowSummariesTruncated: summaries.truncated,
            });
          }
        }
        // Offline: the local mirror is the answer — a better offline source than
        // the MMKV cache (full window, paging, search). The block below remains
        // the fallback when the DB is unavailable.
        if (!isDeviceOnline()) return;
      }

      // ── Phase 3: local-first when FRESH ─────────────────────
      // Online + a recently-synced mirror whose retention covers the window:
      // the mirror IS the answer for ANY filter set (the delta sync revalidates
      // it every ~30s and the local query mirrors the server builder exactly),
      // so skip the full server round trip — opening, tab-switching and
      // date-switching become zero-network when the mirror is healthy.
      // Pull-to-refresh (force) bypasses this; a stale mirror or a window
      // reaching past the retained rows falls through to the server.
      //
      // A fresh mirror can still LAG the server by up to one delta cycle
      // (~30s) or a missed/dropped broadcast — e.g. a just-created order, a
      // payment, a void — so freshness alone is NOT proof the backend hasn't
      // moved. Before trusting the mirror, run the same cheap signature probe
      // the offline-cache path uses: when the backend's count + newest
      // `updated_at` match the last server-fetched signature, nothing changed
      // and the mirror rows stand (zero network beyond the probe). When the
      // backend moved (new order → count; payment/void/refund → updated_at),
      // fall through to the authoritative fetch so the list never shows a
      // missing or stale row on entry.
      //
      // `canTrustMirror` is that check, shared with `goToPage` so entry and
      // paging can never disagree about when the mirror is authoritative.
      // Pull-to-refresh (force) drops the cached verdict and bypasses it.
      if (force) invalidateMirrorTrust();
      if (
        LOCAL_PREVIOUS_ORDERS_ENABLED &&
        local &&
        !force &&
        startTs &&
        endTs &&
        (await canTrustMirror({
          client,
          locationId,
          windowLabel: (get().dateWindow ?? DEFAULT_DATE_WINDOW).label,
          startTs,
          endTs,
        }))
      ) {
        // Backend hasn't moved — keep the mirror rows, skip the fetch.
        if (get()._isRefreshing) set({ _isRefreshing: false });
        return;
      }
      // Backend moved (or we couldn't prove it hadn't) — fall through to the
      // full fetch below so the screen shows the authoritative state.
      invalidateMirrorTrust();

      // Offline: don't hit the network. Hydrate the list from the last
      // successful online fetch so the screen isn't empty. The cache is shown
      // ONLY here (offline) — online always renders fresh server data.
      if (!isDeviceOnline()) {
        const cached = previousOrdersOfflineCache.get(locationId);
        if (cached) {
          const orders = cached.orders.filter((po) => !isEmptyDraftOrder(po));
          set({
            previousOrders: orders,
            _orderLookup: buildOrderLookupMap(orders),
            _isRefreshing: false,
            // No live pagination offline — cache is a fixed snapshot.
            _hasMore: false,
            _isLoadingMore: false,
          });
          if (__DEV__)
            console.log(
              `[PreviousOrders] offline — hydrated ${orders.length} orders from cache.`,
            );
        } else if (get()._isRefreshing) {
          set({ _isRefreshing: false });
        }
        return;
      }

      const st = get();
      if (
        !force &&
        st._lastRefreshLocationId === locationId &&
        st.lastHistoryRefreshAt != null &&
        Date.now() - st.lastHistoryRefreshAt < HISTORY_REFRESH_COALESCE_MS
      ) {
        if (st._isRefreshing) set({ _isRefreshing: false });
        return;
      }

      // ── Cache-and-revalidate ────────────────────────────────
      // Re-entering the screen used to refetch unconditionally. Instead, show
      // the cached page straight away, then ask the backend two cheap questions
      // — how many orders are in this window, and when was the newest one
      // touched. If both match what the cache was built from, nothing changed
      // and the fetch below is skipped entirely.
      //
      // Only for the unfiltered first page: a filtered or deeper page isn't
      // what the cache holds. `force` (pull-to-refresh) always skips this.
      // Also skipped when the local mirror painted the page — the mirror rows
      // are fresher than the offline snapshot, so overwriting them with the
      // cache would be a regression; the full fetch below is authoritative.
      if (
        !local &&
        !force &&
        isDefaultHistoryFilters(st.filters) &&
        st.pageIndex === 0
      ) {
        const cached = previousOrdersOfflineCache.get(locationId);
        const cachedSig = previousOrdersOfflineCache.getSignature(locationId);
        const windowLabel = (st.dateWindow ?? DEFAULT_DATE_WINDOW).label;

        if (cached && cachedSig && cached.windowLabel === windowLabel) {
          const cachedOrders = cached.orders.filter(
            (po) => !isEmptyDraftOrder(po),
          );
          // Paint the cached rows now so the screen isn't blank while probing.
          set({
            previousOrders: cachedOrders,
            _orderLookup: buildOrderLookupMap(cachedOrders),
            _isRefreshing: false,
          });

          try {
            const { _resolvedStartTs, _resolvedEndTs } =
              st.dateWindow ?? DEFAULT_DATE_WINDOW;
            const live = await withDeadline(
              (signal) =>
                OrderService.getHistoryWindowSignature(
                  client,
                  locationId,
                  _resolvedStartTs,
                  _resolvedEndTs,
                  signal,
                ),
              DEADLINES.read,
              "getHistoryWindowSignature",
            );

            if (!live.error && isCacheFresh(cachedSig, live, windowLabel)) {
              // Backend hasn't moved — keep the cached rows, refresh the
              // bookkeeping so the coalesce window and counts stay sane.
              set({
                lastHistoryRefreshAt: Date.now(),
                _lastRefreshLocationId: locationId,
                totalMatchingCount: live.count,
                pageCount:
                  live.count != null
                    ? historyPageCount(live.count, HISTORY_PAGE_SIZE)
                    : 0,
              });
              if (__DEV__)
                console.log(
                  `[PreviousOrders] cache fresh (${cachedOrders.length} orders) — skipped refetch.`,
                );
              return;
            }
          } catch (err) {
            // Probe failed — fall through to the full fetch below.
            console.warn("[PreviousOrders] signature probe failed:", err);
          }
        }
      }

      if (refreshPreviousOrdersInFlight) {
        return refreshPreviousOrdersInFlight;
      }

      set({ _isRefreshing: true });

      refreshPreviousOrdersInFlight = (async () => {
        if (__DEV__)
          console.log("Refreshing previous orders data from backend...");

        try {
          // Step 1: Business day bounds — already resolved by the local-first
          // section above (in-memory → persisted cache → RPC-once → Luxon) and
          // persisted to state. Reuse them here; the window only changes at
          // the daily rollover, so there is no reason to re-fetch per pass.
          const dateWindow = get().dateWindow ?? DEFAULT_DATE_WINDOW;
          let startTs = dateWindow._resolvedStartTs ?? null;
          let endTs = dateWindow._resolvedEndTs ?? null;

          // Defensive fallback (shouldn't happen — the local-first section
          // guarantees bounds) — Client-side Luxon if somehow still null.
          if (!startTs || !endTs) {
            try {
              const config = resolveBusinessDayConfig();
              if (config) {
                if (dateWindow.label === "today" || !dateWindow.startDate) {
                  const localDay = getCurrentBusinessDay(config);
                  const localBounds = getBusinessDayBounds(localDay, config);
                  startTs = localBounds.startUtc;
                  endTs = localBounds.endUtc;
                } else {
                  const localBounds = getBusinessDayBounds(
                    dateWindow.startDate,
                    config,
                  );
                  startTs = localBounds.startUtc;
                  endTs = dateWindow.endDate
                    ? getBusinessDayBounds(dateWindow.endDate, config).endUtc
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

          // No plain-JS date fallback here. That path can compute the wrong
          // business day when device timezone and merchant timezone differ.
          if (!startTs || !endTs) {
            console.error(
              "[PreviousOrders] Both RPC and Luxon bounds resolution failed - aborting fetch.",
            );
            return;
          }

          // Cache resolved bounds for broadcast guard + loadMore
          set({
            dateWindow: {
              ...dateWindow,
              _resolvedStartTs: startTs,
              _resolvedEndTs: endTs,
            },
          });

          const activeFilters = get().filters;
          const activeFilterKey = historyFilterKey(activeFilters);

          // Step 2a: Window-wide count summaries, in parallel with the page
          // fetch below. Deliberately not awaited here and never fatal — if it
          // fails the list still renders, only the tab counts stay stale.
          void withDeadline(
            (signal) =>
              OrderService.getHistoryOrderSummaries(
                client,
                locationId,
                startTs,
                endTs,
                signal,
                activeFilters,
              ),
            DEADLINES.read,
            "getHistoryOrderSummaries",
          )
            .then(({ data, error, truncated }) => {
              if (error || !data) return;
              // Guard against a stale response landing after the user switched
              // window or filters: only accept it if both still match.
              const current = get();
              if (
                current.dateWindow?._resolvedStartTs !== startTs ||
                current.dateWindow?._resolvedEndTs !== endTs ||
                historyFilterKey(current.filters) !== activeFilterKey
              ) {
                return;
              }
              set({
                windowSummaries: data,
                windowSummariesTruncated: truncated,
              });
            })
            .catch((err) => {
              console.warn("[PreviousOrders] summary fetch failed:", err);
            });

          // Step 2b: First filtered page + the exact total for these filters.
          // Deadline-wrapped so server-side statement timeouts (~30s) fail fast.
          let fetchedOrders: any[] | null = null;
          let pageHasMore = false;
          let pageTotal: number | null = null;
          try {
            const result = await withDeadline(
              (signal) =>
                OrderService.getFilteredHistoryPage(client, {
                  locationId,
                  filters: activeFilters,
                  limit: HISTORY_PAGE_SIZE,
                  offset: 0,
                  startTs,
                  endTs,
                  withCount: true,
                  signal,
                }),
              DEADLINES.read,
              "getFilteredHistoryPage",
            );
            if (result.error) {
              console.error("Failed to fetch previous orders:", result.error);
              return;
            }
            fetchedOrders = result.data;
            pageHasMore = result.hasMore;
            pageTotal = result.totalCount;
          } catch (err) {
            console.error("Failed to fetch previous orders:", err);
            return;
          }

          if (!fetchedOrders) return;

          // Drop a response whose filters the user has already moved on from.
          if (historyFilterKey(get().filters) !== activeFilterKey) return;

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

          // How the server result combines with what's already in memory
          // depends on whether the client can reproduce the server's ordering.
          //
          // Default filters + newest-first is the one case where it can, so the
          // historical merge is kept there: it preserves orders added by a
          // broadcast that raced this refresh, and it's the shape the offline
          // cache and the other `previousOrders` consumers expect.
          //
          // Under any other filter or sort the server's ordering is
          // authoritative and not reconstructible here (an amount sort can't be
          // re-derived from timestamps, and a broadcast order may not even match
          // the filter). There the page replaces the list outright.
          const canMergeLocally =
            isDefaultHistoryFilters(activeFilters) &&
            activeFilters.sort === "date_desc";

          let mergedPreviousOrders: PreviousOrder[];
          if (canMergeLocally) {
            // Drop offline-unsynced placeholders before merging: this is an
            // online refresh, so the authoritative server result supersedes
            // them. A truly synced order comes back from the fetch (unflagged);
            // a not-yet-synced one re-surfaces on a later fetch/broadcast.
            // Prevents a duplicate row (offline-badged local copy keyed by
            // orderId + server copy keyed by db_order_id).
            const existingPreviousOrders = get().previousOrders.filter(
              (o) => !o._offlineUnsynced,
            );

            const ordersMap = new Map<string, PreviousOrder>();
            if (startTs && endTs) {
              // Only keep existing orders inside the current window. Drops
              // stale orders from other days while preserving broadcast-added
              // orders from today.
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

            mergedPreviousOrders = Array.from(ordersMap.values()).filter(
              (po) => !isEmptyDraftOrder(po),
            );
            mergedPreviousOrders.sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            );
          } else {
            // Server order preserved verbatim — no client sort.
            mergedPreviousOrders = newPreviousOrders.filter(
              (po) => !isEmptyDraftOrder(po),
            );
          }

          const newLookup = buildOrderLookupMap(mergedPreviousOrders);
          const now = Date.now();
          set({
            previousOrders: mergedPreviousOrders,
            _orderLookup: newLookup,
            _source: "server",
            lastHistoryRefreshAt: now,
            _lastRefreshLocationId: locationId,
            // A refresh always lands on the first page of the result set.
            pageIndex: 0,
            pageCount:
              pageTotal != null
                ? historyPageCount(pageTotal, HISTORY_PAGE_SIZE)
                : 0,
            totalMatchingCount: pageTotal,
            _loadedFilterKey: activeFilterKey,
            _currentOffset: fetchedOrders.length,
            _hasMore: pageHasMore,
            _isLoadingMore: false,
            _oldestCursor: null,
          });

          // Record the signature this data corresponds to, so the next entry
          // can tell whether the backend moved without refetching rows.
          if (canMergeLocally) {
            previousOrdersOfflineCache.setSignature(locationId, {
              count: pageTotal,
              latestUpdatedAt: latestUpdatedAtOf(fetchedOrders),
              windowLabel: (get().dateWindow ?? DEFAULT_DATE_WINDOW).label,
            });
          }

          // Persist this successful fetch as the offline fallback snapshot —
          // but only for the unfiltered view. Caching a filtered result would
          // make the next offline open show, say, "DoorDash + refunded only"
          // as if it were the whole history.
          if (canMergeLocally) {
            previousOrdersOfflineCache.set(
              locationId,
              mergedPreviousOrders,
              (get().dateWindow ?? DEFAULT_DATE_WINDOW).label,
            );
          }

          if (__DEV__)
            console.log(
              `Previous orders refreshed: ${mergedPreviousOrders.length} orders loaded (window: ${dateWindow.label}).`,
            );
        } catch (err) {
          console.error("Error in refreshPreviousOrders:", err);
        } finally {
          refreshPreviousOrdersInFlight = null;
          set({ _isRefreshing: false });
        }
      })();

      await refreshPreviousOrdersInFlight;
    },

    // Check for new orders by fetching latest 10 and comparing IDs
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

        // Sync local order state + reopen table session if applicable.
        // Refund just rewrote payments[].refunded_amount + amount_due in DB;
        // without this, useOrderStore stays at the pre-refund snapshot and
        // the table stays at status='paid' from the original order:paid emit.
        await applyRefundRecovery({
          orderId,
          tableId: order.service_location_id,
        });

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

      // 1. Prepare the items for the refund record.
      // Note (Wave R-SC): totalRefundedInThisTx is now populated from the
      // server response below — `item.price * quantity` was pre-discount
      // and over-counted the fraud-velocity threshold on every discounted
      // refund. The authoritative SC-inclusive total comes from
      // refundService.processRefund's reversals[].amount aggregation.
      itemsToRefund.forEach(({ itemId, quantity, reason }) => {
        const item = order.items.find((i) => i.id === itemId);
        // Ensure we are refunding a valid item and a valid quantity
        const maxRefundable =
          (item?.quantity || 0) - (item?.refundedQuantity || 0);
        if (item && quantity > 0 && quantity <= maxRefundable) {
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

        // Wave R-SC: derive the authoritative refunded total from the
        // server response (SC-inclusive, post-discount). Used by the audit
        // log + fraud-velocity threshold below.
        totalRefundedInThisTx = (result.data?.reversals ?? []).reduce(
          (sum, r) => sum + Number(r.amount || 0),
          0,
        );

        await applyRefundRecovery({
          orderId,
          tableId: order.service_location_id,
        });

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
          paymentStatus: derivePreviousOrderPaymentStatus(profile),
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
          // A void lands as a broadcast too — surface it on the row so a
          // cross-station void shows the Voided badge without waiting for a
          // refresh (own-station voids are covered by the debounced refresh).
          voided: profile.order_status === "void",
          amount_paid: profile.amount_paid ?? existing.amount_paid,
          amount_due: profile.amount_due ?? existing.amount_due,
          cash_amount_due: profile.cash_amount_due ?? existing.cash_amount_due,
          payments:
            (profile.payments?.length ?? 0) > 0
              ? profile.payments
              : existing.payments,
          checkStatus: profile.check_status || existing.checkStatus,
        });
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

    setListMounted: (mounted: boolean) => {
      set({ _isListMounted: mounted });
    },
  }),
);
