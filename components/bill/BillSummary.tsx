import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

interface BillSummaryProps {
  cart: CartItem[];
  expandedItemId?: string | null;
  onToggleExpand?: (itemId: string) => void;
  currentCourse?: number;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
}

const BillSummary: React.FC<BillSummaryProps> = ({
  cart,
  expandedItemId,
  onToggleExpand,
  currentCourse,
  itemCourseMap,
  sentCourses,
}) => {
  // 1. Create a ref for the ScrollView
  const scrollViewRef = useRef<ScrollView>(null);

  // 2. useEffect to scroll to bottom when cart items change
  useEffect(() => {
    if (cart.length > 0) {
      // Use setTimeout to ensure the layout has updated before scrolling
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [cart.length]);

  const { activeOrderId, orders } = useOrderStore();

  // Get the active order to display status badges
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  return (
    <View className="flex-1 bg-[#212121]">

      <View className=" px-6 h-full">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-col items-start justify-start">
            <Text className="text-gray-400 text-base font-medium mb-1">
              {activeOrderId}
            </Text>
            <Text className="text-3xl font-bold text-white">Cart</Text>
            <View className="h-1 w-16 bg-blue-600 rounded-full mt-2" />
          </View>
          <Text className="text-lg text-gray-300">{cart.length} Items</Text>
        </View>
        <View className="flex-1 h-full w-full">
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={true}
            className="flex-1 h-full my-2"
            nestedScrollEnabled={true}
          >
            {cart.length > 0 ? (
              (() => {
                const grouped: Record<number, CartItem[]> = {};
                cart.forEach((item) => {
                  const course = itemCourseMap?.[item.id] ?? 1;
                  if (!grouped[course]) grouped[course] = [];
                  grouped[course].push(item);
                });
                const courses = Object.keys(grouped)
                  .map((c) => Number(c))
                  .sort((a, b) => a - b);

                return (
                  <View>
                    {courses.map((course) => {
                      const isSent = !!sentCourses?.[course];
                      const isActive =
                        currentCourse !== undefined && course === currentCourse;
                      return (
                        <View key={`course-${course}`} className="mb-3">
                          <View className="flex-row items-center justify-between">
                            <View
                              className={`self-start px-2 py-1 rounded-full mb-2 ${
                                isSent
                                  ? "bg-green-900/30 border border-green-500"
                                  : isActive
                                  ? "bg-blue-900/30 border border-blue-500"
                                  : "bg-[#303030] border border-gray-700"
                              }`}
                            >
                              <Text
                                className={`text-xs font-semibold ${
                                  isSent
                                    ? "text-green-400"
                                    : isActive
                                    ? "text-blue-400"
                                    : "text-gray-300"
                                }`}
                              >
                                Course {course}
                                {isSent ? " • Sent" : ""}
                              </Text>
                            </View>
                            {/* Status Badges */}
                            {activeOrder && (
                              <View className="flex-row gap-2 ml-2">
                                {/* Paid Status Badge */}
                                <View
                                  className={`px-2 py-1 rounded-full ${
                                    activeOrder.paid_status === "Paid"
                                      ? "bg-green-900/30 border border-green-500"
                                      : activeOrder.paid_status === "Pending"
                                      ? "bg-yellow-900/30 border border-yellow-500"
                                      : "bg-red-900/30 border border-red-500"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      activeOrder.paid_status === "Paid"
                                        ? "text-green-400"
                                        : activeOrder.paid_status === "Pending"
                                        ? "text-yellow-400"
                                        : "text-red-400"
                                    }`}
                                  >
                                    {activeOrder.paid_status}
                                  </Text>
                                </View>

                                {/* Order Status Badge */}
                                <View
                                  className={`px-2 py-1 rounded-full ${
                                    activeOrder.order_status === "Building"
                                      ? "bg-blue-900/30 border border-blue-500"
                                      : activeOrder.order_status === "Preparing"
                                      ? "bg-orange-900/30 border border-orange-500"
                                      : activeOrder.order_status === "Ready"
                                      ? "bg-green-900/30 border border-green-500"
                                      : "bg-gray-900/30 border border-gray-500"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      activeOrder.order_status === "Building"
                                        ? "text-blue-400"
                                        : activeOrder.order_status ===
                                          "Preparing"
                                        ? "text-orange-400"
                                        : activeOrder.order_status === "Ready"
                                        ? "text-green-400"
                                        : "text-gray-400"
                                    }`}
                                  >
                                    {activeOrder.order_status}
                                  </Text>
                                </View>

                                {/* Check Status Badge */}
                                <View
                                  className={`px-2 py-1 rounded-full ${
                                    activeOrder.check_status === "Opened"
                                      ? "bg-purple-900/30 border border-purple-500"
                                      : "bg-gray-900/30 border border-gray-500"
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      activeOrder.check_status === "Opened"
                                        ? "text-purple-400"
                                        : "text-gray-400"
                                    }`}
                                  >
                                    {activeOrder.check_status}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                          {grouped[course].map((item, index) => {
                            const highlight = isActive;
                            return (
                              <View
                                key={`${item.id}-${index}`}
                                className={`rounded-xl mb-1.5 ${
                                  highlight ? "border border-blue-500" : ""
                                }`}

                              >
                                <BillItem
                                  item={item}
                                  isEditable={true}
                                  expandedItemId={expandedItemId}
                                  onToggleExpand={onToggleExpand}
                                />
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                );
              })()
            ) : (
              <View className="h-full items-center justify-center">
                <Text className="text-xl text-gray-400">Cart is empty.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default BillSummary;
