import OrdersSelectDropdown, {
    ActiveFilterPill,
} from "@/components/previous-orders/OrdersSelectDropdown";
import PaginationBar from "@/components/previous-orders/PaginationBar";
import ProviderChipRow from "@/components/previous-orders/ProviderChipRow";
import { useHistoryFilterControls } from "@/hooks/pos/useHistoryFilterControls";
import { usePreviousOrdersListSync } from "@/hooks/pos/usePreviousOrdersListSync";
// Sort is driven by the table's column headers here (not a dropdown), so only
// the status options are needed.
import { SyncProgressBanner } from "@/components/db/SyncProgressBanner";
import { useLocalFreshness } from "@/hooks/db/useLocalFreshness";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
    getChannelTab,
    getProviderKey,
    matchesStatus,
    STATUS_OPTIONS,
    type ChannelTab,
    type SortKey,
} from "@/lib/previousOrdersFilters";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import {
    DEFAULT_HISTORY_FILTERS,
    historyFilterKey,
} from "@/services/historyOrderFilters";
import { useLocalDbSyncStore } from "@/stores/useLocalDbSyncStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import {
    resolveBusinessDayConfig,
    usePreviousOrdersStore,
} from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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

import { useShallow } from "zustand/react/shallow";
import OrderLineItemsModal from "../order/OrderLineItemsModal";
import DatePillRow, { type DatePillDef } from "./DatePillRow";
import OrderActionsMenu from "./OrderActionsMenu";
import OrdersTable, { SortColumn, SortDirection } from "./OrdersTable";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery" | "Online";

/**
 * This tab bar predates the shared channel taxonomy and labels its tabs in
 * display casing. Filtering is server-side now and keyed on `ChannelTab`, so
 * these maps are the single translation point — the order-type value sets that
 * used to drive local filtering are gone, along with the risk of the two
 * definitions of "Dine In" drifting apart.
 */
const TAB_TO_CHANNEL: Record<TabName, ChannelTab> = {
  All: "all",
  "Dine In": "dine_in",
  Takeaway: "takeout",
  Delivery: "delivery",
  Online: "online",
};

const CHANNEL_TO_TAB: Record<ChannelTab, TabName> = {
  all: "All",
  dine_in: "Dine In",
  takeout: "Takeaway",
  delivery: "Delivery",
  online: "Online",
};

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
  const { previousOrders } = usePreviousOrdersStore();
  const { rawIsOnline } = useNetworkStatus();

  // Sync / offline visibility — the same contract as the full Previous Orders
  // screen: first-sync in progress, offline, or stale. Release builds strip
  // the dev logs, so the mirror's state has to be on screen.
  const { isSyncing, hasCompletedCycle } = useLocalDbSyncStore();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const freshness = useLocalFreshness("orders", selectedStore?.id ?? null);
  // Business-day config for the day headers — same semantics as the date-window
  // filter, so after-midnight pre-rollover orders stay under "Yesterday".
  const dayGroupingConfig = useMemo(
    () => resolveBusinessDayConfig(),
    [selectedStore?.timezone, selectedStore?.business_day_start_hour],
  );

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
  // Resolved business-day bounds — used to scope the offline live orders to the
  // active date pill (they carry no server-side filtering of their own).
  const resolvedStartTs = usePreviousOrdersStore(
    (s) => s.dateWindow?._resolvedStartTs ?? null,
  );
  const resolvedEndTs = usePreviousOrdersStore(
    (s) => s.dateWindow?._resolvedEndTs ?? null,
  );
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { refresh: handleRefresh, isRefreshing } = usePreviousOrdersListSync();

  // Server-side filters, window-wide counts and page state — the same wiring
  // the full Previous Orders screen uses, so both surfaces agree on what each
  // tab means and neither filters a partially-loaded list.
  const {
    channelTab,
    providerFilter,
    statusFilter,
    sortKey,
    searchText: searchQuery,
    setSearchText: setSearchQuery,
    activeFilterCount,
    selectChannel,
    selectProvider,
    selectStatus,
    selectSort,
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
    goToPrevPage,
    goToNextPage,
  } = useHistoryFilterControls();
  // Store-driven loading flag: true during the initial fetch AND on every
  // filter/date-window switch (setDateWindow clears the list + flags a refetch).
  // Drives the empty-state spinner so a switch never shows "No orders found".
  const isFetching = usePreviousOrdersStore((s) => s._isRefreshing);

  // Release previous orders from memory when navigating away. Nothing is
  // persisted locally — the list is re-fetched from the backend on next entry
  // via usePreviousOrdersListSync. Pagination + refresh-throttle state is reset
  // so a re-entry starts from a clean keyset cursor and always re-fetches.
  // Both history surfaces now drive the same server-side filters, so entering
  // this one starts from a clean slate rather than inheriting whatever the
  // other screen was last filtered by — a narrowed list with no visible cause
  // is worse than a redundant refetch.
  useFocusEffect(
    useCallback(() => {
      usePreviousOrdersStore.setState({
        filters: { ...DEFAULT_HISTORY_FILTERS },
        _loadedFilterKey: historyFilterKey(DEFAULT_HISTORY_FILTERS),
        totalMatchingCount: null,
        pageIndex: 0,
        pageCount: 0,
      });
      return () => {
        usePreviousOrdersStore.setState({
          previousOrders: [],
          _orderLookup: {},
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
          pageIndex: 0,
          pageCount: 0,
          _isPageLoading: false,
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

  // Table header sort ⇄ server sort. The table exposes its own column model,
  // but only date and amount can be ordered by the backend, so those are the
  // only headers OrdersTable leaves tappable in `serverSorted` mode.
  const sortColumn: SortColumn = sortKey.startsWith("amount")
    ? "total"
    : "time";
  const sortDirection: SortDirection = sortKey.endsWith("asc") ? "asc" : "desc";

  const handleSort = useCallback(
    (column: SortColumn) => {
      const axis = column === "total" ? "amount" : "date";
      const currentAxis = sortKey.startsWith("amount") ? "amount" : "date";
      // Re-tapping the active column flips direction; a new column starts
      // descending, which is the useful default for both dates and amounts.
      const nextDir =
        axis === currentAxis && sortKey.endsWith("desc") ? "asc" : "desc";
      selectSort(`${axis}_${nextDir}` as SortKey);
    },
    [sortKey, selectSort],
  );
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
    return [...liveOrdersInScope, ...historyMinusLive];
  }, [
    previousOrders,
    offlineLiveOrders,
    channelTab,
    statusFilter,
    providerFilter,
    resolvedStartTs,
    resolvedEndTs,
  ]);

  // Compute per-tab counts
  // Counts describe the WHOLE date window, not the loaded page. The tab bar
  // speaks TabName; the store speaks ChannelTab — bridge here rather than
  // duplicating the taxonomy.
  const tabCounts = useMemo<TabCounts>(
    () => ({
      All: channelCounts.all,
      "Dine In": channelCounts.dine_in,
      Takeaway: channelCounts.takeout,
      Delivery: channelCounts.delivery,
      Online: channelCounts.online,
    }),
    [channelCounts],
  );

  const activeTab: TabName = CHANNEL_TO_TAB[channelTab] ?? "All";

  const handleTabChange = useCallback(
    (tabName: TabName) => selectChannel(TAB_TO_CHANNEL[tabName]),
    [selectChannel],
  );

  // The server already applied channel, provider, status, search and sort —
  // render its page as-is. Filtering here would re-scope the result to the
  // 50 rows currently loaded.
  const filteredOrders = allOrders;

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
      {/* Sync / offline status — mirrors the full Previous Orders screen so
          release builds always show why the list might be partial. */}
      {!rawIsOnline ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: s(6),
            paddingHorizontal: s(10),
            paddingVertical: s(6),
            borderRadius: s(6),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.warning,
          }}
        >
          <Text
            style={{
              fontSize: s(11),
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
        <SyncProgressBanner compact />
      ) : freshness.state === "stale" ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: s(6),
            paddingHorizontal: s(10),
            paddingVertical: s(6),
            borderRadius: s(6),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.warning,
          }}
        >
          <Text
            style={{
              fontSize: s(11),
              color: colors.warning,
              flex: 1,
              fontWeight: "600",
            }}
          >
            Order history is stale — pull down to refresh.
          </Text>
        </View>
      ) : null}

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

        {/* A non-default status or provider narrows the list from a control
            that may be collapsed or off-tab — keep it visible and clearable. */}
        <ActiveFilterPill count={activeFilterCount} onClear={clearFilters} />

        <OrdersSelectDropdown
          prefix="Status:"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={selectStatus}
          isActive={statusFilter !== "all"}
        />

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

      {/* Provider sub-row — Online tab only, and only when the location has
          online orders in this window. Resets to All Sources when the tab
          changes, so it can't linger as a hidden filter. */}
      {channelTab === "online" && providerRoster.length > 0 && (
        <View style={{ marginBottom: s(10) }}>
          <ProviderChipRow
            roster={providerRoster}
            counts={providerCounts}
            totalCount={channelCounts.online}
            selected={providerFilter}
            onSelect={selectProvider}
          />
        </View>
      )}

      {/* Orders Table Container - relative for absolute positioning of banner */}
      <View
        style={{
          flex: 1,
          position: "relative",
          backgroundColor: colors.screen,
        }}
      >
        {/* Orders Table - one server-sorted page at a time; the pager rides in
            the list footer so it's reached by scrolling to the bottom of the
            rows. resetScrollKey snaps the body back to the top on page turn. */}
        <OrdersTable
          resetScrollKey={pageIndex}
          orders={filteredOrders}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onMoreClick={handleMoreClick}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          isInitialLoading={isFetching}
          serverSorted
          groupByDay
          dayGroupingConfig={dayGroupingConfig}
          ListFooter={
            filteredOrders.length > 0 ? (
              <PaginationBar
                pageIndex={pageIndex}
                pageCount={pageCount}
                totalCount={totalMatchingCount}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                isLoading={isPageLoading}
                onPrev={goToPrevPage}
                onNext={goToNextPage}
              />
            ) : null
          }
        />
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
