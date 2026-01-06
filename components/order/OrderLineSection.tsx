import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import OrderCard from "./OrderCard";
import OrderLineItemsModal from "./OrderLineItemsModal";
import OrderTabs from "./OrderTabs";

// Define a constant for the width of each card plus its margin for accurate scrolling
const CARD_WIDTH_WITH_MARGIN = 288 + 16; // 288px card width + 16px right margin

const OrderLineSection: React.FC = () => {
  // OPTIMIZED: Use granular selectors instead of full store destructure
  const ordersById = useOrderStore((s) => s.ordersById);
  const markAllItemsAsReady = useOrderStore((s) => s.markAllItemsAsReady);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);

  // Memoize the orders array transformation
  const orders = useMemo(() => Object.values(ordersById), [ordersById]);

  // State for the active filter tab
  const [activeTab, setActiveTab] = useState("All");
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        // Exclude Dine In orders - they belong on Tables view
        o.order_type !== "Dine In" &&
        o.order_type !== "dine_in" &&
        o.items?.length > 0 &&
        o.order_status !== "completed" &&
        o.order_status !== "draft" &&
        (o.order_status === "preparing" || o.paid_status !== "Paid") &&
        o.order_status !== "void"
    );
  }, [orders]);

  const orderCounts = useMemo(() => {
    return {
      All: visibleOrders.length,
      Takeaway: visibleOrders.filter(
        (o) => o.order_type === "takeout" || o.order_type === "Takeaway"
      ).length,
      Delivery: visibleOrders.filter(
        (o) => o.order_type === "delivery" || o.order_type === "Delivery"
      ).length,
    };
  }, [visibleOrders]);

  const totalOrder = orders.filter(
    (o) =>
      (o.order_type !== "dine_in" &&
        o.order_type !== "Dine In" &&
        // Condition 1: Must be in preparing state
        o.order_status === "preparing" &&
        // Condition 2: Must have one or more items
        o.items.length > 0) ||
      (o.paid_status === "Unpaid" &&
        o.order_status !== "completed" &&
        o.order_status !== "draft")
  ).length;

  // Map tab names to order_type values for filtering
  const tabToOrderType: Record<string, string[]> = {
    Takeaway: ["takeout", "Takeaway"],
    Delivery: ["delivery", "Delivery"],
  };

  // State to hold the orders that are actually displayed
  const filteredOrders = useMemo(() => {
    if (activeTab === "All") {
      return visibleOrders;
    }
    const orderTypes = tabToOrderType[activeTab] || [activeTab];
    return visibleOrders.filter((o) => orderTypes.includes(o.order_type ?? ""));
  }, [visibleOrders, activeTab]);

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
    archiveOrder(orderId);
  };

  const handleRetrieve = (orderId: string) => {
    setActiveOrder(orderId);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
    >
      <View className="flex-row justify-between items-center">
        <OrderTabs onTabChange={handleTabChange} counts={orderCounts} />

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={scrollBackward}
            className="p-2 bg-[#303030] border border-gray-600 rounded-full"
          >
            <ChevronLeft color="#9CA3AF" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={scrollForward}
            className="p-2 bg-blue-600 rounded-full"
          >
            <ChevronRight color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredOrders.slice().reverse()}
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
            onRetrieve={() => handleRetrieve(item.id)}
          />
        )}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center w-full">
            <Text className="text-lg text-gray-400">
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
    </Animated.View>
  );
};

export default OrderLineSection;
