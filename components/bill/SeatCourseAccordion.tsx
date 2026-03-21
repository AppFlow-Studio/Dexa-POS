import { CartItem, OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Send,
} from "lucide-react-native";
import BillItem from "./BillItem";

// --- Types ---
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
}) => {
  const [expandedSeat, setExpandedSeat] = useState<number | null | "shared">(
    null,
  );
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

                      return (
                        <View key={`course-${course}`} className="mb-1">
                          {/* Course sub-header */}
                          <View className="flex-row items-center justify-between py-2 px-2">
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
                          </View>

                          {/* Items */}
                          <View
                            className="pl-3 gap-y-2"
                            style={isSent ? { opacity: 0.5 } : undefined}
                          >
                            {items.map((item) => (
                              <Animated.View
                                key={item.id}
                                layout={LinearTransition.duration(150)}
                                className="overflow-hidden"
                              >
                                <BillItem
                                  item={item}
                                  isEditable={!isSent}
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
    </View>
  );
};

export default SeatCourseAccordion;
