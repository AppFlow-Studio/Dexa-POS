import DatePillRow, { type DatePillDef } from "@/components/menu/DatePillRow";
import ChannelTabBar from "@/components/previous-orders/ChannelTabBar";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import OrdersSelectDropdown, {
    ActiveFilterPill,
} from "@/components/previous-orders/OrdersSelectDropdown";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import ProviderChipRow, {
    type ProviderFilter,
} from "@/components/previous-orders/ProviderChipRow";
import ReceiptModal from "@/components/receipts/ReceiptModal";
import {
    useCloseCheck,
    useReopenCheck,
    useVoidOrder,
} from "@/hooks/orders/useOrderActions";
import { usePreviousOrdersListSync } from "@/hooks/pos/usePreviousOrdersListSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
    buildProviderRoster,
    buildProviderRosterFromSummaries,
    countChannelsFromSummaries,
    countProvidersFromSummaries,
    SORT_OPTIONS,
    STATUS_OPTIONS,
    type ChannelTab,
    type SortKey,
    type StatusFilter,
} from "@/lib/previousOrdersFilters";
import { iosOnly } from "@/lib/safeAnimations";
import {
    DEFAULT_HISTORY_FILTERS,
    historyFilterKey,
} from "@/services/historyOrderFilters";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import {
    HISTORY_PAGE_SIZE,
    usePreviousOrdersStore,
} from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
} from "lucide-react-native";

import { useFocusEffect, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    cancelAnimation,
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

/** Idle time after the last keystroke before a search hits the server. */
const SEARCH_DEBOUNCE_MS = 350;

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

// ─── Pagination Bar ─────────────────────────────────────────
/**
 * Fixed pagination bar below the list.
 *
 * The list shows exactly one page at a time, so this bar is the only way to
 * move through the result set — and because it's always visible (rather than
 * an affordance you have to scroll to the bottom to discover), the merchant can
 * always see how much there is and where they are.
 */
const PaginationBar = ({
  pageIndex,
  pageCount,
  totalCount,
  rangeStart,
  rangeEnd,
  isLoading,
  onPrev,
  onNext,
}: {
  pageIndex: number;
  pageCount: number;
  totalCount: number | null;
  rangeStart: number;
  rangeEnd: number;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const canPrev = pageIndex > 0 && !isLoading;
  const canNext = pageIndex < pageCount - 1 && !isLoading;

  const PagerButton = ({
    label,
    icon,
    enabled,
    onPress,
  }: {
    label: string;
    icon: React.ReactNode;
    enabled: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(6),
        height: s(44),
        paddingHorizontal: s(16),
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: enabled ? colors.border : colors.border + "60",
        backgroundColor: enabled ? colors.card : "transparent",
        opacity: enabled ? 1 : 0.45,
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: s(13),
          fontWeight: "700",
          color: enabled ? colors.heading : colors.muted,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        gap: s(12),
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.panel,
      }}
    >
      <PagerButton
        label="Previous"
        icon={
          <ChevronLeft
            size={s(16)}
            color={canPrev ? colors.heading : colors.muted}
          />
        }
        enabled={canPrev}
        onPress={onPrev}
      />

      <View style={{ alignItems: "center", gap: s(2) }}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "600",
                color: colors.heading,
                fontVariant: ["tabular-nums"],
              }}
            >
              {totalCount === 0
                ? "No orders"
                : `${rangeStart}–${rangeEnd} of ${totalCount ?? "…"}`}
            </Text>
            {pageCount > 0 && (
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  fontVariant: ["tabular-nums"],
                }}
              >
                Page {pageIndex + 1} of {pageCount}
              </Text>
            )}
          </>
        )}
      </View>

      <PagerButton
        label="Next"
        icon={
          <ChevronRight
            size={s(16)}
            color={canNext ? colors.heading : colors.muted}
          />
        }
        enabled={canNext}
        onPress={onNext}
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

  // Expand/collapse state
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Scroll position is per-page: landing on page 2 halfway down would look like
  // the list simply grew. Reset to the top whenever the page changes.
  const scrollRef = useRef<ScrollView>(null);

  // ─── Filter & sort state ───
  // Owned by the store and applied SERVER-side. The screen renders whatever the
  // server matched, in the order the server returned it — it does not filter,
  // sort or search locally. That's what makes "Amount high–low" mean the
  // highest in the date range (not the highest of the loaded page) and a search
  // cover the whole range.
  const filters = usePreviousOrdersStore((s) => s.filters);
  const setFilters = usePreviousOrdersStore((s) => s.setFilters);
  const totalMatchingCount = usePreviousOrdersStore(
    (s) => s.totalMatchingCount,
  );
  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync();

  const channelTab = filters.channel as ChannelTab;
  const providerFilter = filters.provider as ProviderFilter;
  const statusFilter = filters.status as StatusFilter;
  const sortKey = filters.sort as SortKey;

  // Search is debounced: every keystroke would otherwise clear the list and
  // fire a refetch. Local state drives the input so typing stays responsive;
  // the committed value is what reaches the store.
  const [searchText, setSearchText] = useState(filters.search);
  useEffect(() => {
    if (searchText === filters.search) return;
    const timer = setTimeout(
      () => setFilters({ search: searchText }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchText, filters.search, setFilters]);

  // Leaving the Online tab drops the provider filter so it can never linger as
  // a hidden active filter behind a tab the user can't see it on.
  const handleChannelTabSelect = useCallback(
    (tab: ChannelTab) => {
      setFilters({
        channel: tab,
        ...(tab !== "online" ? { provider: "all" } : {}),
      });
    },
    [setFilters],
  );

  const handleProviderSelect = useCallback(
    (provider: ProviderFilter) => setFilters({ provider }),
    [setFilters],
  );
  const handleStatusSelect = useCallback(
    (status: StatusFilter) => setFilters({ status }),
    [setFilters],
  );
  const handleSortSelect = useCallback(
    (sort: SortKey) => setFilters({ sort }),
    [setFilters],
  );

  // Store-driven loading flag: true during the initial fetch AND on every
  // filter/date-window switch (setDateWindow clears the list + flags a refetch).
  // Drives the skeleton rows so a switch never flashes "No orders found".
  const isInitialLoading = usePreviousOrdersStore((s) => s._isRefreshing);

  // Date window
  const dateWindowLabel = usePreviousOrdersStore(
    (s) => s.dateWindow?.label ?? "today",
  );
  const setDateWindow = usePreviousOrdersStore((s) => s.setDateWindow);
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
  const { previousOrders, newOrdersCount } = usePreviousOrdersStore();
  const pageIndex = usePreviousOrdersStore((s) => s.pageIndex);
  const pageCount = usePreviousOrdersStore((s) => s.pageCount);
  const isPageLoading = usePreviousOrdersStore((s) => s._isPageLoading);
  const goToPage = usePreviousOrdersStore((s) => s.goToPage);
  const { rawIsOnline } = useNetworkStatus();

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
          newOrdersCount: 0,
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

  const handlePrevPage = useCallback(() => {
    void goToPage(pageIndex - 1);
  }, [goToPage, pageIndex]);

  const handleNextPage = useCallback(() => {
    void goToPage(pageIndex + 1);
  }, [goToPage, pageIndex]);

  // 1-based inclusive range of the rows on screen, for "51–100 of 312".
  const rangeStart =
    previousOrders.length === 0 ? 0 : pageIndex * HISTORY_PAGE_SIZE + 1;
  const rangeEnd = pageIndex * HISTORY_PAGE_SIZE + previousOrders.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // An expanded row from the previous page has no meaning on this one.
    setExpandedOrderId(null);
  }, [pageIndex]);

  // Server-fetched history mapped to OrderProfile. Online: exactly the
  // date-bounded backend fetch. Offline: offlineLiveOrders (the device's own
  // pending orders) is prepended so open/unpaid offline orders show too.
  const allOrders: OrderProfile[] = useMemo(() => {
    const mappedHistory: OrderProfile[] = previousOrders.map(
      (po) =>
        ({
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
          _isOnlineOrder: po._isOnlineOrder,
          reversals: po.reversals,
          order_refund_items: po.order_refund_items,
          _offlineUnsynced: po._offlineUnsynced,
        }) as OrderProfile,
    );

    if (offlineLiveOrders.length === 0) return mappedHistory;

    // Offline: prepend live pending orders, deduped against history (a finalized
    // order can be in both the cache and the live store). Live copy wins.
    const liveIds = new Set<string>();
    for (const o of offlineLiveOrders) {
      liveIds.add(o.id);
      if (o.db_order_id) liveIds.add(o.db_order_id);
    }
    const historyMinusLive = mappedHistory.filter(
      (o) =>
        !liveIds.has(o.id) && !(o.db_order_id && liveIds.has(o.db_order_id)),
    );
    return [...offlineLiveOrders, ...historyMinusLive];
  }, [previousOrders, offlineLiveOrders]);

  // ─── Window-wide counts ────────────────────────────────
  // Counts describe the whole date window, not the loaded pages, and come from
  // a discriminator-only summary query that applies the same search + status
  // the list does. Channel and provider are excluded from that query since
  // they're the axes being counted.
  const windowSummaries = usePreviousOrdersStore((s) => s.windowSummaries);

  const providerRoster = useMemo(
    () =>
      windowSummaries
        ? buildProviderRosterFromSummaries(windowSummaries)
        : buildProviderRoster(allOrders),
    [windowSummaries, allOrders],
  );

  const channelCounts = useMemo<Record<ChannelTab, number>>(
    () =>
      windowSummaries
        ? countChannelsFromSummaries(windowSummaries, "all")
        : { all: 0, online: 0, dine_in: 0, takeout: 0, delivery: 0 },
    [windowSummaries],
  );

  const providerCounts = useMemo(
    () =>
      windowSummaries
        ? countProvidersFromSummaries(windowSummaries, "all")
        : {},
    [windowSummaries],
  );

  // The server already applied every filter and the sort — render as-is.
  // No client-side filter/sort/search pass exists any more; adding one back
  // would silently re-scope results to the loaded pages.
  const visibleOrders = allOrders;

  // Non-default filters that aren't visible as their own always-on control get
  // a pinned "N filters · Clear" pill so nothing is silently narrowing the list.
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (providerFilter !== "all" ? 1 : 0);

  const clearFilters = useCallback(() => {
    setFilters({ status: "all", provider: "all" });
  }, [setFilters]);

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
  const renderItem = useCallback(
    ({ item }: { item: OrderProfile }) => {
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <View style={{ flex: 1, padding: s(16), backgroundColor: colors.screen }}>
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
          {/* One page of rows in a plain ScrollView — no virtualization.
              At 50 rows per page the whole page is cheap to mount, and
              rendering every row outright avoids the recycling artefacts that
              a list of expandable rows is prone to (a recycled cell keeping the
              previous row's expanded height). Paging, not scrolling, is how the
              merchant moves through the result set. */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              paddingBottom: s(16),
              backgroundColor: colors.panel,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
                colors={[colors.teal]}
              />
            }
          >
            {isInitialLoading && visibleOrders.length === 0 ? (
              <View style={{ paddingTop: s(4) }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </View>
            ) : visibleOrders.length === 0 ? (
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
                  Try adjusting your filters or search
                </Text>
              </View>
            ) : (
              <>
                {visibleOrders.map((item) => (
                  <React.Fragment key={item.id}>
                    {renderItem({ item })}
                  </React.Fragment>
                ))}

                {/* Pager sits at the end of the rows, so it's reached by
                    scrolling to the bottom of the page rather than occupying
                    fixed space above the fold. */}
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
              </>
            )}
          </ScrollView>

          {/* Dim the page while the next one loads, so the outgoing rows stay
              in place instead of the list flashing empty between pages. */}
          {isPageLoading && (
            <View
              pointerEvents="none"
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: colors.panel + "AA",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          )}

          {/* New Orders Banner */}
          {newOrdersCount > 0 && (
            <Animated.View
              entering={iosOnly(FadeIn.duration(200))}
              exiting={iosOnly(FadeOut.duration(200))}
              style={{
                position: "absolute",
                top: s(16),
                left: 0,
                right: 0,
                alignItems: "center",
                zIndex: 10,
              }}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                  paddingHorizontal: s(20),
                  paddingVertical: s(12),
                  borderRadius: 999,
                  backgroundColor: colors.teal,
                  shadowColor: colors.teal,
                  shadowOffset: { width: 0, height: s(4) },
                  shadowOpacity: 0.3,
                  shadowRadius: s(8),
                  elevation: 8,
                }}
              >
                <RefreshCw size={s(16)} color={colors.onSolid} />
                <Text
                  style={{
                    color: colors.onSolid,
                    fontWeight: "600",
                    fontSize: s(14),
                  }}
                >
                  {newOrdersCount} New Order{newOrdersCount > 1 ? "s" : ""} -
                  Tap to Refresh
                </Text>
              </TouchableOpacity>
            </Animated.View>
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
