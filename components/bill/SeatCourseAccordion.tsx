import { CartItem, OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Flame,
  Plus,
  Send,
} from "lucide-react-native";
import BillItem from "./BillItem";

// --- Types ---
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

interface SeatCourseAccordionProps {
  activeOrder: OrderProfile | undefined;
  itemSeatMap?: Record<string, number | null>;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  activeSeat?: number | null;
  seatCount: number;
  onSelectSeat?: (seat: number | null) => void;
  onSelectCourse?: (course: number | null) => void;
  onPressStartNewCourse: () => void;
  onDoubleTapCourse: (courseId: number) => void;
  onRushCourse?: (courseId: number) => void;
  onPrioritizeCourse?: (courseId: number) => void;
  onResendCourse?: (courseId: number) => void;
}

// --- Main Component ---
const SeatCourseAccordion: React.FC<SeatCourseAccordionProps> = ({
  activeOrder,
  itemSeatMap,
  itemCourseMap,
  sentCourses,
  currentCourse,
  activeSeat,
  seatCount,
  onSelectSeat,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
}) => {
  const [expandedSeat, setExpandedSeat] = useState<number | null | "shared">(
    null,
  );
  const [actionCourse, setActionCourse] = useState<number | null>(null);
  const prevItemCount = useRef<number>(0);

  // Group items: seat -> course -> items
  const seatGroups = useMemo(() => {
    const groups: Record<
      string,
      Record<number, CartItem[]>
    > = {};

    activeOrder?.items?.forEach((item) => {
      const seat = item.seatNumber ?? itemSeatMap?.[item.id] ?? null;
      const course = item.courseNumber ?? itemCourseMap?.[item.id] ?? 1;
      const seatKey = seat === null ? "shared" : String(seat);

      if (!groups[seatKey]) groups[seatKey] = {};
      if (!groups[seatKey][course]) groups[seatKey][course] = [];
      groups[seatKey][course].push(item);
    });

    return groups;
  }, [activeOrder?.items, itemSeatMap, itemCourseMap]);

  // Sorted seat keys
  const sortedSeatKeys = useMemo(() => {
    const keys = Object.keys(seatGroups);
    const numbered = keys
      .filter((k) => k !== "shared")
      .map(Number)
      .sort((a, b) => a - b);

    const allSeats = new Set(numbered);
    for (let i = 1; i <= seatCount; i++) {
      allSeats.add(i);
    }

    const result: (number | "shared")[] = Array.from(allSeats).sort(
      (a, b) => a - b,
    );
    if (seatGroups["shared"] || activeSeat === null) {
      result.push("shared");
    }
    return result;
  }, [seatGroups, seatCount, activeSeat]);

  // Auto-expand when items added
  useEffect(() => {
    const currentItemCount = activeOrder?.items?.length ?? 0;
    if (currentItemCount > prevItemCount.current) {
      setExpandedSeat(activeSeat === null || activeSeat === undefined ? "shared" : activeSeat);
    }
    prevItemCount.current = currentItemCount;
  }, [activeOrder?.items?.length, activeSeat]);

  const handleToggleSeat = useCallback(
    (seat: number | null) => {
      const key = seat === null ? "shared" : seat;
      setExpandedSeat((prev) => (prev === key ? null : key));
      if (onSelectSeat) onSelectSeat(seat);
    },
    [onSelectSeat],
  );

  if (!activeOrder) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ fontSize: 12, color: colors.muted }}>
          No active order.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-panel p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-3 mb-2">
        <Text
          style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}
        >
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
          <Text
            style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}
          >
            New Course
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View layout={LinearTransition.duration(250)}>
          {sortedSeatKeys.map((seatKey) => {
            const seatNumber =
              seatKey === "shared" ? null : (seatKey as number);
            const seatLabel =
              seatKey === "shared" ? "Shared" : `Seat ${seatKey}`;
            const expandKey = seatKey === "shared" ? "shared" : seatKey;
            const isExpanded = expandedSeat === expandKey;
            const isCurrent = activeSeat === seatNumber;
            const courseGroups =
              seatGroups[seatKey === "shared" ? "shared" : String(seatKey)] ||
              {};
            const totalItems = Object.values(courseGroups)
              .flat()
              .reduce((sum, i) => sum + i.quantity, 0);
            const sortedCourses = Object.keys(courseGroups)
              .map(Number)
              .sort((a, b) => a - b);

            return (
              <Animated.View
                key={`seat-${seatKey}`}
                layout={LinearTransition.duration(200)}
                className="mb-1"
              >
                {/* Seat Header */}
                <TouchableOpacity
                  onPress={() => handleToggleSeat(seatNumber)}
                  className="flex-row items-center justify-between py-3 px-2"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className="w-2 h-2 rounded-full mr-2.5"
                      style={{
                        backgroundColor: isCurrent
                          ? colors.teal
                          : colors.muted,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: colors.heading,
                      }}
                    >
                      {seatLabel}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginLeft: 6,
                      }}
                    >
                      {totalItems} item{totalItems !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronDown size={18} color={colors.label} />
                  ) : (
                    <ChevronRight size={18} color={colors.label} />
                  )}
                </TouchableOpacity>

                {/* Expanded: course sub-groups */}
                {isExpanded && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    layout={LinearTransition.duration(200)}
                    className="pl-3"
                  >
                    {sortedCourses.map((course) => {
                      const items = courseGroups[course] || [];
                      const isSent = !!sentCourses?.[course];
                      const isCurrentCourse = currentCourse === course;
                      const courseItemCount = items.reduce(
                        (s, i) => s + i.quantity,
                        0,
                      );
                      const aggregateStatus = deriveAggregateStatus(items);
                      const canLongPress = isSent && aggregateStatus && aggregateStatus !== 'served';

                      return (
                        <View key={`course-${course}`} className="mb-1">
                          {/* Course sub-header */}
                          <TouchableOpacity
                            className="flex-row items-center justify-between py-2 px-2"
                            activeOpacity={0.7}
                            onLongPress={canLongPress ? () => setActionCourse(course) : undefined}
                          >
                            <View className="flex-row items-center">
                              <View
                                className="w-1.5 h-1.5 rounded-full mr-2"
                                style={{
                                  backgroundColor: isCurrentCourse
                                    ? colors.success
                                    : colors.muted,
                                }}
                              />
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: "600",
                                  color: colors.label,
                                }}
                              >
                                Course {course}
                              </Text>
                              {isSent && (
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "600",
                                    color: colors.teal,
                                    marginLeft: 4,
                                  }}
                                >
                                  Sent
                                </Text>
                              )}
                              {aggregateStatus && (
                                <View className={`ml-1 px-2 py-0.5 rounded ${BADGE_CONFIG[aggregateStatus].bg}`}>
                                  <Text className={`text-xs font-bold ${BADGE_CONFIG[aggregateStatus].text}`}>
                                    {BADGE_CONFIG[aggregateStatus].label}
                                  </Text>
                                </View>
                              )}
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: colors.muted,
                                  marginLeft: 4,
                                }}
                              >
                                {courseItemCount} item
                                {courseItemCount !== 1 ? "s" : ""}
                              </Text>
                            </View>

                            {!isSent && courseItemCount > 0 && (
                              <TouchableOpacity
                                onPress={() => onDoubleTapCourse(course)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 6,
                                  backgroundColor: colors.teal + "18",
                                  borderWidth: 1,
                                  borderColor: colors.teal + "50",
                                }}
                                activeOpacity={0.6}
                              >
                                <Send size={10} color={colors.teal} />
                                <Text
                                  style={{
                                    color: colors.teal,
                                    fontSize: 10,
                                    fontWeight: "700",
                                  }}
                                >
                                  Send
                                </Text>
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>

                          {/* Items */}
                          <View
                            className="pl-3 gap-y-2"
                            style={isSent || aggregateStatus ? { opacity: 0.5 } : undefined}
                          >
                            {items.map((item) => (
                              <Animated.View
                                key={item.id}
                                layout={LinearTransition.duration(150)}
                                className="overflow-hidden"
                              >
                                <BillItem
                                  item={item}
                                  isEditable={true}
                                />
                              </Animated.View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </Animated.View>
                )}
              </Animated.View>
            );
          })}

          {sortedSeatKeys.length === 0 && (
            <View className="flex-1 items-center justify-center mt-10">
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Add items to start an order.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Long-press action menu for sent courses */}
      {actionCourse !== null && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setActionCourse(null)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setActionCourse(null)}
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
                Course {actionCourse} Actions
              </Text>
              {onRushCourse && (
                <TouchableOpacity
                  onPress={() => { const c = actionCourse; setActionCourse(null); onRushCourse(c); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <Flame size={16} color={colors.danger} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>Rush Course</Text>
                </TouchableOpacity>
              )}
              {onPrioritizeCourse && (
                <TouchableOpacity
                  onPress={() => { const c = actionCourse; setActionCourse(null); onPrioritizeCourse(c); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  activeOpacity={0.7}
                >
                  <ArrowUpToLine size={16} color="#f59e0b" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#f59e0b' }}>Prioritize Course</Text>
                </TouchableOpacity>
              )}
              {onResendCourse && (
                <TouchableOpacity
                  onPress={() => { const c = actionCourse; setActionCourse(null); onResendCourse(c); }}
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
    </View>
  );
};

export default SeatCourseAccordion;
