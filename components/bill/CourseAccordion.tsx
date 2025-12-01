import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
// import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'; // Will add later if needed
import { CartItem, OrderProfile } from "@/lib/types"; // Changed Order to OrderProfile
import BillItem from "./BillItem";

interface CourseAccordionProps {
  activeOrder: OrderProfile | undefined; // Changed type to OrderProfile
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
}

const CourseAccordion: React.FC<CourseAccordionProps> = ({
  activeOrder,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
}) => {
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);

  const groupedItems = useMemo(() => {
    const groups: Record<number, CartItem[]> = {};
    activeOrder?.items?.forEach((item) => {
      const course = itemCourseMap?.[item.id] ?? 1; // Default to Course 1
      if (!groups[course]) {
        groups[course] = [];
      }
      groups[course].push(item);
    });
    return groups;
  }, [activeOrder?.items, itemCourseMap]);

  const sortedCourses = useMemo(() => {
    return Object.keys(groupedItems)
      .map(Number)
      .sort((a, b) => a - b);
  }, [groupedItems]);

  const handleToggleCourse = (courseId: number) => {
    const newExpandedCourseId = expandedCourseId === courseId ? null : courseId;
    setExpandedCourseId(newExpandedCourseId);
    if (onSelectCourse) {
      onSelectCourse(newExpandedCourseId);
    }
  };

  if (!activeOrder) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400 text-lg">No active order.</Text>
      </View>
    );
  }

  const totalItems =
    activeOrder.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <View className="flex-1 bg-[#212121] p-4">
      {/* Main Header */}
      <View className="flex-row items-center justify-between pb-3 border-b border-gray-700 mb-3">
        <Text className="text-xl font-bold text-white">
          Order #{activeOrder.id?.substring(0, 8)}
        </Text>
        <Text className="text-lg text-gray-300">{totalItems} items</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {sortedCourses.length > 0 ? (
          sortedCourses.map((courseId) => {
            const isExpanded = expandedCourseId === courseId;
            const itemsInCourse = groupedItems[courseId] || [];
            const isSent = !!sentCourses?.[courseId];
            const courseItemCount = itemsInCourse.reduce(
              (sum, item) => sum + item.quantity,
              0
            );

            return (
              <View key={`course-${courseId}`} className="mb-2">
                <TouchableOpacity
                  onPress={() => handleToggleCourse(courseId)}
                  className={`flex-row items-center justify-between p-3 rounded-lg border ${
                    isExpanded
                      ? "border-blue-500 bg-blue-900/20"
                      : "border-gray-700 bg-[#303030]"
                  }`}
                >
                  <View className="flex-row items-center">
                    <Text className="text-lg font-semibold text-white">
                      Course {courseId}
                    </Text>
                    {isSent && (
                      <Text className="text-sm text-green-400 ml-2">
                        ✓ Sent
                      </Text>
                    )}
                    <Text className="text-sm text-gray-400 ml-2">
                      • {courseItemCount} item{courseItemCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Text className="text-white text-lg">
                    {isExpanded ? "▼" : "▶"}
                  </Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View className="mt-2 pl-4 gap-y-2">
                    {itemsInCourse.map((item) => (
                      <BillItem key={item.id} item={item} isEditable={true} />
                    ))}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View className="flex-1 items-center justify-center mt-10">
            <Text className="text-gray-400 text-lg">
              Add items to start an order.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default CourseAccordion;
