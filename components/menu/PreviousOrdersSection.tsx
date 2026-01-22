import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { Search, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import OrderLineItemsModal from "../order/OrderLineItemsModal";
import OrderActionsMenu from "./OrderActionsMenu";
import OrdersTable, { SortColumn, SortDirection } from "./OrdersTable";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery";

interface Tab {
  name: TabName;
  count?: number;
}

// Remove old OrderRow and RetrieveButton components - replaced by table view

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
  totalOrder: number;
  activeTab: string;
}

const OrderTabs: React.FC<OrderTabsProps> = ({
  onTabChange,
  totalOrder,
  activeTab,
}) => {
  const TABS: Tab[] = [
    { name: "All", count: totalOrder },
    { name: "Dine In" },
    { name: "Takeaway" },
    { name: "Delivery" },
  ];

  const handlePress = (tabName: TabName) => {
    onTabChange(tabName);
  };

  return (
    <View className="bg-[#252525] border border-gray-700 p-1 rounded-lg flex-row self-start">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => handlePress(tab.name)}
            className={`py-2 px-4 rounded-md flex-row items-center ${
              isActive ? "bg-[#3a3a3a]" : ""
            }`}
          >
            <Text
              className={`font-semibold text-sm ${
                isActive ? "text-blue-400" : "text-gray-400"
              }`}
            >
              {tab.name}
            </Text>
            {tab.count !== undefined && tab.count > 0 && isActive && (
              <View className="bg-blue-500 rounded-full w-8 h-8 items-center justify-center ml-2 mt-0.5">
                <Text className="text-white font-bold text-xs">
                  {String(tab.count)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

// Old OrderRow and RetrieveButton components removed - replaced by OrdersTable

const PreviousOrdersSection = () => {
  const { ordersById } = useOrderStore();
  const { refreshPreviousOrders, previousOrders } = usePreviousOrdersStore();
  const { open: openPaymentDetailSheet } = usePaymentDetailSheetStore();
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

  // PHASE 3C: Subscribe to store changes
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPreviousOrders(); // Call the store action
    setIsRefreshing(false);
  };

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
          }) as OrderProfile,
      );

    // Combined list: Active Orders + Missing History Orders
    return [...activeOrders, ...mappedHistoryOrders];
  }, [ordersById, previousOrders]);

  const totalOrder = allOrders.length;
  // console.log("OrdersById Length", Object.keys(ordersById).length);
  // console.log("All Orders Length", allOrders.length);

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
    console.log(orderId)
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
          totalOrder={totalOrder || 0}
          activeTab={activeTab}
        />

        {/* Search Bar */}
        <View className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-2 flex-row items-center flex-1 max-w-md">
          <Search color="#9CA3AF" size={18} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by order number or customer name..."
            placeholderTextColor="#6B7280"
            className="flex-1 ml-2 text-white text-sm"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              className="ml-2 p-1"
            >
              <X color="#9CA3AF" size={18} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Orders Table */}
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
