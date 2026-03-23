import { CartItem, OrderProfile } from "@/lib/types";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native-reanimated";
import { ChevronDown, ChevronRight, Plus, Send } from "lucide-react-native";
import { colors } from "@/lib/theme";
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
  onOpenServerSheet?: () => void;
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

// --- Helpers ---
type AggregateKitchenStatus = "sent" | "preparing" | "ready" | "served" | null;

const BADGE_CONFIG: Record<
  NonNullable<AggregateKitchenStatus>,
  { bg: string; text: string; label: string }
> = {
  sent: { bg: "bg-amber-600/20", text: "text-amber-400", label: "Queued" },
  preparing: { bg: "bg-orange-600/20", text: "text-orange-400", label: "Preparing" },
  ready: { bg: "bg-green-600/20", text: "text-green-400", label: "Ready" },
  served: { bg: "bg-emerald-900/30", text: "text-emerald-500", label: "Served" },
};

function deriveAggregateStatus(items: CartItem[]): AggregateKitchenStatus {
  if (items.length === 0) return null;
  if (items.every((i) => i.kitchen_status === "served")) return "served";
  if (items.every((i) => i.kitchen_status === "ready" || i.kitchen_status === "served")) return "ready";
  if (items.some((i) => i.kitchen_status === "preparing")) return "preparing";
  if (items.some((i) => i.kitchen_status === "sent")) return "sent";
  return null;
}

// --- Sub-Component: CourseGroup with Animations ---
const CourseGroup: React.FC<CourseGroupProps> = React.memo(({
  courseId,
  items,
  isExpanded,
  isSent,
  isCurrent,
  onToggle,
  onDoubleTap,
}) => {
  const scale = useSharedValue(1);

  // Header tap animation
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Gesture Definitions
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart(() => {
      scale.value = withSequence(
        withSpring(0.95, { damping: 10, stiffness: 200 }),
        withSpring(1),
      );
      runOnJS(onDoubleTap)(courseId);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    scale.value = withSequence(
      withSpring(0.98, { damping: 15, stiffness: 300 }),
      withSpring(1),
    );
    runOnJS(onToggle)(courseId);
  });

  const composedTap = Gesture.Exclusive(doubleTap, singleTap);

  const courseItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const aggregateStatus = useMemo(
    () => deriveAggregateStatus(items),
    [items],
  );

  return (
    <Animated.View layout={LinearTransition.duration(200)} className="mb-1">
      {/* Header — clean minimal row */}
      <GestureDetector gesture={composedTap}>
        <Animated.View
          style={animatedHeaderStyle}
          className="flex-row items-center justify-between py-3 px-2"
        >
          <View className="flex-row items-center flex-1">
            <View
              className="w-2 h-2 rounded-full mr-2.5"
              style={{ backgroundColor: isCurrent ? colors.success : colors.muted }}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}>
              Course {courseId}
            </Text>
            {isSent && (
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal, marginLeft: 6 }}>Sent</Text>
            )}
            {aggregateStatus && (
              <View className={`ml-2 px-2 py-0.5 rounded ${BADGE_CONFIG[aggregateStatus].bg}`}>
                <Text className={`text-xs font-bold ${BADGE_CONFIG[aggregateStatus].text}`}>
                  {BADGE_CONFIG[aggregateStatus].label}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
              {courseItemCount} item{courseItemCount !== 1 ? "s" : ""}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            {!isSent && !aggregateStatus && courseItemCount > 0 && (
              <TouchableOpacity
                onPress={() => runOnJS(onDoubleTap)(courseId)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '18',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                }}
                activeOpacity={0.6}
              >
                <Send size={13} color={colors.teal} />
                <Text style={{ color: colors.teal, fontSize: 12, fontWeight: '700' }}>Send to Kitchen</Text>
              </TouchableOpacity>
            )}
            {isExpanded ? (
              <ChevronDown size={18} color={colors.label} />
            ) : (
              <ChevronRight size={18} color={colors.label} />
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Content with Animation — sent courses get reduced opacity */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.duration(200)}
          className="pl-4 gap-y-2 overflow-hidden"
          style={isSent || aggregateStatus ? { opacity: 0.5 } : undefined}
        >
          {items.map((item) => (
            <Animated.View
              key={item.id}
              layout={LinearTransition.duration(150)}
              className="overflow-hidden"
            >
              <BillItem item={item} isEditable={!isSent && !aggregateStatus} />
            </Animated.View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
});

// --- Main Component ---
const CourseAccordion: React.FC<CourseAccordionProps> = ({
  activeOrder,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  onOpenServerSheet,
}) => {
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const prevItemCount = useRef<number>(0);
  const liveOrder = useActiveOrder();
  const openCustomerSheet = useCustomerSheetStore((s) => s.openSheet);
  const tablesById = useFloorPlanStore((s) => s.tablesById);
  const tableName = useMemo(() => {
    const locId = liveOrder?.service_location_id;
    if (!locId) return null;
    return tablesById[locId]?.name ?? locId;
  }, [tablesById, liveOrder?.service_location_id]);

  // Group items by course
  const groupedItems = useMemo(() => {
    const groups: Record<number, CartItem[]> = {};
    activeOrder?.items?.forEach((item) => {
      const course = item.courseNumber ?? itemCourseMap?.[item.id] ?? 1;
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

  const handleToggleCourse = useCallback((courseId: number) => {
    // Toggle: if already expanded, collapse; otherwise expand this one (collapsing others)
    setExpandedCourseId((prev) => (prev === courseId ? null : courseId));
    if (onSelectCourse) {
      onSelectCourse(expandedCourseId === courseId ? null : courseId);
    }
  }, [onSelectCourse, expandedCourseId]);

  if (!activeOrder) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ fontSize: 12, color: colors.muted }}>No active order.</Text>
      </View>
    );
  }

  const Dot = () => <Text style={{ fontSize: 10, color: colors.muted, marginHorizontal: 3 }}>·</Text>;
  const guestCount = liveOrder?.guest_count ?? 0;

  return (
    <View className="flex-1 bg-panel p-4">
      {/* Meta info row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        {tableName && (
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.label }}>{tableName}</Text>
        )}
        <Dot />
        <Text style={{ fontSize: 10, color: colors.muted }}>{guestCount || 1} guest{(guestCount || 1) !== 1 ? 's' : ''}</Text>
        <Dot />
        <TouchableOpacity onPress={onOpenServerSheet} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 10, color: liveOrder?.server_name ? colors.muted : colors.teal }}>
            {liveOrder?.server_name || 'Assign server'}
          </Text>
        </TouchableOpacity>
        <Dot />
        <TouchableOpacity onPress={openCustomerSheet} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 10, color: liveOrder?.customer_name ? colors.muted : colors.teal }}>
            {liveOrder?.customer_name || 'Add customer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Header */}
      <View className="flex-row items-center justify-between pb-3 mb-2">
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
          Order{" "}
          {activeOrder.display_number
            ? activeOrder.display_number.startsWith("#")
              ? activeOrder.display_number
              : `#${activeOrder.display_number}`
            : activeOrder.order_number
              ? `#${activeOrder.order_number}`
              : activeOrder.db_order_id
                ? `#${activeOrder.db_order_id.substring(0, 8)}`
                : ""}
        </Text>
        <TouchableOpacity
          onPress={onPressStartNewCourse}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal"
          activeOpacity={0.8}
        >
          <Plus size={16} color={colors.teal} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
            New Course
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
              <Text style={{ fontSize: 12, color: colors.muted }}>
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
