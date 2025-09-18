import { CartItem } from "@/lib/types";
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

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="my-4 px-6 h-full">
        <View className="flex flex-row items-center justify-between">
          <Text className="text-3xl font-bold text-white">Cart</Text>
          <Text className="text-xl text-gray-300">{cart.length} Items</Text>
        </View>
        <View className="flex-1 h-full w-full">
          {/* 3. Assign the ref to the ScrollView */}
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
                          <View
                            className={`self-start px-3 py-2 rounded-full mb-2 ${isSent ? "bg-green-900/30 border border-green-500" : isActive ? "bg-blue-900/30 border border-blue-500" : "bg-[#303030] border border-gray-700"}`}
                          >
                            <Text
                              className={`text-xl font-semibold ${isSent ? "text-green-400" : isActive ? "text-blue-400" : "text-gray-300"}`}
                            >
                              Course {course}
                              {isSent ? " • Sent" : ""}
                            </Text>
                          </View>
                          {grouped[course].map((item, index) => {
                            const highlight = isActive;
                            return (
                              <View
                                key={`${item.id}-${index}`}
                                className={`rounded-xl mb-2 ${highlight ? "border border-blue-500" : ""}`}
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
                <Text className="text-2xl text-gray-400">Cart is empty.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default BillSummary;
