import { useToast } from "@/contexts/ToastContext";
import { usePreviousOrders } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore"; // New import
import { Eye, Plus, Repeat2, Search, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import OrderLineItemsModal from "../order/OrderLineItemsModal";
import { deduplicateOrders } from "@/utils/orderUtils";

// Define types for props
type TabName = "All" | "Dine In" | "Takeaway" | "Delivery";

interface Tab {
  name: TabName;
  count?: number;
}

interface OrderTabsProps {
  onTabChange: (tab: TabName) => void;
  totalOrder: number;
}

const OrderTabs: React.FC<OrderTabsProps> = ({ onTabChange, totalOrder }) => {
  const [activeWindow, setActiveWindow] = useState("All");
  const TABS: Tab[] = [
    { name: "All", count: totalOrder },
    { name: "Dine In" },
    { name: "Takeaway" },
    { name: "Delivery" },
  ];

  const handlePress = (tabName: TabName) => {
    setActiveWindow(tabName);
    onTabChange(tabName);
  };

  return (
    <View className="bg-[#303030] border border-gray-600 p-1 rounded-xl flex-row self-start">
      {TABS.map((tab) => {
        const isActive = activeWindow === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => handlePress(tab.name)}
            className={`py-2.5 px-4 rounded-lg flex-row items-center ${isActive ? "bg-[#212121]" : ""
              }`}
          >
            <Text
              className={`font-semibold ${isActive ? "text-blue-400" : "text-gray-400"
                }`}
            >
              {tab.name}
            </Text>
            {tab.count !== undefined && tab.count > 0 && (
              <View className="bg-blue-500 rounded-full w-6 h-6 items-center justify-center ml-2">
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

interface OrderRowProps {
  order: any;
  onViewItems: () => void;
  onAssignToBill: () => void;
}

const OrderRow: React.FC<OrderRowProps> = ({
  order,
  onViewItems,
  onAssignToBill,
}) => {
  const isReady = order.order_status === "ready";
  const statusBg = isReady ? "bg-green-600/20" : "bg-yellow-600/20";
  const statusText = isReady ? "text-green-400" : "text-yellow-400";

  // Calculate outstanding amount and partial payment status
  const amountPaid = order.amount_paid || 0;
  const totalAmount = order.total_amount || 0;
  const outstandingAmount = Math.max(0, totalAmount - amountPaid);
  const isPartiallyPaid = amountPaid > 0 && order.paid_status !== "Paid";

  // Payment status badge styling
  let paidBg, paidText, paidLabel;
  if (order.paid_status === "Paid") {
    paidBg = "bg-green-600/20";
    paidText = "text-green-400";
    paidLabel = "Paid";
  } else if (isPartiallyPaid) {
    paidBg = "bg-orange-600/20";
    paidText = "text-orange-400";
    paidLabel = "Partial";
  } else if (order.paid_status === "Pending") {
    paidBg = "bg-yellow-600/20";
    paidText = "text-yellow-400";
    paidLabel = "Pending";
  } else {
    paidBg = "bg-red-600/20";
    paidText = "text-red-400";
    paidLabel = order.paid_status || "Unpaid";
  }

  return (
    <View className="bg-[#303030] p-3 rounded-lg border border-gray-700 mb-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1.5">
            <View className={`px-2 py-0.5 rounded-full ${statusBg}`}>
              <Text className={`text-xs font-bold ${statusText}`}>
                {order.order_status}
              </Text>
            </View>
            <View className={`px-2 py-0.5 rounded-full ${paidBg}`}>
              <Text className={`text-xs font-bold ${paidText}`}>
                {paidLabel}
              </Text>
            </View>
          </View>
          <Text className="text-lg font-bold text-white mb-1">
            {order.customer_name || "Walk-In"} {order?.display_number}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-gray-400">
              {order.order_type}
              {order.service_location_id && (
                <> • Table {order.service_location_id}</>
              )}
            </Text>
            {/* Show total amount */}
            <Text className="text-sm text-gray-300">
              • ${totalAmount.toFixed(2)}
            </Text>
          </View>

          {/* Show source station for orders from other stations */}
          {order._sourceStationName && order.station_id !== useOrderStore.getState().currentStationId && (
            <View className="flex-row items-center mt-1">
              <Repeat2 color="#3b82f6" size={12} />
              <Text className="text-blue-400 text-xs ml-1">
                From: {order._sourceStationName}
              </Text>
            </View>
          )}

          {/* Show outstanding amount for unpaid/partial orders */}
          {order.paid_status !== "Paid" && outstandingAmount > 0 && (
            <View className="mt-1 flex-row items-center">
              <Text className="text-sm text-yellow-400 font-bold">
                Outstanding: ${outstandingAmount.toFixed(2)}
              </Text>
              {isPartiallyPaid && (
                <Text className="text-xs text-gray-500 ml-2">
                  (Paid: ${amountPaid.toFixed(2)})
                </Text>
              )}
            </View>
          )}
        </View>
        <View className="flex-col flex items-end gap-y-2">
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onViewItems}
              className="flex-row items-center justify-center p-2 rounded-lg border border-gray-600 bg-[#212121]"
            >
              <Eye color="#9CA3AF" size={14} />
              <Text className="font-semibold text-white ml-1.5 text-sm">
                View Items
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAssignToBill}
              className="flex-row items-center justify-center p-2 rounded-lg bg-blue-600"
            >
              <Plus color="#FFFFFF" size={14} />
              <Text className="font-semibold text-white ml-1.5 text-sm">
                Add to Bill
              </Text>
            </TouchableOpacity>
          </View>

          {order.paid_status !== "Paid" && (
            <View className="w-full">
              <RetrieveButton orderId={order.id} outstandingAmount={outstandingAmount} />
            </View>
          )}

          <Text className="text-xs text-gray-400 text-right w-full">
            {new Date(order.opened_at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    </View>
  );
};

const RetrieveButton = ({
  orderId,
  outstandingAmount
}: {
  orderId: string;
  outstandingAmount: number;
}) => {
  const { setActiveOrder } = useOrderStore();
  return (
    <TouchableOpacity
      onPress={() => setActiveOrder(orderId)}
      className="flex-row items-center justify-center p-2 rounded-lg bg-green-700"
    >
      <Text className="font-semibold text-white text-sm">
        Pay ${outstandingAmount.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
};

const PreviousOrdersSection = () => {
  const { orders, ordersByDbId, orderIds, activeOrderId, addItemToActiveOrder, generateCartItemId } =
    useOrderStore();
  const { refreshPreviousOrders } = usePreviousOrdersStore(); // Access refresh action

  const { show } = useToast();
  const [activeTab, setActiveTab] = useState("All");
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false); // New state for refreshing
  const [searchQuery, setSearchQuery] = useState(""); // New state for search

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshPreviousOrders(); // Call the store action
    setIsRefreshing(false);
  };
  // Phase 4: Use selector for view_scope-aware filtering
  // showCompleted: true to include all orders in history view
  // const previousOrders = usePreviousOrders({ showCompleted: false });

  // Get all orders - combine previous orders selector with local orders for compatibility
  const allOrders = useMemo(() => {
    // Merge selector results with any local orders not yet in the selector
    // const deduplicatedOrdersAr = deduplicateOrders(previousOrders);
    // const selectorOrderIds = new Set(deduplicatedOrdersAr.map(o => o.id));
    const localOrdersNotInSelector = Object.values(ordersByDbId).filter(
      (o) =>  o.order_status !== "draft"
    );
    return [...localOrdersNotInSelector];
  }, [ordersByDbId]);

  const totalOrder = allOrders.length;

  // Filter orders based on active tab and search query
  const filteredOrders = useMemo(() => {
    let filtered = allOrders;

    // Filter by tab
    if (activeTab !== "All") {
      filtered = filtered.filter(
        (o) => o.order_type === activeTab && o.items.length > 0
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

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleAssignToBill = (orderId: string) => {
    if (!activeOrderId) {
      show({
        title: "No Active Order",
        message: "Please start a new order before adding items.",
        type: "error",
      });
      return;
    }

    const previousOrder = orders.find((o) => o.id === orderId);
    if (!previousOrder) {
      show({
        title: "Order Not Found",
        message: "The selected previous order could not be found.",
        type: "error",
      });
      return;
    }

    if (!previousOrder.items || previousOrder.items.length === 0) {
      show({
        title: "No Items to Add",
        message: "This previous order has no items to add to the bill.",
        type: "warning",
      });
      return;
    }

    // Add items from the previous order to the current active order
    let addedCount = 0;
    previousOrder.items.forEach((item) => {
      // Create a new item with a unique ID for the current order
      const newItem = {
        ...item,
        id: generateCartItemId(item.menuItemId, item.customizations),
        isDraft: false,
      };
      addItemToActiveOrder(newItem);
      addedCount++;
    });

    show({
      title: "Items Added",
      message: `${addedCount} items from the previous order have been added to the current bill.`,
      type: "success",
    });
  };

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4 gap-x-4">
        <OrderTabs onTabChange={handleTabChange} totalOrder={totalOrder || 0} />
         {/* Search Bar */}
        <View className="bg-[#303030] border border-gray-600 rounded-xl p-1 mb-4 flex-row items-center w-1/2">
          <Search color="#9CA3AF" size={20} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by order number or customer name..."
            placeholderTextColor="#6B7280"
            className="flex-1 ml-3 text-white text-base"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              className="ml-2 p-1"
            >
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          )}
        </View>
      </View>

     

      <FlatList
        data={filteredOrders.slice().reverse()}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        refreshControl={
          // New prop for pull-to-refresh
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            onViewItems={() => handleViewItems(item.id)}
            onAssignToBill={() => handleAssignToBill(item.id)}
          />
        )}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center w-full">
            <Text className="text-gray-400">No previous orders found.</Text>
          </View>
        }
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
