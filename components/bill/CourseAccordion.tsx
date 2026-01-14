import { CartItem, OrderProfile } from "@/lib/types";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
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

// --- Sub-Component: CourseGroup with Animations ---
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
  const contentHeight = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  // Animate content height and opacity when expanded state changes
  useEffect(() => {
    if (isExpanded) {
      contentHeight.value = withTiming(1, { duration: 250 });
      contentOpacity.value = withTiming(1, { duration: 200 });
    } else {
      contentOpacity.value = withTiming(0, { duration: 150 });
      contentHeight.value = withTiming(0, { duration: 200 });
    }
  }, [isExpanded]);

  // Header tap animation
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Content container animation
  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    maxHeight: contentHeight.value === 0 ? 0 : undefined,
    overflow: "hidden" as const,
  }));

  // Chevron rotation animation
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: withTiming(isExpanded ? "90deg" : "0deg", { duration: 200 }) },
    ],
  }));

  // Gesture Definitions
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart(() => {
      scale.value = withSequence(
        withSpring(0.95, { damping: 10, stiffness: 200 }),
        withSpring(1)
      );
      runOnJS(onDoubleTap)(courseId);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    scale.value = withSequence(
      withSpring(0.98, { damping: 15, stiffness: 300 }),
      withSpring(1)
    );
    runOnJS(onToggle)(courseId);
  });

  const composedTap = Gesture.Exclusive(doubleTap, singleTap);

  const courseItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Animated.View layout={LinearTransition.duration(200)} className="mb-2">
      {/* Header */}
      <GestureDetector gesture={composedTap}>
        <Animated.View
          style={animatedHeaderStyle}
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
          <Animated.View style={chevronStyle}>
            <Text className="text-white text-lg">▶</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Content with Animation */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.duration(200)}
          className="mt-2 pl-4 gap-y-2 overflow-hidden"
        >
          {items.map((item) => (
            <Animated.View
              key={item.id}
              layout={LinearTransition.duration(150)}
              className="overflow-hidden"
            >
              <BillItem item={item} isEditable={true} />
            </Animated.View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
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
  const prevItemCount = useRef<number>(0);

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

  // Track previous values to prevent re-triggering
  const prevCurrentCourse = useRef<number | undefined>(currentCourse);

  // Auto-expand logic: When items are added, expand the current/working course
  useEffect(() => {
    const currentItemCount = activeOrder?.items?.length ?? 0;

    // Only auto-expand when items are ADDED (count increased)
    if (
      currentItemCount > prevItemCount.current &&
      currentCourse !== undefined
    ) {
      // Auto-expand the current working course, collapsing others
      setExpandedCourseId(currentCourse);
    }

    prevItemCount.current = currentItemCount;
  }, [activeOrder?.items?.length, currentCourse]);

  // Also auto-expand when currentCourse changes (e.g., "Start New Course")
  useEffect(() => {
    // Only trigger when currentCourse actually changes to a new value
    if (
      currentCourse !== undefined &&
      currentCourse !== null &&
      currentCourse !== prevCurrentCourse.current
    ) {
      setExpandedCourseId(currentCourse);
      prevCurrentCourse.current = currentCourse;
    }
  }, [currentCourse]);

  const handleToggleCourse = (courseId: number) => {
    // Toggle: if already expanded, collapse; otherwise expand this one (collapsing others)
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
          Order {activeOrder.display_number 
            ? (activeOrder.display_number.startsWith('#') ? activeOrder.display_number : `#${activeOrder.display_number}`)
            : activeOrder.order_number 
              ? `#${activeOrder.order_number}`
              : activeOrder.db_order_id 
                ? `#${activeOrder.db_order_id.substring(0, 8)}`
                : `#${activeOrder.id?.split('_').pop()?.substring(0, 8)}`}
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
        <Animated.View layout={LinearTransition.duration(250)}>
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
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default CourseAccordion;
