import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, LayoutChangeEvent } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

const TableBillSectionContent = ({
  cart,
  currentCourse,
  itemCourseMap,
  sentCourses,
}: {
  cart: CartItem[];
  currentCourse?: number;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
}) => {
  // State for managing expanded item
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <>
      <BillSummary
        cart={cart}
        expandedItemId={expandedItemId}
        onToggleExpand={handleToggleExpand}
        currentCourse={currentCourse}
        itemCourseMap={itemCourseMap}
        sentCourses={sentCourses}
      />
      <Totals cart={cart} />
    </>
  );
};

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
}: {
  showOrderDetails?: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number) => void;
}) => {
  const { activeOrderId, orders } = useOrderStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const cart = activeOrder?.items || [];

  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [chipLayouts, setChipLayouts] = useState<Record<number, { x: number; width: number }>>({});
  const [scrollViewWidth, setScrollViewWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0); // New state for content width

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  const courseSummary = React.useMemo(() => {
    const summary: Record<number, number> = {};
    cart.forEach((i) => {
      const course = itemCourseMap?.[i.id] ?? 1;
      summary[course] = (summary[course] || 0) + i.quantity;
    });
    if (currentCourse !== undefined && summary[currentCourse] === undefined) {
      summary[currentCourse] = 0;
    }
    return summary;
  }, [cart, itemCourseMap, currentCourse]);

  const handleChipLayout = (event: LayoutChangeEvent, course: number) => {
    const { x, width } = event.nativeEvent.layout;
    setChipLayouts((prev) => ({ ...prev, [course]: { x, width } }));
  };

  useEffect(() => {
    if (currentCourse && chipLayouts[currentCourse] && scrollViewWidth > 0 && contentWidth > 0) {
      const chip = chipLayouts[currentCourse];
      const targetX = chip.x - scrollViewWidth / 2 + chip.width / 2;

      // Clamp the scroll position to avoid scrolling past the edges
      const maxScrollX = contentWidth - scrollViewWidth;
      const clampedX = Math.max(0, Math.min(targetX, maxScrollX > 0 ? maxScrollX : 0));

      scrollViewRef.current?.scrollTo({ x: clampedX, animated: true });
    }
  }, [currentCourse, chipLayouts, scrollViewWidth, contentWidth]); // Added contentWidth to dependencies

  return (
    <>
      <View className="max-w-lg  flex-1">
        {showOrderDetails && <OrderDetails />}

        {/* Coursing Summary */}
        <ScrollView
          horizontal={true}
          className="max-h-16"
          ref={scrollViewRef}
          onLayout={(event) => setScrollViewWidth(event.nativeEvent.layout.width)}
          onContentSizeChange={(width) => setContentWidth(width)} // New prop
          showsHorizontalScrollIndicator={false}
        >
          {Object.keys(courseSummary).length > 0 && (
            <View className="px-3 py-1  flex-row items-center justify-between">
              <View className="flex-row flex-wrap gap-2">
                {Object.entries(courseSummary)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([course, count]) => {
                    const courseNum = Number(course);
                    const sent = !!sentCourses?.[courseNum];
                    const isActive = courseNum === (currentCourse ?? 0);

                    const itemsInCourse = cart.filter(
                      (item) =>
                        (itemCourseMap?.[item.id] ?? 1) === courseNum
                    );

                    const allItemsSent =
                      itemsInCourse.length > 0 &&
                      itemsInCourse.every(
                        (item) =>
                          item.kitchen_status === "sent" ||
                          item.kitchen_status === "ready" ||
                          item.kitchen_status === "served"
                      );

                    const anyItemsReady = itemsInCourse.some(
                      (item) =>
                        item.kitchen_status === "ready" ||
                        item.kitchen_status === "served"
                    );

                    return (
                      <View
                        key={course}
                        onLayout={(event) => handleChipLayout(event, courseNum)}
                        className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-2 ${
                          sent || allItemsSent
                            ? "bg-green-900/30 border border-green-500"
                            : anyItemsReady
                              ? "bg-yellow-900/30 border border-yellow-500"
                              : isActive
                                ? "bg-blue-900/30 border border-blue-500"
                                : "bg-[#212121] border border-gray-700"
                        }`}
                      >
                        <View
                          className={`w-2.5 h-2.5 rounded-lg ${
                            sent || allItemsSent
                              ? "bg-green-500"
                              : anyItemsReady
                                ? "bg-yellow-500"
                                : "bg-gray-500"
                          }`}
                        />
                        <Text className="text-base font-semibold text-white">
                          Course {course}
                        </Text>
                        <View className="w-1" />
                        <Text className="text-base font-semibold text-gray-300">
                          x{count}
                        </Text>
                        {sent || allItemsSent ? (
                          <Text className="text-base font-bold text-green-400 ml-1.5">
                            Sent
                          </Text>
                        ) : anyItemsReady ? (
                          <Text className="text-base font-bold text-yellow-400 ml-1.5">
                            In Progress
                          </Text>
                        ) : (
                          <Text
                            onPress={() =>
                              onSelectCourse && onSelectCourse(courseNum)
                            }
                            className="text-base font-bold text-blue-400 ml-1.5"
                          >
                            Select
                          </Text>
                        )}
                      </View>
                    );
                  })}
              </View>
            </View>
          )}
        </ScrollView>

        <TableBillSectionContent
          cart={cart}
          currentCourse={currentCourse}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
        />
        <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
        <DiscountOverlay
          isVisible={isDiscountOverlayVisible}
          onClose={handleCloseDiscounts}
        />
      </View>
    </>
  );
};

export default TableBillSection;
