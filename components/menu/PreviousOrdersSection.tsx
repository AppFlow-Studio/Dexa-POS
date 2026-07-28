import { usePreviousOrdersListSync } from "@/hooks/pos/usePreviousOrdersListSync";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import {
    DEFAULT_HISTORY_FILTERS,
    historyFilterKey,
} from "@/services/historyOrderFilters";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useFocusEffect } from "expo-router";
import { RefreshCw, Search, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
    Pressable,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import OrderLineItemsModal from "../order/OrderLineItemsModal";
import DatePillRow, { type DatePillDef } from "./DatePillRow";
import OrderActionsMenu from "./OrderActionsMenu";
import OrdersTable, { SortColumn, SortDirection } from "./OrdersTable";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery" | "Online";

const DINE_IN_VALUES = new Set(["Dine In", "dine_in"]);
const TAKEAWAY_VALUES = new Set(["Takeaway", "takeout"]);
const DELIVERY_VALUES = new Set(["Delivery", "delivery"]);

// Remove old OrderRow and RetrieveButton components - replaced by table view

interface TabCounts {
  All: number;
  "Dine In": number;
  Takeaway: number;
  Delivery: number;
  Online: number;
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
  counts: TabCounts;
  activeTab: TabName;
}

const OrderTabs: React.FC<OrderTabsProps> = ({
  onTabChange,
  counts,
  activeTab,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const TAB_NAMES: TabName[] = [
    "All",
    "Takeaway",
    "Dine In",
    "Delivery",
    "Online",
  ];

  return (
    <View
      className="flex-row self-start rounded-lg p-0.5"
      style={{
        height: s(36),
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: s(2),
      }}
    >
      {TAB_NAMES.map((name) => {
        const isActive = activeTab === name;
        const count = counts[name] ?? 0;
        return (
          <Pressable
            key={name}
            onPress={() => onTabChange(name)}
            className="flex-row items-center rounded-md gap-x-1.5"
            style={[
              {
                paddingHorizontal: s(14),
                alignSelf: "stretch",
                justifyContent: "center",
                borderRadius: s(6),
                borderWidth: 1,
              },
              isActive
                ? name === "Online"
                  ? {
                      backgroundColor: colors.info + "20",
                      borderColor: colors.info + "40",
                    }
                  : {
                      backgroundColor: colors.teal + "20",
                      borderColor: colors.teal + "40",
                    }
                : { borderColor: "transparent" },
            ]}
          >
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: isActive
                  ? name === "Online"
                    ? colors.info
                    : colors.teal
                  : colors.muted,
              }}
            >
              {name}
              {count > 0 ? ` (${count})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// Old OrderRow and RetrieveButton components removed - replaced by OrdersTable

const PreviousOrdersSection = () => {
  // Previous Orders is server-fetched ONLY — it renders exactly what
  // `previousOrders` (date-bounded fetch from the backend) returns. We do NOT
  // merge in live in-memory orders from useOrderStore anymore: a just-created /
  // unsynced order is not a "previous order" and was previously pinned to the
  // top of every date window (it has no backend row yet, so it bypassed the
  // date filter). It now appears here only once it syncs and a fetch/broadcast
  // surfaces it.
  const { previousOrders, newOrdersCount } = usePreviousOrdersStore();
  const { rawIsOnline } = useNetworkStatus();

  // OFFLINE ONLY: the backend is unreachable, so previousOrders can't refresh.
  // Surface the device's own non-final orders (active + working set + own-station
  // open) so staff still see everything pending — including open/unpaid orders
  // created while offline — each badged "Offline". When online this is empty and
  // the list stays server-fetched only.
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
        if (o.station_id !== s.currentStationId) continue; // own station only
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
        // Tag as offline/unsynced when it has no backend row yet.
        result.push(o.db_order_id ? o : { ...o, _offlineUnsynced: true });
      }
      return result;
    }),
  );
  const dateWindowLabel = usePreviousOrdersStore(
    (s) => s.dateWindow?.label ?? "today",
  );
  const setDateWindow = usePreviousOrdersStore((s) => s.setDateWindow);
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [activeTab, setActiveTab] = useState<TabName>("All");
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync();
  const loadMoreOrders = usePreviousOrdersStore((s) => s.loadMoreOrders);
  const isLoadingMore = usePreviousOrdersStore((s) => s._isLoadingMore);
  const hasMore = usePreviousOrdersStore((s) => s._hasMore);
  // Store-driven loading flag: true during the initial fetch AND on every
  // filter/date-window switch (setDateWindow clears the list + flags a refetch).
  // Drives the empty-state spinner so a switch never shows "No orders found".
  const isFetching = usePreviousOrdersStore((s) => s._isRefreshing);

  // Release previous orders from memory when navigating away. Nothing is
  // persisted locally — the list is re-fetched from the backend on next entry
  // via usePreviousOrdersListSync. Pagination + refresh-throttle state is reset
  // so a re-entry starts from a clean keyset cursor and always re-fetches.
  useFocusEffect(
    useCallback(() => {
      // This surface does its own client-side filtering over `previousOrders`
      // (see `filteredOrders` below) using local tab state. The Previous Orders
      // screen sets SERVER-side filters on the same shared store, so inheriting
      // those would filter the list twice — once by a control this screen
      // doesn't render, and again by its own tabs. Reset on entry so what's
      // fetched here is always the unfiltered window.
      usePreviousOrdersStore.setState({
        filters: { ...DEFAULT_HISTORY_FILTERS },
        _loadedFilterKey: historyFilterKey(DEFAULT_HISTORY_FILTERS),
        totalMatchingCount: null,
      });
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
          filters: { ...DEFAULT_HISTORY_FILTERS },
          _loadedFilterKey: historyFilterKey(DEFAULT_HISTORY_FILTERS),
          totalMatchingCount: null,
        });
      };
    }, []),
  );

  const handleDatePillSelect = useCallback(
    (pill: DatePillDef) => {
      const { startDate, endDate } = pill.getDateRange();
      setDateWindow({ startDate, endDate, label: pill.windowLabel });
    },
    [setDateWindow],
  );

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) void loadMoreOrders();
  }, [hasMore, isLoadingMore, loadMoreOrders]);

  // New state for table view
  const [sortColumn, setSortColumn] = useState<SortColumn>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null);

  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Server-fetched history mapped to OrderProfile. Online: this is exactly the
  // date-bounded backend fetch. Offline: offlineLiveOrders (the device's own
  // pending orders) is prepended so open/unpaid offline orders are visible too.
  const allOrders: OrderProfile[] = useMemo(() => {
    const mappedHistory: OrderProfile[] = previousOrders.map(
      (po) =>
        ({
          id: po.orderId,
          db_order_id: po.db_order_id,
          // Helper fields
          display_number: po.display_number,
          order_number: po.display_number,
          customer_name: po.customer,
          server_name: po.server,

          // Status mapping
          order_status: po.voided
            ? "void"
            : po.refunded
              ? "refunded"
              : po.closed_at
                ? "completed"
                : "pending", // Best guess mapping
          check_status: po.checkStatus || "Opened",
          paid_status: po.paymentStatus,

          // Type mapping
          order_type: po.type,

          // Items and totals
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

          // Timestamps
          opened_at: po.timestamp || po.opened_at,
          created_at: po.timestamp, // Ensure sort works if it uses created_at
          closed_at: po.closed_at,

          // Location/Station
          service_location_id: po.service_location_id || null, // strict null for type safety
          service_location_name: po.service_location_name,
          station_id: po.station_id || null,
          _sourceStationName: po.station_name,

          // Extras
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

  // Compute per-tab counts
  const tabCounts = useMemo<TabCounts>(() => {
    let dineIn = 0;
    let takeaway = 0;
    let delivery = 0;
    let online = 0;
    for (const o of allOrders) {
      const t = o.order_type ?? "";
      if (DINE_IN_VALUES.has(t)) dineIn++;
      else if (TAKEAWAY_VALUES.has(t)) takeaway++;
      else if (DELIVERY_VALUES.has(t)) delivery++;
      if (o._isOnlineOrder) online++;
    }
    return {
      All: allOrders.length,
      "Dine In": dineIn,
      Takeaway: takeaway,
      Delivery: delivery,
      Online: online,
    };
  }, [allOrders]);

  // Filter orders based on active tab and search query
  const filteredOrders = useMemo(() => {
    let filtered = allOrders;

    // Filter by tab
    if (activeTab === "Online") {
      filtered = filtered.filter((o) => o._isOnlineOrder);
    } else if (activeTab !== "All") {
      const tabSet =
        activeTab === "Dine In"
          ? DINE_IN_VALUES
          : activeTab === "Takeaway"
            ? TAKEAWAY_VALUES
            : DELIVERY_VALUES;
      filtered = filtered.filter((o) => tabSet.has(o.order_type ?? ""));
    }

    // Filter by search query (customer name or display number)
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((o) => {
        const customerName = (o.customer_name || "walk-in").toLowerCase();
        const displayNumber = String(o.display_number || "").toLowerCase();
        return customerName.includes(query) || displayNumber.includes(query);
      });
    }

    return filtered;
  }, [allOrders, activeTab, searchQuery]);

  const handleTabChange = (tabName: TabName) => setActiveTab(tabName);

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to descending
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Handle row click - open PaymentDetailBottomSheet
  const handleRowClick = (orderId: string) => {
    usePaymentDetailSheetStore.getState().open(orderId);
  };

  // Handle double-click - set order as active
  const handleDoubleClick = (orderId: string) => {
    useOrderStore.getState().setActiveOrder(orderId);
  };

  // Handle more button click - open actions menu
  const handleMoreClick = (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => {
    setMenuOrderId(orderId);
    if (position) {
      setMenuPosition(position);
    }
    setMenuOpen(true);
  };

  // Handle view details from menu — opens the PaymentDetailBottomSheet
  // (same as the main POS screens) instead of navigating to a separate route.
  const handleViewDetails = () => {
    if (menuOrderId) {
      usePaymentDetailSheetStore.getState().open(menuOrderId);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: s(12),
        paddingTop: s(12),
        backgroundColor: colors.screen,
      }}
    >
      {/* Header: Date Pills + Tabs + Search + Refresh */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(8),
          marginBottom: s(6),
        }}
      >
        <DatePillRow
          activeLabel={dateWindowLabel}
          onSelect={handleDatePillSelect}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(8),
          marginBottom: s(10),
        }}
      >
        <OrderTabs
          onTabChange={handleTabChange}
          counts={tabCounts}
          activeTab={activeTab}
        />

        {/* Search Bar */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: s(10),
            paddingVertical: s(6),
            borderRadius: s(8),
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search color={colors.muted} size={s(12)} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search orders..."
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              marginLeft: s(7),
              color: colors.heading,
              fontSize: s(12),
              padding: 0,
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X color={colors.muted} size={s(12)} />
            </TouchableOpacity>
          )}
        </View>

        {/* Refresh button */}
        <TouchableOpacity
          onPress={handleRefresh}
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(8),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <RefreshCw
            size={s(13)}
            color={isRefreshing ? colors.teal : colors.muted}
          />
        </TouchableOpacity>
      </View>

      {/* Orders Table Container - relative for absolute positioning of banner */}
      <View
        style={{
          flex: 1,
          position: "relative",
          backgroundColor: colors.screen,
        }}
      >
        {/* Orders Table - No ScrollView wrapper to avoid nested VirtualizedLists */}
        <OrdersTable
          orders={filteredOrders}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onMoreClick={handleMoreClick}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          isLoadingMore={isLoadingMore}
          isInitialLoading={isFetching}
        />

        {/* New Orders Banner - Floating */}
        {newOrdersCount > 0 && (
          <Animated.View
            entering={iosOnly(FadeIn.duration(200))}
            exiting={iosOnly(FadeOut.duration(200))}
            className="absolute top-4 left-0 right-0 items-center z-10"
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={() => void handleRefresh()}
              activeOpacity={0.8}
              className="flex-row items-center gap-2 px-4 py-2.5 rounded-full"
              style={{
                backgroundColor: colors.teal,
                shadowColor: colors.teal,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <RefreshCw size={s(13)} color={colors.onSolid} />
              <Text
                className="text-xs font-semibold"
                style={{ color: colors.onSolid }}
              >
                {newOrdersCount} new order{newOrdersCount > 1 ? "s" : ""} — tap
                to refresh
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Modals */}
      <OrderActionsMenu
        isOpen={isMenuOpen}
        onClose={() => setMenuOpen(false)}
        orderId={menuOrderId}
        onViewDetails={handleViewDetails}
        position={menuPosition}
      />

      <OrderLineItemsModal
        isOpen={isItemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        orderId={selectedOrderId}
      />
    </View>
  );
};

export default PreviousOrdersSection;
