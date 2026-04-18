import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { iosOnly } from "@/lib/safeAnimations";
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

  // PERF: Subscribe to primitives only - prevents re-render on unrelated order mutations
  const displayNumber = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.display_number ?? order?.order_number ?? null;
  });
  const paidStatus = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.paid_status ?? null;
  });
  const orderStatus = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.order_status ?? null;
  });
  const checkStatus = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.check_status ?? null;
  });
  const hasRefunds = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return (order?.payments ?? []).some((p: any) => (p.refundedAmount ?? 0) > 0);
  });
  const isSplitPayment = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    const payments = (order?.payments ?? []).filter((p: any) => !p.isVoided);
    return payments.length > 1;
  });

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
    <View className="flex-1 bg-background">
      <View className=" px-4 h-full">
        <View className="mb-1 mt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-wrap gap-1.5">
              <Text className="text-gray-400 text-sm font-medium">
                {displayNumber || "New Order"}
              </Text>
              {paidStatus === "Paid" && (
                <View className="bg-teal-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-teal-400 text-[10px] font-bold">PAID</Text>
                </View>
              )}
              {paidStatus === "Partial" && (
                <View className="bg-yellow-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-yellow-400 text-[10px] font-bold">PARTIAL</Text>
                </View>
              )}
              {paidStatus === "Unpaid" && orderStatus !== "draft" && (
                <View className="bg-red-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-red-400 text-[10px] font-bold">UNPAID</Text>
                </View>
              )}
              {checkStatus === "Closed" && (
                <View className="bg-gray-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-gray-400 text-[10px] font-bold">CLOSED</Text>
                </View>
              )}
              {isSplitPayment && (
                <View className="bg-teal-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-teal-400 text-[10px] font-bold">SPLIT</Text>
                </View>
              )}
              {paidStatus === "Paid" && hasRefunds && (
                <View className="bg-amber-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-amber-400 text-[10px] font-bold">REFUNDS</Text>
                </View>
              )}
              {orderStatus === "preparing" && (
                <View className="bg-teal-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-teal-400 text-[10px] font-bold">PREPARING</Text>
                </View>
              )}
              {orderStatus === "ready" && (
                <View className="bg-green-600/30 px-1.5 py-0.5 rounded">
                  <Text className="text-green-400 text-[10px] font-bold">READY</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-teal-400 font-medium">
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
                        return (
                          <Animated.View
                            key={item.id}
                            entering={iosOnly(FadeInDown.duration(200))}
                            layout={LinearTransition.duration(200)}
                            className={`rounded-xl mb-1 ${
                              isCourseActive ? "border border-blue-500" : ""
                            }`}
                          >
                            <BillItem
                              item={item}
                              isEditable={true}
                              showPaidBadge={paidStatus !== "Paid"}
                            />
                          </Animated.View>
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
