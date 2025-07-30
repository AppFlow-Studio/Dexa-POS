import { MOCK_ORDERS } from "@/lib/mockData";
import { Order } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import OrderCard from "./OrderCard";
import OrderTabs from "./OrderTabs";

// Define a constant for the width of each card plus its margin for accurate scrolling
const CARD_WIDTH_WITH_MARGIN = 288 + 16; // 288px card width + 16px right margin

const OrderLineSection: React.FC = () => {
  // State for the active filter tab
  const [activeTab, setActiveTab] = useState("All");
  // State to hold the orders that are actually displayed
  const [filteredOrders, setFilteredOrders] = useState<Order[]>(MOCK_ORDERS);
  // Ref to control the FlatList for scrolling
  const flatListRef = useRef<FlatList>(null);
  // Ref to keep track of the current scroll position index
  const scrollIndexRef = useRef(0);

  // This effect runs whenever the activeTab changes
  useEffect(() => {
    if (activeTab === "All") {
      setFilteredOrders(MOCK_ORDERS);
    } else {
      const newFilteredOrders = MOCK_ORDERS.filter(
        (order) => order.type === activeTab
      );
      setFilteredOrders(newFilteredOrders);
    }
    // When the filter changes, scroll back to the beginning
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    scrollIndexRef.current = 0;
  }, [activeTab]); // Dependency array: only re-run if activeTab changes

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

  return (
    <View>
      <View className="flex-row justify-between items-center">
        <OrderTabs onTabChange={handleTabChange} />
        <View className="flex-row items-center space-x-2">
          <TouchableOpacity
            onPress={scrollBackward}
            className="p-2 bg-white border border-gray-200 rounded-full"
          >
            <ChevronLeft color="#374151" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={scrollForward}
            className="p-2 bg-blue-500 rounded-full"
          >
            <ChevronRight color="#FFFFFF" size={20} />
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
        renderItem={({ item }) => <OrderCard order={item} />}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center w-full">
            <Text className="text-gray-500">No orders for this category.</Text>
          </View>
        }
      />
    </View>
  );
};

export default OrderLineSection;
