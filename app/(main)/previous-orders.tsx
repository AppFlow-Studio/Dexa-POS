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
    compareOrders,
    countChannelsFromSummaries,
    countProvidersFromSummaries,
    getChannelTab,
    getProviderKey,
    matchesSearch,
    matchesStatus,
    SORT_OPTIONS,
    STATUS_OPTIONS,
    type ChannelTab,
    type SortKey,
    type StatusFilter,
} from "@/lib/previousOrdersFilters";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { FlashList } from "@shopify/flash-list";
import { RefreshCw, Search } from "lucide-react-native";

import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
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

/** Rows a filtered list needs before it can scroll (and self-paginate) at 1080p. */
const MIN_ROWS_BEFORE_AUTOFILL = 12;
/** Slightly above the store's 2s load-more cooldown so each tick lands. */
const AUTOFILL_INTERVAL_MS = 2100;

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

  // Filter & sort state. Four orthogonal axes — channel tab, provider (Online
  // tab only), status and sort — replacing the old single-select pill strip
  // that mixed all four into one horizontally-scrolling row.
  const [searchText, setSearchText] = useState("");
  const [channelTab, setChannelTab] = useState<ChannelTab>("all");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync();

  // Leaving the Online tab drops the provider filter so it can never linger as
  // a hidden active filter behind a tab the user can't see it on.
  const handleChannelTabSelect = useCallback((tab: ChannelTab) => {
    setChannelTab(tab);
    if (tab !== "online") setProviderFilter("all");
  }, []);

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
  const loadMoreOrders = usePreviousOrdersStore((s) => s.loadMoreOrders);
  const isLoadingMore = usePreviousOrdersStore((s) => s._isLoadingMore);
  const hasMore = usePreviousOrdersStore((s) => s._hasMore);
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

  // Release previous orders from memory when navigating away (~10MB for 500
  // orders). Nothing is persisted locally — the list is re-fetched from the
  // backend on next entry via usePreviousOrdersListSync. Also reset pagination
  // state so a re-entry starts from a clean keyset cursor instead of resuming
  // the prior session's paging.
  useFocusEffect(
    useCallback(() => {
      return () => {
        usePreviousOrdersStore.setState({
          previousOrders: [],
          _orderLookup: {},
          newOrdersCount: 0,
          _isRefreshing: false,
          _currentOffset: 0,
          _hasMore: false,
          _isLoadingMore: false,
          _oldestCursor: null,
          lastHistoryRefreshAt: null,
          _lastRefreshLocationId: null,
          windowSummaries: null,
          windowSummariesTruncated: false,
        });
      };
    }, []),
  );

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) void loadMoreOrders();
  }, [hasMore, isLoadingMore, loadMoreOrders]);

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
  // The list is paginated 30 rows at a time, so counting `allOrders` counts the
  // loaded pages, not the date range — a June→July window read "Online 6" when
  // the range held far more. Counts and the provider roster come from the
  // discriminator-only summary fetch, which covers the whole window in one
  // round trip. Falls back to the loaded page until it resolves.
  const windowSummaries = usePreviousOrdersStore((s) => s.windowSummaries);

  const providerRoster = useMemo(
    () =>
      windowSummaries
        ? buildProviderRosterFromSummaries(windowSummaries)
        : buildProviderRoster(allOrders),
    [windowSummaries, allOrders],
  );

  // ─── Client-side filtering + sorting ───────────────────
  // Search + status apply to every tab, so tab counts stay consistent with what
  // the list will actually show once a tab is picked.
  const searchStatusFiltered = useMemo(
    () =>
      allOrders.filter(
        (o) => matchesSearch(o, searchText) && matchesStatus(o, statusFilter),
      ),
    [allOrders, searchText, statusFilter],
  );

  // While a search is active the counts must reflect the search, and summaries
  // carry no customer name/phone — so fall back to counting loaded rows there.
  const isSearching = searchText.trim().length > 0;

  const channelCounts = useMemo(() => {
    if (windowSummaries && !isSearching) {
      return countChannelsFromSummaries(windowSummaries, statusFilter);
    }
    const counts: Record<ChannelTab, number> = {
      all: searchStatusFiltered.length,
      online: 0,
      dine_in: 0,
      takeout: 0,
      delivery: 0,
    };
    for (const o of searchStatusFiltered) counts[getChannelTab(o)]++;
    return counts;
  }, [windowSummaries, isSearching, statusFilter, searchStatusFiltered]);

  const onlineOrders = useMemo(
    () => searchStatusFiltered.filter((o) => getChannelTab(o) === "online"),
    [searchStatusFiltered],
  );

  const providerCounts = useMemo(() => {
    if (windowSummaries && !isSearching) {
      return countProvidersFromSummaries(windowSummaries, statusFilter);
    }
    const counts: Record<string, number> = {};
    for (const o of onlineOrders) {
      const key = getProviderKey(o);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [windowSummaries, isSearching, statusFilter, onlineOrders]);

  const filteredOrders = useMemo(() => {
    let filtered =
      channelTab === "all"
        ? searchStatusFiltered
        : channelTab === "online"
          ? onlineOrders
          : searchStatusFiltered.filter((o) => getChannelTab(o) === channelTab);

    if (channelTab === "online" && providerFilter !== "all") {
      filtered = filtered.filter((o) => getProviderKey(o) === providerFilter);
    }

    return [...filtered].sort((a, b) => compareOrders(a, b, sortKey));
  }, [
    searchStatusFiltered,
    onlineOrders,
    channelTab,
    providerFilter,
    sortKey,
  ]);

  // Non-default filters that aren't visible as their own always-on control get
  // a pinned "N filters · Clear" pill so nothing is silently narrowing the list.
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (providerFilter !== "all" ? 1 : 0);

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setProviderFilter("all");
  }, []);

  // Filtering happens client-side over the pages loaded so far, so a narrow
  // filter can leave a handful of rows in a list too short to scroll — and a
  // list that can't scroll never fires onEndReached, stranding the merchant on
  // those rows while more matches sit unfetched. Keep pulling pages until the
  // filtered result can fill the viewport or the window is exhausted. The
  // store's own 2s load-more cooldown paces this, so it can't become a storm.
  const filteredCount = filteredOrders.length;
  useEffect(() => {
    if (!hasMore || isLoadingMore || isInitialLoading) return;
    if (filteredCount >= MIN_ROWS_BEFORE_AUTOFILL) return;
    const timer = setTimeout(() => {
      void loadMoreOrders();
    }, AUTOFILL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [
    hasMore,
    isLoadingMore,
    isInitialLoading,
    filteredCount,
    loadMoreOrders,
  ]);

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
            onChange={setStatusFilter}
            isActive={statusFilter !== "all"}
          />

          <OrdersSelectDropdown
            prefix="Sort:"
            options={SORT_OPTIONS}
            value={sortKey}
            onChange={setSortKey}
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
              totalCount={onlineOrders.length}
              selected={providerFilter}
              onSelect={setProviderFilter}
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
          {/* FlashList recycles row cells for smoother fling scrolling. Rows
              expand on tap, so `extraData={expandedOrderId}` is REQUIRED to
              re-render recycled cells when the expanded row changes, and
              `disableAutoLayout` is intentionally NOT set (variable-height rows
              need auto-layout correction). FlatList batching props have no
              FlashList equivalent. */}
          <FlashList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            extraData={expandedOrderId}
            estimatedItemSize={s(65)}
            drawDistance={500}
            ListEmptyComponent={
              isInitialLoading ? (
                <View style={{ paddingTop: s(4) }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
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
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
                colors={[colors.teal]}
              />
            }
            contentContainerStyle={{
              paddingBottom: s(16),
              backgroundColor: colors.panel,
            }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={{ paddingVertical: s(16), alignItems: "center" }}>
                  <ActivityIndicator size="small" color={colors.teal} />
                </View>
              ) : null
            }
          />

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
