import { CartItem } from "@/lib/types"; // Use your global CartItem type
import React from "react";
import { ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

// 1. The component now accepts a `cart` array as a prop
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
  return (
    <View className="flex-1 bg-[#212121]">
      <View className="my-4 px-4 h-full">
        <View className="flex flex-row items-center justify-between">
          <Text className="text-xl font-bold text-white">Cart</Text>
          <Text className="text-sm text-gray-300">{cart.length} Items</Text>
        </View>
        <View className="flex-1 h-full w-full">
          <ScrollView
            showsVerticalScrollIndicator={true}
            className="flex-1 h-full my-2"
            nestedScrollEnabled={true}
          >
            {cart.length > 0 ? (
              (() => {
                // Group items by course number
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
                      const isActive = currentCourse !== undefined && course === currentCourse;
                      return (
                        <View key={`course-${course}`} className="mb-3">
                          <View className={`self-start px-2 py-1 rounded-full mb-2 ${isSent ? "bg-green-900/30 border border-green-500" : isActive ? "bg-blue-900/30 border border-blue-500" : "bg-[#303030] border border-gray-700"}`}>
                            <Text className={`text-xs font-semibold ${isSent ? "text-green-400" : isActive ? "text-blue-400" : "text-gray-300"}`}>Course {course}{isSent ? " • Sent" : ""}</Text>
                          </View>
                          {grouped[course].map((item, index) => {
                            const highlight = isActive;
                            return (
                              <View key={`${item.id}-${index}`} className={`rounded-xl mb-2 ${highlight ? "border border-blue-500" : ""}`}>
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
              <View className="h-24 items-center justify-center">
                <Text className="text-gray-400">Cart is empty.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
      {/* <View className="absolute bottom-0 left-0 right-0 ">
        <Image
          source={images.paperEffect}
          className="w-full"
          resizeMode="cover"
        />
      </View> */}
    </View>
  );
};

export default BillSummary;
