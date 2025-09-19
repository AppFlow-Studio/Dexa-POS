import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { Text, View } from "react-native";
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

  const handleOpenDiscounts = () => {
    setDiscountOverlayVisible(true);
  };

  const handleCloseDiscounts = () => {
    setDiscountOverlayVisible(false);
  };

  // Build coursing summary (course -> count, sent status)
  const courseSummary = React.useMemo(() => {
    const summary: Record<number, number> = {};
    cart.forEach((i) => {
      const course = itemCourseMap?.[i.id] ?? 1;
      summary[course] = (summary[course] || 0) + i.quantity;
    });
    // Ensure current course is visible even if it has zero items yet
    if (currentCourse !== undefined && summary[currentCourse] === undefined) {
      summary[currentCourse] = 0;
    }
    return summary;
  }, [cart, itemCourseMap, currentCourse]);

  return (
    <>
      <View className="max-w-lg bg-[#303030] flex-1">
        {showOrderDetails && <OrderDetails />}

        {/* Coursing Summary */}
        {Object.keys(courseSummary).length > 0 && (
          <View className="px-4 py-3 border-b border-gray-700">
            <View className="flex-row flex-wrap gap-2">
              {Object.entries(courseSummary)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([course, count]) => {
                  const sent = !!sentCourses?.[Number(course)];
                  const isActive = Number(course) === (currentCourse ?? 0);

                  // Get items in this course to check their kitchen status
                  const itemsInCourse = cart.filter(item =>
                    (itemCourseMap?.[item.id] ?? 1) === Number(course)
                  );

                  // Check if all items in course are sent to kitchen
                  const allItemsSent = itemsInCourse.every(item =>
                    item.kitchen_status === "sent" ||
                    item.kitchen_status === "ready" ||
                    item.kitchen_status === "served"
                  );

                  // Check if any items are ready
                  const anyItemsReady = itemsInCourse.some(item =>
                    item.kitchen_status === "ready" || item.kitchen_status === "served"
                  );

                  return (
                    <View
                      key={course}
                      className={`px-3 py-2 rounded-full flex-row items-center gap-2 ${sent || allItemsSent
                        ? "bg-green-900/30 border border-green-500"
                        : anyItemsReady
                          ? "bg-yellow-900/30 border border-yellow-500"
                          : isActive
                            ? "bg-blue-900/30 border border-blue-500"
                            : "bg-[#212121] border border-gray-700"
                        }`}
                    >
                      <View
                        className={`w-3 h-3 rounded-full ${sent || allItemsSent
                          ? "bg-green-500"
                          : anyItemsReady
                            ? "bg-yellow-500"
                            : "bg-gray-500"
                          }`}
                      />
                      <Text className="text-xl font-semibold text-white">
                        Course {course}
                      </Text>
                      <View className="w-1" />
                      <Text className="text-xl font-semibold text-gray-300">
                        x{count}
                      </Text>
                      {sent || allItemsSent ? (
                        <Text className="text-xl font-bold text-green-400 ml-2">
                          Sent
                        </Text>
                      ) : anyItemsReady ? (
                        <Text className="text-xl font-bold text-yellow-400 ml-2">
                          In Progress
                        </Text>
                      ) : (
                        <Text
                          onPress={() =>
                            onSelectCourse && onSelectCourse(Number(course))
                          }
                          className="text-xl font-bold text-blue-400 ml-2"
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
