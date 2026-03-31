import { CartItem, OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useShallow } from "zustand/react/shallow";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
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
import { ArrowUpToLine, ChevronDown, ChevronRight, Flame, Plus, Send } from "lucide-react-native";
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
  onRushCourse?: (courseId: number) => void;
  onPrioritizeCourse?: (courseId: number) => void;
  onResendCourse?: (courseId: number) => void;
  enableCoursing?: boolean;
}

interface CourseGroupProps {
  courseId: number;
  items: CartItem[];
  isExpanded: boolean;
  isSent: boolean;
  isCurrent: boolean;
  onToggle: (id: number) => void;
  onDoubleTap: (id: number) => void;
  onRushCourse?: (courseId: number) => void;
  onPrioritizeCourse?: (courseId: number) => void;
  onResendCourse?: (courseId: number) => void;
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
function CourseGroupInner({
  courseId,
  items,
  isExpanded,
  isSent,
  isCurrent,
  onToggle,
  onDoubleTap,
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
}: CourseGroupProps) {
  const scale = useSharedValue(1);
  const [showActions, setShowActions] = useState(false);

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

  const courseItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const aggregateStatus = useMemo(
    () => deriveAggregateStatus(items),
    [items],
  );

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      if (isSent && aggregateStatus && aggregateStatus !== 'served') {
        runOnJS(setShowActions)(true);
      }
    });

  const composedGesture = Gesture.Exclusive(longPress, doubleTap, singleTap);

  return (
    <Animated.View layout={LinearTransition.duration(200)} className="mb-1">
      {/* Header — clean minimal row */}
      <GestureDetector gesture={composedGesture}>
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
              <BillItem item={item} isEditable={true} />
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {/* Long-press action menu for sent courses */}
      {showActions && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowActions(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setShowActions(false)}
          >
            <View style={{
              backgroundColor: colors.panel,
              borderRadius: 12,
              padding: 8,
              width: 220,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.heading, paddingHorizontal: 12, paddingVertical: 6 }}>
                Course {courseId} Actions
              </Text>
              {onRushCourse && (
                <TouchableOpacity
                  onPress={() => { setShowActions(false); onRushCourse(courseId); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Flame size={16} color={colors.danger} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>Rush Course</Text>
                </TouchableOpacity>
              )}
              {onPrioritizeCourse && (
                <TouchableOpacity
                  onPress={() => { setShowActions(false); onPrioritizeCourse(courseId); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <ArrowUpToLine size={16} color="#f59e0b" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#f59e0b' }}>Prioritize Course</Text>
                </TouchableOpacity>
              )}
              {onResendCourse && (
                <TouchableOpacity
                  onPress={() => { setShowActions(false); onResendCourse(courseId); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Send size={16} color={colors.teal} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Resend Course</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </Animated.View>
  );
}

const CourseGroup = React.memo(CourseGroupInner, (prev, next) => {
  // Only re-render when structure changes (IDs, counts, voided) — not on kitchen_status updates
  // BillItem subscribes directly to the order store for its own kitchen_status display
  if (prev.courseId !== next.courseId) return false
  if (prev.isExpanded !== next.isExpanded) return false
  if (prev.isSent !== next.isSent) return false
  if (prev.isCurrent !== next.isCurrent) return false
  if (prev.onToggle !== next.onToggle) return false
  if (prev.onDoubleTap !== next.onDoubleTap) return false
  if (prev.onRushCourse !== next.onRushCourse) return false
  if (prev.onPrioritizeCourse !== next.onPrioritizeCourse) return false
  if (prev.onResendCourse !== next.onResendCourse) return false
  if (prev.items.length !== next.items.length) return false
  for (let i = 0; i < prev.items.length; i++) {
    const p = prev.items[i]; const n = next.items[i]
    if (p.id !== n.id || p.quantity !== n.quantity || p.is_voided !== n.is_voided) return false
  }
  return true
})

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
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
  enableCoursing = true,
}) => {
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const prevItemCount = useRef<number>(0);
  // Narrow selectors — subscribe only to the specific fields we display, not the whole order
  const orderMeta = useOrderStore(useShallow((s) => {
    const o = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return {
      serviceLocationId: o?.service_location_id ?? null,
      guestCount: o?.guest_count ?? 0,
      serverName: o?.server_name ?? null,
      customerName: o?.customer_name ?? null,
      displayNumber: o?.display_number ?? null,
      orderNumber: o?.order_number ?? null,
      dbOrderId: o?.db_order_id ?? null,
    };
  }));
  const openCustomerSheet = useCustomerSheetStore((s) => s.openSheet);
  const tableName = useFloorPlanStore((s) => {
    const locId = orderMeta.serviceLocationId;
    if (!locId) return null;
    return s.tablesById[locId]?.name ?? locId;
  });

  // Stable key: only regroup when item IDs/courses change, not on every kitchen_status update
  const itemsGroupingKey = useMemo(() => {
    if (!activeOrder?.items) return '';
    return activeOrder.items
      .filter(i => !i.is_voided)
      .map(i => `${i.id}:${i.courseNumber ?? itemCourseMap?.[i.id] ?? 1}`)
      .join(',');
  }, [activeOrder?.items, itemCourseMap]);

  // Group items by course — only recalculates when IDs or course assignments change
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsGroupingKey]);

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
  const guestCount = orderMeta.guestCount;

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
          <Text style={{ fontSize: 10, color: orderMeta.serverName ? colors.muted : colors.teal }}>
            {orderMeta.serverName || 'Assign server'}
          </Text>
        </TouchableOpacity>
        <Dot />
        <TouchableOpacity onPress={openCustomerSheet} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 10, color: orderMeta.customerName ? colors.muted : colors.teal }}>
            {orderMeta.customerName || 'Add customer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Header */}
      <View className="flex-row items-center justify-between pb-3 mb-2">
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
          Order{" "}
          {orderMeta.displayNumber
            ? orderMeta.displayNumber.startsWith("#")
              ? orderMeta.displayNumber
              : `#${orderMeta.displayNumber}`
            : orderMeta.orderNumber
              ? `#${orderMeta.orderNumber}`
              : orderMeta.dbOrderId
                ? `#${orderMeta.dbOrderId.substring(0, 8)}`
                : ""}
        </Text>
        {enableCoursing && (
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
        )}
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
                onRushCourse={onRushCourse}
                onPrioritizeCourse={onPrioritizeCourse}
                onResendCourse={onResendCourse}
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
