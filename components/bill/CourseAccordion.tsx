import { CartItem, OrderProfile } from "@/lib/types";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native"; // Added TouchableOpacity back for the Start Button
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import BillItem from "./BillItem";

// --- Types ---
interface CourseAccordionProps {
  activeOrder: OrderProfile | undefined;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
  onPressStartNewCourse: () => void;
  onDoubleTapCourse: (courseId: number) => void;
}

interface CourseGroupProps {
  courseId: number;
  items: CartItem[];
  isExpanded: boolean;
  isSent: boolean;
  isCurrent: boolean;
  onToggle: (id: number) => void;
  onDoubleTap: (id: number) => void;
}

// --- Sub-Component: CourseGroup ---
// We need this sub-component to safely use Hooks (useSharedValue) for each row
const CourseGroup: React.FC<CourseGroupProps> = ({
  courseId,
  items,
  isExpanded,
  isSent,
  isCurrent,
  onToggle,
  onDoubleTap,
}) => {
  const scale = useSharedValue(1);

  // Animation Style
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Gesture Definitions
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart(() => {
      // Trigger Animation
      scale.value = withSequence(
        withSpring(0.95, { damping: 10, stiffness: 200 }),
        withSpring(1)
      );
      // Call JS function safely
      runOnJS(onDoubleTap)(courseId);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    // Call JS function safely
    runOnJS(onToggle)(courseId);
  });

  // Exclusive: Double tap takes priority. If it fails, Single tap fires.
  const composedTap = Gesture.Exclusive(doubleTap, singleTap);

  const courseItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <View className="mb-2">
      {/* 1. The Header: Wrapped in GestureDetector */}
      <GestureDetector gesture={composedTap}>
        <Animated.View
          style={animatedStyle}
          className={`flex-row items-center justify-between p-3 rounded-lg border ${
            isExpanded
              ? "border-blue-500 bg-blue-900/20"
              : "border-gray-700 bg-[#303030]"
          }`}
        >
          <View className="flex-row items-center">
            {isCurrent && (
              <View className="w-2 h-2 bg-green-400 rounded-full mr-2" />
            )}
            <Text className="text-lg font-semibold text-white">
              Course {courseId}
            </Text>
            {isSent && (
              <Text className="text-sm text-green-400 ml-2">✓ Sent</Text>
            )}
            <Text className="text-sm text-gray-400 ml-2">
              • {courseItemCount} item{courseItemCount !== 1 ? "s" : ""}
            </Text>
          </View>
          <Text className="text-white text-lg">{isExpanded ? "▼" : "▶"}</Text>
        </Animated.View>
      </GestureDetector>

      {/* 2. The Content: Rendered OUTSIDE GestureDetector so items are clickable */}
      {isExpanded && (
        <View className="mt-2 pl-4 gap-y-2">
          {items.map((item) => (
            <BillItem key={item.id} item={item} isEditable={true} />
          ))}
        </View>
      )}
    </View>
  );
};

// --- Main Component ---
const CourseAccordion: React.FC<CourseAccordionProps> = ({
  activeOrder,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
}) => {
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);

  // Group items by course
  const groupedItems = useMemo(() => {
    const groups: Record<number, CartItem[]> = {};
    activeOrder?.items?.forEach((item) => {
      const course = itemCourseMap?.[item.id] ?? 1;
      if (!groups[course]) {
        groups[course] = [];
      }
      groups[course].push(item);
    });
    return groups;
  }, [activeOrder?.items, itemCourseMap]);

  // Sort course keys
  const sortedCourses = useMemo(() => {
    const coursesFromItems = Object.keys(groupedItems).map(Number);
    const allCourses = new Set(coursesFromItems);

    if (activeOrder && currentCourse !== undefined && currentCourse !== null) {
      allCourses.add(currentCourse);
    }

    return Array.from(allCourses).sort((a, b) => a - b);
  }, [groupedItems, activeOrder, currentCourse]);

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

  return (
    <View className="flex-1 bg-[#212121] p-4">
      {/* Main Header */}
      <View className="flex-row items-center justify-between pb-3 border-b border-gray-700 mb-3">
        <Text className="text-xl font-bold text-white">
          Order #{activeOrder.id?.substring(0, 8)}
        </Text>
        <TouchableOpacity
          onPress={onPressStartNewCourse}
          className="px-3 py-1.5 rounded-lg bg-green-600 border border-green-500"
          activeOpacity={0.8}
        >
          <Text className="font-semibold text-white text-base">
            ✨ Start New Course
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {sortedCourses.length > 0 ? (
          sortedCourses.map((courseId) => (
            <CourseGroup
              key={`course-${courseId}`}
              courseId={courseId}
              items={groupedItems[courseId] || []}
              isExpanded={expandedCourseId === courseId}
              isSent={!!sentCourses?.[courseId]}
              isCurrent={currentCourse === courseId}
              onToggle={handleToggleCourse}
              onDoubleTap={onDoubleTapCourse}
            />
          ))
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
