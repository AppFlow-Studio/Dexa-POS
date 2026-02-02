import { CartItem } from "@/lib/types";
import { selectActiveEditingItemId, useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

interface BillSummaryProps {
  cart: CartItem[];
  expandedItemId?: string | null;
  onToggleExpand?: (itemId: string) => void;
  currentCourse?: number;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
}

const BillSummaryComponent: React.FC<BillSummaryProps> = ({
  cart,
  expandedItemId,
  onToggleExpand,
  currentCourse,
  itemCourseMap,
  sentCourses,
}) => {
  // 1. Create a ref for the ScrollView
  const scrollViewRef = useRef<ScrollView>(null);

  // 2. useEffect to scroll to bottom when cart items change
  useEffect(() => {
    if (cart.length > 0) {
      // OPTIMIZED: Use requestAnimationFrame instead of 100ms setTimeout
      // This waits for the next frame (16ms max) instead of fixed 100ms delay
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [cart.length]);

  // O(1) lookup with individual selector - only re-renders when activeOrderId or ordersById changes
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const ordersById = useOrderStore((state) => state.ordersById);

  // Track which item is being edited in modifier panel (for visual highlight)
  const activeEditingItemId = useModifierSidebarStore(selectActiveEditingItemId);

  // O(1) lookup instead of O(n) find
  const activeOrder = useMemo(
    () => (activeOrderId ? ordersById[activeOrderId] : undefined),
    [activeOrderId, ordersById]
  );

  // OPTIMIZED: Pre-compute grouped courses outside render for O(1) lookup
  const groupedCourses = useMemo(() => {
    const grouped: Record<number, CartItem[]> = {};
    cart.forEach((item) => {
      const course = itemCourseMap?.[item.id] ?? 1;
      if (!grouped[course]) grouped[course] = [];
      grouped[course].push(item);
    });
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map((course) => ({ course, items: grouped[course] }));
  }, [cart, itemCourseMap]);

  return (
    <View className="flex-1 bg-[#212121]">
      <View className=" px-6 h-full">
        <View className="mb-1">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="text-gray-400 text-sm font-medium">
                {activeOrder?.display_number ||
                  activeOrder?.order_number ||
                  "New Order"}
              </Text>
              {activeOrder?.paid_status === "Paid" && (
                <View className="ml-2 bg-green-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-green-400 text-[10px] font-bold">PAID</Text>
                </View>
              )}
              {activeOrder?.paid_status === "Partial" && (
                <View className="ml-2 bg-yellow-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-yellow-400 text-[10px] font-bold">PARTIAL</Text>
                </View>
              )}
            </View>
            <Text className="text-base text-blue-400 font-medium">
              {cart.length} {cart.length === 1 ? "Item" : "Items"}
            </Text>
          </View>
        </View>
        <View className="flex-1 h-full w-full">
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={true}
            className="flex-1 h-full my-2"
            nestedScrollEnabled={true}
          >
            {cart.length > 0 ? (
              <View>
                {groupedCourses.map(({ course, items }) => {
                  const isCourseActive =
                    currentCourse !== undefined && course === currentCourse;
                  return (
                    <View key={`course-${course}`} className="mb-3">
                      {items.map((item, index) => {
                        // Highlight if: being actively edited OR is a draft item
                        const shouldHighlight = item.id === activeEditingItemId || item.isDraft === true;
                        return (
                          <View
                            key={`${item.id}-${index}`}
                            className={`rounded-xl mb-1.5 ${
                              isCourseActive ? "border border-blue-500" : ""
                            }`}
                          >
                            <BillItem
                              item={item}
                              isEditable={true}
                              isActive={shouldHighlight}
                            />
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="h-full items-center justify-center">
                <Text className="text-xl text-gray-400">Order is empty.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillSummary = React.memo(BillSummaryComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.cart === next.cart &&
    prev.expandedItemId === next.expandedItemId &&
    prev.currentCourse === next.currentCourse &&
    prev.itemCourseMap === next.itemCourseMap &&
    prev.sentCourses === next.sentCourses
  );
});

export default BillSummary;
