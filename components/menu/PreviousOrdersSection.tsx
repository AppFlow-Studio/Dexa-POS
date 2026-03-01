import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { RefreshCw, Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import OrderLineItemsModal from "../order/OrderLineItemsModal";
import OrderActionsMenu from "./OrderActionsMenu";
import OrdersTable, { SortColumn, SortDirection } from "./OrdersTable";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery";

// Remove old OrderRow and RetrieveButton components - replaced by table view

interface TabCounts {
  All: number;
  "Dine In": number;
  Takeaway: number;
  Delivery: number;
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
  counts: TabCounts;
  activeTab: string;
}

const OrderTabs: React.FC<OrderTabsProps> = ({
  onTabChange,
  counts,
  activeTab,
}) => {
  const TAB_NAMES: TabName[] = ["All", "Takeaway", "Dine In", "Delivery"];

  return (
    <View
      className="bg-panel p-1 rounded-lg flex-row self-start"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {TAB_NAMES.map((name) => {
        const isActive = activeTab === name;
        const count = counts[name] ?? 0;
        return (
          <Pressable
            key={name}
            onPress={() => onTabChange(name)}
            className={`py-2 px-4 rounded-md flex-row items-center ${
              isActive ? "bg-surface" : ""
            }`}
          >
            <Text
              className="font-semibold text-sm"
              style={{ color: isActive ? colors.teal : colors.label }}
            >
              {name}
            </Text>
            <Text
              className="font-semibold text-sm ml-1"
              style={{ color: isActive ? colors.teal : colors.muted }}
            >
              ({count})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// Old OrderRow and RetrieveButton components removed - replaced by OrdersTable

const PreviousOrdersSection = () => {
  // CRITICAL FIX: Use proper selector instead of destructuring entire store
  const ordersById = useOrderStore((s) => s.ordersById);
  const { open: openPaymentDetailSheet } = usePaymentDetailSheetStore();
  const {
    refreshPreviousOrders,
    previousOrders,
    newOrdersCount,
    checkForNewOrders,
    clearNewOrdersCount,
  } = usePreviousOrdersStore();
  const [activeTab, setActiveTab] = useState("All");
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Initial load and background check for new orders every 15 seconds
  useEffect(() => {
    // Initial fetch when screen loads
    refreshPreviousOrders();

    // Set up interval to check for new orders every 15 seconds
    const intervalId = setInterval(() => {
      checkForNewOrders();
    }, 15000); // 15 seconds

    // Cleanup interval when component unmounts
    return () => {
      clearInterval(intervalId);
      clearNewOrdersCount(); // Reset counter when leaving screen
    };
  }, []);

  // Handle refresh (called from pull-to-refresh or banner tap)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshPreviousOrders(); // This also clears newOrdersCount
    setIsRefreshing(false);
  }, [refreshPreviousOrders]);

  // Handle new orders banner tap
  const handleNewOrdersBannerTap = useCallback(async () => {
    await handleRefresh();
  }, [handleRefresh]);

  // Get all orders - combine previous orders selector with local orders for compatibility
  const allOrders: OrderProfile[] = useMemo(() => {
    // 1. Get Active/Local Orders (excluding drafts/empties as per existing logic)
    const activeOrders = Object.values(ordersById).filter(
      (o: OrderProfile) =>
        o.order_status !== "draft" ||
        (o.order_status == "draft" && o.items.length > 0),
    );

    // Create sets for O(1) lookup of active orders to prevent duplicates
    const activeIds = new Set(activeOrders.map((o) => o.id));
    const activeDbIds = new Set(
      activeOrders.map((o) => o.db_order_id).filter(Boolean),
    );

    // 2. Map Previous Orders to OrderProfile format
    // Filter out any that are already in activeOrders to avoid duplicates
    const mappedHistoryOrders: OrderProfile[] = previousOrders
      .filter((po) => {
        // Exclude if ID matches or DB_ID matches an active order
        if (activeIds.has(po.orderId)) return false;
        if (po.db_order_id && activeDbIds.has(po.db_order_id)) return false;
        return true;
      })
      .map(
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
            order_status: po.refunded
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
            amount_paid: po.amount_paid,
            amount_due: po.amount_due,

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
            reversals: po.reversals,
            order_refund_items: po.order_refund_items,
          }) as OrderProfile,
      );

    // Combined list: Active Orders + Missing History Orders
    return [...activeOrders, ...mappedHistoryOrders];
  }, [ordersById, previousOrders]);

  // Compute per-tab counts
  const tabCounts = useMemo<TabCounts>(() => {
    let dineIn = 0;
    let takeaway = 0;
    let delivery = 0;
    for (const o of allOrders) {
      switch (o.order_type) {
        case "Dine In":
          dineIn++;
          break;
        case "Takeaway":
          takeaway++;
          break;
        case "Delivery":
          delivery++;
          break;
      }
    }
    return {
      All: allOrders.length,
      "Dine In": dineIn,
      Takeaway: takeaway,
      Delivery: delivery,
    };
  }, [allOrders]);

  // Filter orders based on active tab and search query
  const filteredOrders = useMemo(() => {
    let filtered = allOrders;

    // Filter by tab
    if (activeTab !== "All") {
      filtered = filtered.filter(
        (o) => o.order_type === activeTab && o.items.length > 0,
      );
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

  const handleTabChange = (tabName: TabName) => {
    setActiveTab(tabName);
  };

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

  // Handle row click - open payment detail bottom sheet
  const handleRowClick = (orderId: string) => {
    // DEBUG: console.log(orderId);
    openPaymentDetailSheet(orderId);
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

  // Handle view details from menu
  const handleViewDetails = () => {
    if (menuOrderId) {
      openPaymentDetailSheet(menuOrderId);
    }
  };

  return (
    <View className="flex-1 ">
      {/* Header with Tabs and Search */}
      <View className="flex-row justify-between items-center mb-4 gap-x-4">
        <OrderTabs
          onTabChange={handleTabChange}
          counts={tabCounts}
          activeTab={activeTab}
        />

        {/* Search Bar */}
        <View
          className="bg-panel rounded-lg p-2 flex-row items-center flex-1 max-w-md"
          style={{ borderWidth: 1, borderColor: colors.border }}
        >
          <Search color={colors.label} size={18} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by order number or customer name..."
            placeholderTextColor={colors.muted}
            className="flex-1 ml-2 text-white text-sm"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              className="ml-2 p-1"
            >
              <X color={colors.label} size={18} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Orders Table Container - relative for absolute positioning of banner */}
      <View className="flex-1 relative">
        {/* Orders Table - No ScrollView wrapper to avoid nested VirtualizedLists */}
        <OrdersTable
          orders={filteredOrders}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onRowClick={handleRowClick}
          onDoubleClick={handleDoubleClick}
          onMoreClick={handleMoreClick}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
        />

        {/* New Orders Banner - Floating */}
        {newOrdersCount > 0 && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute top-4 left-0 right-0 items-center z-10"
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={handleNewOrdersBannerTap}
              activeOpacity={0.8}
              className="flex-row items-center gap-2 px-5 py-3 rounded-full bg-green-600 shadow-lg"
              style={{
                shadowColor: "#22c55e",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <RefreshCw size={16} color="#fff" />
              <Text className="text-white font-semibold text-sm">
                {newOrdersCount} New Order{newOrdersCount > 1 ? "s" : ""} - Tap
                to Refresh
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
