import { SyncProgressBanner } from "@/components/db/SyncProgressBanner";
import DatePillRow, { type DatePillDef } from "@/components/menu/DatePillRow";
import ChannelTabBar from "@/components/previous-orders/ChannelTabBar";
import DayHeader from "@/components/previous-orders/DayHeader";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import OrdersSelectDropdown, {
    ActiveFilterPill,
} from "@/components/previous-orders/OrdersSelectDropdown";
import PaginationBar from "@/components/previous-orders/PaginationBar";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import ProviderChipRow from "@/components/previous-orders/ProviderChipRow";
import ReceiptModal from "@/components/receipts/ReceiptModal";
import { useLocalFreshness } from "@/hooks/db/useLocalFreshness";
import {
    useCloseCheck,
    useReopenCheck,
    useVoidOrder,
} from "@/hooks/orders/useOrderActions";
import { useHistoryFilterControls } from "@/hooks/pos/useHistoryFilterControls";
import { usePreviousOrdersListSync } from "@/hooks/pos/usePreviousOrdersListSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { dayKeyOf, groupOrdersByDay } from "@/lib/orderDayGrouping";
import {
    getChannelTab,
    getProviderKey,
    matchesStatus,
    SORT_OPTIONS,
    STATUS_OPTIONS,
} from "@/lib/previousOrdersFilters";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import {
    DEFAULT_HISTORY_FILTERS,
    historyFilterKey,
} from "@/services/historyOrderFilters";
import { useLocalDbSyncStore } from "@/stores/useLocalDbSyncStore";
import {
    calculateOrderTotalsForOrder,
    useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import {
    resolveBusinessDayConfig,
    usePreviousOrdersStore,
} from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Search } from "lucide-react-native";

import { FlashList } from "@shopify/flash-list";
import { useFocusEffect, useRouter } from "expo-router";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

// A day header and an order row are recycled into separate FlashList cell
// pools (see `getItemType` below), so one flattened, typed array can carry
// both without either recycling into the other's layout.
type PrevOrdersListItem =
  | {
      kind: "header";
      dayStart: number;
      title: string;
      count: number;
      first: boolean;
    }
  | { kind: "row"; order: OrderProfile };

// FlashList's keyExtractor keys rows off `order.id` — a duplicate id crashes
// the recycler's cell-key uniqueness invariant (surfaces as RecyclerListView's
// "Encountered two children with the same key, #N_rlv_c" warning). `allOrders`
// merges two independently-updating sources (live store + cached/mirrored
// history) below, so this is a defensive backstop, not a primary dedupe pass.
function dedupeOrdersById(orders: OrderProfile[]): OrderProfile[] {
  const seen = new Set<string>();
  return orders.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

// ─── Skeleton Loading ───────────────────────────────────────
const SkeletonBar = ({
  width,
  height,
  style,
}: {
  width: number | string;
  height: number;
  style?: any;
}) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: typeof width === "number" ? width : undefined,
          height,
          backgroundColor: colors.border,
          borderRadius: 8,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

const SkeletonRow = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        height: s(64),
        paddingHorizontal: s(16),
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <SkeletonBar width={28} height={s(28)} style={{ borderRadius: s(9) }} />
      <View style={{ flex: 1, gap: s(6) }}>
        <SkeletonBar width={90} height={s(13)} />
        <SkeletonBar width={200} height={s(11)} />
      </View>
      <SkeletonBar width={64} height={s(22)} style={{ borderRadius: 999 }} />
      <SkeletonBar width={72} height={s(16)} />
      <SkeletonBar width={36} height={s(36)} style={{ borderRadius: s(8) }} />
    </View>
  );
};

// ─── Indeterminate loading bar ─────────────────────────────
// A thin bar that sweeps across the top of the list on ANY load — page turns,
// refreshes, filter/date switches, local or server. Deliberately not a
// spinner: no spinning circle anywhere in the loading UX.
const LoadingBar = () => {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(-width);
  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(width, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(translateX);
  }, [translateX, width]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  return (
    <View
      style={{
        flex: 1,
        overflow: "hidden",
        backgroundColor: colors.border,
        borderRadius: 2,
      }}
    >
      <Animated.View
        style={[
          {
            width: Math.max(width * 0.35, 160),
            height: "100%",
            borderRadius: 2,
            backgroundColor: colors.teal,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
};

// ─── Main Screen ────────────────────────────────────────────
const PreviousOrdersScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const router = useRouter();
  const setActiveOrder = useOrderStore(
    (storeState) => storeState.setActiveOrder,
  );

  // Modal state
  const [activeModal, setActiveModal] = useState<"notes" | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderProfile | null>(null);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
    useState<OrderProfile | null>(null);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Business-day config drives BOTH the date-window filter and the day headers:
  // headers must bucket orders by the same merchant-timezone + rollover hour,
  // or an after-midnight order in yesterday's business day would render under
  // a "Today" header.
  const dayGroupingConfig = useMemo(
    () => resolveBusinessDayConfig(),
    [selectedStore?.timezone, selectedStore?.business_day_start_hour],
  );

  // Expand/collapse state
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Scroll position is per-page: landing on page 2 halfway down would look like
  // the list simply grew. Reset to the top whenever the page changes.
  const scrollRef = useRef<FlashList<PrevOrdersListItem>>(null);

  // ─── Filter, count & pagination state ───
  // Owned by the store and applied SERVER-side; shared with the menu's Previous
  // Orders section via this hook so both surfaces agree on what each tab means.
  // The screen renders whatever the server matched, in the order the server
  // returned it — no local filtering, sorting or searching.
  const {
    channelTab,
    providerFilter,
    statusFilter,
    sortKey,
    searchText,
    setSearchText,
    activeFilterCount,
    selectChannel: handleChannelTabSelect,
    selectProvider: handleProviderSelect,
    selectStatus: handleStatusSelect,
    selectSort: handleSortSelect,
    clearFilters,
    channelCounts,
    providerCounts,
    providerRoster,
    pageIndex,
    pageCount,
    totalMatchingCount,
    isPageLoading,
    rangeStart,
    rangeEnd,
    goToPrevPage: handlePrevPage,
    goToNextPage: handleNextPage,
  } = useHistoryFilterControls();

  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync();

  // Store-driven loading flag: true during the initial fetch AND on every
  // filter/date-window switch (setDateWindow clears the list + flags a refetch).
  // Drives the skeleton rows so a switch never flashes "No orders found".
  const isInitialLoading = usePreviousOrdersStore((s) => s._isRefreshing);
  // Phase 3 — where the displayed page came from. "offline-local" means the
  // list is the local mirror's window, so the scope line is shown and the
  // empty state must not read as a definitive "doesn't exist".
  const historySource = usePreviousOrdersStore((s) => s._source);

  // Date window
  const dateWindowLabel = usePreviousOrdersStore(
    (s) => s.dateWindow?.label ?? "today",
  );
  const setDateWindow = usePreviousOrdersStore((s) => s.setDateWindow);
  // Resolved business-day bounds — used to scope the offline live orders to the
  // active date pill (they carry no server-side filtering of their own).
  const resolvedStartTs = usePreviousOrdersStore(
    (s) => s.dateWindow?._resolvedStartTs ?? null,
  );
  const resolvedEndTs = usePreviousOrdersStore(
    (s) => s.dateWindow?._resolvedEndTs ?? null,
  );
  const handleDatePillSelect = useCallback(
    (pill: DatePillDef) => {
      const { startDate, endDate } = pill.getDateRange();
      setDateWindow({ startDate, endDate, label: pill.windowLabel });
    },
    [setDateWindow],
  );

  // ─── Server-fetched data layer ───
  // Previous Orders renders ONLY the date-bounded backend fetch (previousOrders).
  // Live in-memory orders from useOrderStore are not merged in: a just-created /
  // unsynced order is not a "previous order" and was previously pinned to the
  // top of every date window. It surfaces here only once it syncs and a fetch /
  // broadcast returns it.
  const { previousOrders } = usePreviousOrdersStore();
  const { rawIsOnline } = useNetworkStatus();

  // ─── Sync / offline visibility (release builds strip the dev logs) ───
  // The mirror's state has to be ON SCREEN: first-sync in progress, offline,
  // or stale. Freshness alone can't show a cold sync (last_success_at stamps
  // after page 1 of N), so the delta-sync store's cycle flag is what drives
  // the "Syncing…" banner.
  const { isSyncing, hasCompletedCycle } = useLocalDbSyncStore();
  const freshness = useLocalFreshness("orders", selectedStore?.id ?? null);

  // OFFLINE ONLY: backend unreachable, so previousOrders can't refresh. Surface
  // the device's own non-final orders (active + working set + own-station open)
  // so open/unpaid offline orders are visible too, each badged "Offline". Empty
  // when online (list stays server-fetched only).
  const offlineLiveOrders = useOrderStore(
    useShallow((s) => {
      if (rawIsOnline) return [] as OrderProfile[];
      const finalStatuses = new Set([
        "completed",
        "void",
        "cancelled",
        "voided",
      ]);
      const ids = new Set<string>();
      if (s.activeOrderId) ids.add(s.activeOrderId);
      for (const wsId of s.workingSetOrderIds || []) {
        ids.add(s.dbOrderIdIndex[wsId] || wsId);
      }
      for (const id of s.orderIds) {
        if (ids.has(id)) continue;
        const o = s.ordersById[id];
        if (!o) continue;
        if (o.station_id !== s.currentStationId) continue;
        if (finalStatuses.has(o.order_status ?? "")) continue;
        ids.add(id);
      }
      const result: OrderProfile[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const o = s.ordersById[id];
        if (!o) continue;
        if (o.order_status === "draft" && o.items.length === 0) continue;
        const canonical = o.db_order_id ?? o.id;
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        result.push(o.db_order_id ? o : { ...o, _offlineUnsynced: true });
      }
      return result;
    }),
  );

  // Live store copies of NON-final orders on this device, keyed by BOTH local id
  // and db_order_id. Used to overlay fresh financials onto the history snapshot
  // for an order that is still being edited: its fetched service charge / total
  // lag the current items (the server SC recompute runs at payment, not on every
  // add), so Previous Orders would otherwise show a stale SC while the table view
  // and payment sheet — which read the live store — show the correct one. Only
  // open orders are included, so finalized rows keep their authoritative fetched
  // values. useShallow keeps this from re-rendering unless an open order changes.
  const liveOpenById = useOrderStore(
    useShallow((s) => {
      const FINAL = new Set(["completed", "void", "cancelled", "voided"]);
      const map: Record<string, OrderProfile> = {};
      for (const id of s.orderIds) {
        const o = s.ordersById[id];
        if (!o) continue;
        if (o.closed_at || o.paid_status === "Paid") continue;
        if (FINAL.has(o.order_status ?? "")) continue;
        map[o.id] = o;
        if (o.db_order_id) map[o.db_order_id] = o;
      }
      return map;
    }),
  );

  // Release the loaded page from memory when navigating away. The rows are
  // persisted to MMKV by the store, so re-entry rehydrates from that cache and
  // only refetches when the backend signature says something changed — it does
  // NOT pay for a full fetch every visit. Filters and page position reset so a
  // re-entry starts from an unfiltered first page rather than resuming a
  // narrowed view with no visible cause.
  useFocusEffect(
    useCallback(() => {
      return () => {
        usePreviousOrdersStore.setState({
          previousOrders: [],
          _orderLookup: {},
          _isRefreshing: false,
          pageIndex: 0,
          pageCount: 0,
          _isPageLoading: false,
          _currentOffset: 0,
          _hasMore: false,
          _isLoadingMore: false,
          _oldestCursor: null,
          lastHistoryRefreshAt: null,
          _lastRefreshLocationId: null,
          windowSummaries: null,
          windowSummariesTruncated: false,
          // Filters are server-side now, so a stale one left behind would make
          // the next visit fetch a narrowed list with no visible cause.
          filters: { ...DEFAULT_HISTORY_FILTERS },
          _loadedFilterKey: historyFilterKey(DEFAULT_HISTORY_FILTERS),
          totalMatchingCount: null,
        });
      };
    }, []),
  );

  useEffect(() => {
    // Smooth scroll to the top on page turns — the dim overlay masks the swap,
    // and an animated scroll avoids the jarring instant jump between pages.
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    // An expanded row from the previous page has no meaning on this one.
    setExpandedOrderId(null);
  }, [pageIndex]);

  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);

  // Server-fetched history mapped to OrderProfile. Online: exactly the
  // date-bounded backend fetch. Offline: offlineLiveOrders (the device's own
  // pending orders) is prepended so open/unpaid offline orders show too.
  const allOrders: OrderProfile[] = useMemo(() => {
    const config = dayGroupingConfig;
    const rawMappedHistory: OrderProfile[] = previousOrders.map((po) => {
      const mapped = {
        id: po.orderId,
        db_order_id: po.db_order_id,
        display_number: po.display_number,
        order_number: po.display_number,
        customer_name: po.customer,
        customer_phone: po.customer_phone ?? undefined,
        server_name: po.server,
        order_status: po.voided
          ? "void"
          : po.refunded && po.paymentStatus !== "Paid"
            ? "refunded"
            : po.closed_at
              ? "completed"
              : "pending",
        check_status: po.checkStatus || "Opened",
        paid_status: po.paymentStatus,
        order_type: po.type,
        items: po.items,
        total_amount: po.total,
        total_cash_amount: po.total_cash_amount,
        total_tax: po.tax,
        service_charge: po.service_charge,
        service_charge_name: po.service_charge_name,
        service_charge_rate: po.service_charge_rate,
        service_charge_is_taxable: po.service_charge_is_taxable,
        amount_paid: po.amount_paid,
        amount_due: po.amount_due,
        cash_amount_due: po.cash_amount_due,
        opened_at: po.timestamp || po.opened_at,
        created_at: po.timestamp,
        closed_at: po.closed_at,
        service_location_id: po.service_location_id || null,
        service_location_name: po.service_location_name,
        station_id: po.station_id || null,
        _sourceStationName: po.station_name,
        notes: po.notes,
        payments: po.payments,
        order_source: po.order_source ?? null,
        delivery_platform: po.delivery_platform ?? null,
        platform_order_number: po.platform_order_number ?? null,
        _isOnlineOrder: po._isOnlineOrder,
        reversals: po.reversals,
        order_refund_items: po.order_refund_items,
        _offlineUnsynced: po._offlineUnsynced,
      } as OrderProfile;
      // Overlay the live store copy's fresh financials while this order is still
      // open on this device — see liveOpenById above. Finalized rows (absent from
      // the map) keep their authoritative fetched values.
      const live =
        liveOpenById[mapped.id] ??
        (mapped.db_order_id ? liveOpenById[mapped.db_order_id] : undefined);
      if (!live) return mapped;
      // RECOMPUTE the live totals (same path as useOrderTotals) rather than read
      // live.service_charge / live.total_amount — those persisted scalars are
      // stale until _ensureTotalsFresh runs (which only happens once the order is
      // opened), so reading them showed the wrong SC on the first fetch. Computing
      // from the fresh items + live SC inputs matches the table view immediately.
      const t = calculateOrderTotalsForOrder(
        live.items,
        live.checkDiscount,
        live.payments ?? [],
        taxRatesMap,
        live,
      );
      return {
        ...mapped,
        items: live.items,
        service_charge: t.service_charge,
        service_charge_name:
          t.service_charge_name ||
          live.service_charge_name ||
          mapped.service_charge_name,
        service_charge_rate:
          live.service_charge_rate ?? mapped.service_charge_rate,
        total_amount: t.total_amount,
        total_cash_amount: t.cash_total_amount,
        total_tax: t.tax_amount,
        total_discount: t.discount_amount,
        amount_due: t.outstanding_total,
        amount_paid: live.amount_paid ?? mapped.amount_paid,
        session_id: live.session_id ?? mapped.session_id,
      };
    });
    const mappedHistory = dedupeOrdersById(rawMappedHistory);

    if (offlineLiveOrders.length === 0) return mappedHistory;

    // Offline: prepend the device's own live pending orders — but ONLY those
    // that match the active date window + channel/status/provider filters,
    // exactly like the server-filtered history rows. Without this, open orders
    // were pinned to EVERY tab and date (e.g. a dine-in order appearing under
    // the "Online" tab, or today's orders under "Yesterday").
    const liveOrdersInScope = offlineLiveOrders.filter((o) => {
      if (channelTab !== "all" && getChannelTab(o) !== channelTab) {
        return false;
      }
      if (!matchesStatus(o, statusFilter)) return false;
      if (channelTab === "online" && providerFilter !== "all") {
        if (getProviderKey(o) !== providerFilter) return false;
      }
      if (resolvedStartTs && resolvedEndTs) {
        // A live pending order is being worked on right now — if it has no
        // `opened_at` yet, treat it as "now" so it belongs to today's window.
        const t = new Date(o.opened_at ?? Date.now()).getTime();
        if (
          t < new Date(resolvedStartTs).getTime() ||
          t >= new Date(resolvedEndTs).getTime()
        ) {
          return false;
        }
      }
      return true;
    });
    if (liveOrdersInScope.length === 0) return mappedHistory;

    // Offline: prepend live pending orders, deduped against history (a finalized
    // order can be in both the cache and the live store). Live copy wins.
    const liveIds = new Set<string>();
    for (const o of liveOrdersInScope) {
      liveIds.add(o.id);
      if (o.db_order_id) liveIds.add(o.db_order_id);
    }
    const historyMinusLive = mappedHistory.filter(
      (o) =>
        !liveIds.has(o.id) && !(o.db_order_id && liveIds.has(o.db_order_id)),
    );

    // Blanket-prepending live orders ahead of history (as opposed to
    // inserting each one at its own day) only holds together for a
    // single-day window. Under a multi-day window (Last 7 Days / custom
    // range) a live order can sit on a different calendar day than the
    // orders immediately after it — e.g. a check left open since Thursday.
    // `groupOrdersByDay` only merges CONSECUTIVE same-day runs, so that
    // stray day fragments the "real" run for the same day further down into
    // a second header sharing the same key (`header-${dayStart}`), which is
    // exactly what the RecyclerListView "same key" warning was catching.
    // Insert each live order at its own day instead: next to that day's
    // existing run when history already has one, so it still leads that
    // day's rows, or in date-sorted position when it doesn't.
    const merged = [...historyMinusLive];
    const liveByDay = new Map<number, OrderProfile[]>();
    for (const o of liveOrdersInScope) {
      const day = dayKeyOf(o.opened_at ?? Date.now(), config);
      const bucket = liveByDay.get(day);
      if (bucket) bucket.push(o);
      else liveByDay.set(day, [o]);
    }
    for (const [day, orders] of liveByDay) {
      const runStart = merged.findIndex(
        (o) => dayKeyOf(o.opened_at ?? Date.now(), config) === day,
      );
      if (runStart !== -1) {
        merged.splice(runStart, 0, ...orders);
        continue;
      }
      let insertAt = merged.findIndex(
        (o) => dayKeyOf(o.opened_at ?? Date.now(), config) < day,
      );
      if (insertAt === -1) insertAt = merged.length;
      merged.splice(insertAt, 0, ...orders);
    }
    return merged;
  }, [
    previousOrders,
    offlineLiveOrders,
    liveOpenById,
    taxRatesMap,
    channelTab,
    statusFilter,
    providerFilter,
    resolvedStartTs,
    resolvedEndTs,
    dayGroupingConfig,
  ]);

  // The server already applied every filter and the sort — render as-is.
  // No client-side filter/sort/search pass exists any more; adding one back
  // would silently re-scope results to the loaded page.
  const visibleOrders = allOrders;

  // Day-separated groups for the list — consecutive same-day runs under
  // "Today" / "Yesterday" / "EEEE, MMMM d" headers. Keeps the server sort.
  const dayGroups = useMemo(
    () => groupOrdersByDay(visibleOrders, dayGroupingConfig),
    [visibleOrders, dayGroupingConfig],
  );

  // Flattened header+row array for FlashList — it recycles cells from one
  // flat `data`, so the day groupings from the ScrollView era (a header View
  // followed by a manual .map of rows) get interleaved into a single list here.
  const listItems = useMemo<PrevOrdersListItem[]>(() => {
    const items: PrevOrdersListItem[] = [];
    dayGroups.forEach((group, gi) => {
      items.push({
        kind: "header",
        dayStart: group.dayStart,
        title: group.title,
        count: group.orders.length,
        first: gi === 0,
      });
      for (const order of group.orders) {
        items.push({ kind: "row", order });
      }
    });
    if (__DEV__) {
      const seen = new Map<string, PrevOrdersListItem>();
      for (const item of items) {
        const key =
          item.kind === "header" ? `header-${item.dayStart}` : item.order.id;
        const prior = seen.get(key);
        if (prior) {
          console.error(
            "[PreviousOrders] DUPLICATE listItems KEY:",
            key,
            "\nfirst:",
            JSON.stringify(prior),
            "\nduplicate:",
            JSON.stringify(item),
          );
        } else {
          seen.set(key, item);
        }
      }
    }
    return items;
  }, [dayGroups]);

  // Mutation hooks
  const closeCheckMutation = useCloseCheck();
  const reopenCheckMutation = useReopenCheck();
  const voidOrderMutation = useVoidOrder();

  // ─── Row callbacks ──────────────────────────────────────
  const handlePress = useCallback((order: OrderProfile) => {
    setExpandedOrderId((prev) => (prev === order.id ? null : order.id));
  }, []);

  /** Ensure order is in store then open PaymentDetailBottomSheet to the given view */
  const openPaymentSheet = useCallback(
    (order: OrderProfile, view: "summary" | "refund" | "tipAdjust") => {
      const existing = useOrderStore.getState().ordersById[order.id];
      if (!existing) {
        useOrderStore.setState((state) => ({
          ordersById: { ...state.ordersById, [order.id]: order },
        }));
      }
      usePaymentDetailSheetStore.getState().open(order.id, view);
    },
    [],
  );

  const handleDoublePress = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "summary"),
    [openPaymentSheet],
  );

  const handleOpenNotes = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("notes");
  }, []);

  const handleOpenPrint = useCallback((order: OrderProfile) => {
    setSelectedOrderForReceipt(order);
  }, []);

  const handleViewTimeline = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "summary"),
    [openPaymentSheet],
  );

  const handleTipAdjust = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "tipAdjust"),
    [openPaymentSheet],
  );

  const handleCloseCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      closeCheckMutation.mutate(order.db_order_id);
    },
    [closeCheckMutation],
  );

  const handleReopenCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      reopenCheckMutation.mutate({ dbOrderId: order.db_order_id });
    },
    [reopenCheckMutation],
  );

  const handleRefund = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "refund"),
    [openPaymentSheet],
  );

  const handleVoidOrder = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      voidOrderMutation.mutate({ dbOrderId: order.db_order_id });
    },
    [voidOrderMutation],
  );

  const handleContinue = useCallback(
    (order: OrderProfile) => {
      const existing = useOrderStore.getState().ordersById[order.id];
      if (!existing) {
        useOrderStore.setState((state) => ({
          ordersById: { ...state.ordersById, [order.id]: order },
        }));
      }
      setActiveOrder(order.id);
      router.replace("/order-processing");
    },
    [setActiveOrder, router],
  );

  // ─── FlashList render ───────────────────────────────────
  const renderOrderRow = useCallback(
    (item: OrderProfile) => {
      const canContinue =
        item.paid_status !== "Paid" &&
        item.order_status !== "refunded" &&
        item.order_status !== "void";
      return (
        <PreviousOrderRow
          order={item}
          isExpanded={item.id === expandedOrderId}
          onPress={handlePress}
          onDoublePress={handleDoublePress}
          onPrint={handleOpenPrint}
          onViewTimeline={handleViewTimeline}
          onTipAdjust={handleTipAdjust}
          onViewNotes={handleOpenNotes}
          onCloseCheck={handleCloseCheck}
          onReopenCheck={handleReopenCheck}
          onRefund={handleRefund}
          onVoid={handleVoidOrder}
          onContinue={canContinue ? handleContinue : undefined}
        />
      );
    },
    [
      expandedOrderId,
      handlePress,
      handleDoublePress,
      handleOpenPrint,
      handleViewTimeline,
      handleTipAdjust,
      handleOpenNotes,
      handleCloseCheck,
      handleReopenCheck,
      handleRefund,
      handleVoidOrder,
      handleContinue,
    ],
  );

  // Dispatches each flattened item to a day header or an order row. Headers
  // and rows get separate `getItemType` pools below so FlashList never
  // recycles a header's cell into a row's (or vice versa).
  const renderListItem = useCallback(
    ({ item }: { item: PrevOrdersListItem }) =>
      item.kind === "header" ? (
        <DayHeader title={item.title} count={item.count} first={item.first} />
      ) : (
        renderOrderRow(item.order)
      ),
    [renderOrderRow],
  );

  const getItemType = useCallback((item: PrevOrdersListItem) => item.kind, []);

  const keyExtractor = useCallback(
    (item: PrevOrdersListItem) =>
      item.kind === "header" ? `header-${item.dayStart}` : item.order.id,
    [],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <View style={{ flex: 1, padding: s(16), backgroundColor: colors.screen }}>
        {/* ─── Sync / offline status ───────────────────────────
            Release builds strip the dev logs, so the mirror's state has to be
            visible: offline, first-sync in progress, or stale. */}
        {!rawIsOnline ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: s(10),
              paddingHorizontal: s(12),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.warning,
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                color: colors.warning,
                flex: 1,
                fontWeight: "600",
              }}
            >
              Offline — showing locally stored orders. New orders need a
              connection.
            </Text>
          </View>
        ) : isSyncing && !hasCompletedCycle ? (
          <SyncProgressBanner />
        ) : freshness.state === "stale" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: s(10),
              paddingHorizontal: s(12),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.warning,
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                color: colors.warning,
                flex: 1,
                fontWeight: "600",
              }}
            >
              Order history is stale — pull down to refresh.
            </Text>
          </View>
        ) : null}

        {/* ─── Control bar: date · search · status · sort ─
            One row, never scrolls at 1920px. Status and Sort are dropdowns, so
            the row's width is fixed regardless of how many options exist. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(10),
            marginBottom: s(10),
          }}
        >
          <DatePillRow
            activeLabel={dateWindowLabel}
            size="md"
            onSelect={handleDatePillSelect}
          />

          {/* Search — flexes to absorb the leftover width */}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8),
              paddingHorizontal: s(12),
              height: s(44),
            }}
          >
            <Search color={colors.label} size={s(16)} />
            <TextInput
              placeholder="Search order #, customer, phone, or source"
              placeholderTextColor={colors.muted}
              value={searchText}
              onChangeText={setSearchText}
              style={{
                marginLeft: s(8),
                fontSize: s(13),
                height: s(42),
                flex: 1,
                color: colors.heading,
              }}
            />
          </View>

          <ActiveFilterPill count={activeFilterCount} onClear={clearFilters} />

          <OrdersSelectDropdown
            prefix="Status:"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={handleStatusSelect}
            isActive={statusFilter !== "all"}
          />

          <OrdersSelectDropdown
            prefix="Sort:"
            options={SORT_OPTIONS}
            value={sortKey}
            onChange={handleSortSelect}
            isActive={sortKey !== "date_desc"}
          />
        </View>

        {/* ─── Channel tabs ────────────────────────────── */}
        <ChannelTabBar
          active={channelTab}
          counts={channelCounts}
          onSelect={handleChannelTabSelect}
        />

        {/* ─── Provider sub-row (Online tab only) ──────── */}
        {channelTab === "online" && providerRoster.length > 0 && (
          <View style={{ marginTop: s(10) }}>
            <ProviderChipRow
              roster={providerRoster}
              counts={providerCounts}
              totalCount={channelCounts.online}
              selected={providerFilter}
              onSelect={handleProviderSelect}
            />
          </View>
        )}

        {/* ─── Order List ──────────────────────────────── */}
        <View
          style={{
            flex: 1,
            marginTop: s(10),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
            position: "relative",
            backgroundColor: colors.panel,
          }}
        >
          {/* One page of rows, recycled through FlashList. Headers and rows
              are separate cell pools (`getItemType`) so a recycled cell never
              inherits the other kind's layout; `order.id` keying plus
              PreviousOrderRow's own memo comparator (keyed off order.id) means
              a cell landing on a different order always re-renders its content
              before paint. Paging, not scrolling, is how the merchant moves
              through the result set — a page tops out at 50 rows. */}
          <FlashList
            ref={scrollRef}
            style={{ flex: 1 }}
            data={listItems}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            estimatedItemSize={64}
            extraData={expandedOrderId}
            contentContainerStyle={{
              paddingBottom: s(16),
              backgroundColor: colors.panel,
            }}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            ListEmptyComponent={
              isInitialLoading && visibleOrders.length === 0 ? (
                <View style={{ paddingTop: s(4) }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: s(64),
                  }}
                >
                  <Text style={{ fontSize: s(20), color: colors.muted }}>
                    No orders found
                  </Text>
                  <Text
                    style={{
                      fontSize: s(14),
                      color: colors.muted,
                      marginTop: s(8),
                    }}
                  >
                    {historySource === "offline-local"
                      ? "No orders in the local window. Older data needs a connection."
                      : "Try adjusting your filters or search"}
                  </Text>
                </View>
              )
            }
            // Pager sits at the end of the rows, so it's reached by scrolling
            // to the bottom of the page rather than occupying fixed space
            // above the fold. Omitted while empty/loading, same as before.
            ListFooterComponent={
              listItems.length > 0 ? (
                <PaginationBar
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  totalCount={totalMatchingCount}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  isLoading={isPageLoading}
                  onPrev={handlePrevPage}
                  onNext={handleNextPage}
                />
              ) : null
            }
          />

          {/* Dim the page while the next one loads, so the outgoing rows stay
              in place instead of the list flashing empty between pages. */}
          {isPageLoading && (
            <View
              pointerEvents="none"
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: colors.panel + "AA",
              }}
            />
          )}

          {/* One thin indeterminate bar on ANY load (page turns, refreshes,
              filter/date switches — local or server). Deliberately not a
              spinner: no spinning circle in the loading UX. */}
          {(isInitialLoading || isPageLoading) && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: s(3),
                zIndex: 30,
              }}
            >
              <LoadingBar />
            </View>
          )}
        </View>

        {/* ─── Modals ──────────────────────────────────── */}
        <OrderNotesModal
          isOpen={activeModal === "notes"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <ReceiptModal
          isOpen={!!selectedOrderForReceipt}
          onClose={() => setSelectedOrderForReceipt(null)}
          order={selectedOrderForReceipt}
          location={selectedStore}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default PreviousOrdersScreen;
