import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import OrderCard from "./OrderCard";
import OrderLineItemsModal from "./OrderLineItemsModal";
import OrderTabs from "./OrderTabs";

// Define a constant for the width of each card plus its margin for accurate scrolling
const CARD_WIDTH_WITH_MARGIN = 288 + 16; // 288px card width + 16px right margin

const OrderLineSection: React.FC = () => {
  const { orders, markAllItemsAsReady } = useOrderStore();

  // State for the active filter tab
  const [activeTab, setActiveTab] = useState("All");
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const totalOrder = orders.filter(
    (o) => o.order_status === "Preparing" || o.order_status === "Ready"
  ).length;

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    // Show only orders that are in a "kitchen" state (not closed)
    const kitchenOrders = orders.filter(
      (o) =>
        // Condition 1: Must be in Preparing or Ready state (not closed)
        o.order_status === "Preparing" &&
        // Condition 2: Must have one or more items
        o.items.length > 0
    );

    // This part of the logic remains the same
    if (activeTab === "All") {
      return kitchenOrders;
    }
    return kitchenOrders.filter((o) => o.order_type === activeTab);
  }, [orders, activeTab]);

  // Ref to control the FlatList for scrolling
  const flatListRef = useRef<FlatList>(null);
  // Ref to keep track of the current scroll position index
  const scrollIndexRef = useRef(0);

  // Function passed to OrderTabs to update the state
  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
  };

  // Function to scroll to the next card
  const scrollForward = () => {
    if (scrollIndexRef.current < filteredOrders.length - 1) {
      scrollIndexRef.current += 1;
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
        viewPosition: 0, // Aligns the card to the left edge
      });
    }
  };

  // Function to scroll to the previous card
  const scrollBackward = () => {
    if (scrollIndexRef.current > 0) {
      scrollIndexRef.current -= 1;
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
        viewPosition: 0,
      });
    }
  };

  const handleViewItems = (orderId: string) => {
    setSelectedOrderId(orderId);
    setItemsModalOpen(true);
  };

  const handleCompleteOrder = (orderId: string) => {
    // Sync order status based on item statuses
    // updateOrderStatus(orderId, "Ready");
    markAllItemsAsReady(orderId);
  };

  return (
    <View>
      <View className="flex-row justify-between items-center">
        <OrderTabs onTabChange={handleTabChange} totalOrder={totalOrder} />
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={scrollBackward}
            className="p-3 bg-[#303030] border border-gray-600 rounded-full"
          >
            <ChevronLeft color="#9CA3AF" size={24} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={scrollForward}
            className="p-3 bg-blue-600 rounded-full"
          >
            <ChevronRight color="#FFFFFF" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-4"
        getItemLayout={(data, index) => ({
          length: CARD_WIDTH_WITH_MARGIN,
          offset: CARD_WIDTH_WITH_MARGIN * index,
          index,
        })}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onViewItems={() => handleViewItems(item.id)}
            onComplete={() => handleCompleteOrder(item.id)}
          />
        )}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center w-full">
            <Text className="text-2xl text-gray-400">
              No orders for this category.
            </Text>
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

export default OrderLineSection;
