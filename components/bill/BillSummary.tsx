import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { useOrderItem } from "@/stores/selectors/orderSelectors";
import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, {
    FadeInDown,
    LinearTransition,
} from "react-native-reanimated";
import BillItem from "./BillItem";

interface BillSummaryProps {
  orderId: string | null;
  itemIds: string[];
  expandedItemId?: string | null;
  onToggleExpand?: (itemId: string) => void;
  currentCourse?: number;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  orderHasPayments?: boolean;
  payments?: any[] | null;
  isNetworkDegraded?: boolean;
}

const BillSummaryComponent: React.FC<BillSummaryProps> = ({
  orderId,
  itemIds,
  expandedItemId,
  onToggleExpand,
  currentCourse,
  itemCourseMap,
  sentCourses,
  orderHasPayments,
  payments,
  isNetworkDegraded,
}) => {
  // 1. Create a ref for the ScrollView
  const scrollViewRef = useRef<ScrollView>(null);

  // 2. useEffect to scroll to bottom when cart items change
  useEffect(() => {
    let frameId: number | null = null;
    if (itemIds.length > 0) {
      // OPTIMIZED: Use requestAnimationFrame instead of 100ms setTimeout
      // This waits for the next frame (16ms max) instead of fixed 100ms delay
      frameId = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [itemIds.length]);

  // OPTIMIZED: Pre-compute grouped courses outside render for O(1) lookup
  const groupedCourses = useMemo(() => {
    const grouped: Record<number, string[]> = {};
    itemIds.forEach((itemId) => {
      const course = itemCourseMap?.[itemId] ?? 1;
      if (!grouped[course]) grouped[course] = [];
      grouped[course].push(itemId);
    });
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map((course) => ({ course, items: grouped[course] }));
  }, [itemCourseMap, itemIds]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <View className="px-3 h-full">
        <View className="flex-1 h-full w-full">
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={true}
            className="flex-1 h-full my-1"
            style={{ backgroundColor: colors.screen }}
            contentContainerStyle={{ backgroundColor: colors.screen }}
            nestedScrollEnabled={true}
          >
            {itemIds.length > 0 ? (
              <View>
                {groupedCourses.map(({ course, items }) => {
                  const isCourseActive =
                    currentCourse !== undefined && course === currentCourse;
                  return (
                    <View key={`course-${course}`} className="mb-3">
                      {items.map((itemId) => (
                        <BillSummaryRow
                          key={itemId}
                          orderId={orderId}
                          itemId={itemId}
                          isCourseActive={isCourseActive}
                          orderHasPayments={orderHasPayments}
                          payments={payments}
                          isNetworkDegraded={isNetworkDegraded}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="h-full items-center justify-center">
                <Text style={{ fontSize: 20, color: colors.muted }}>
                  Order is empty.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const BillSummaryRow = React.memo(
  function BillSummaryRow({
    orderId,
    itemId,
    isCourseActive,
    orderHasPayments,
    payments,
    isNetworkDegraded,
  }: {
    orderId: string | null;
    itemId: string;
    isCourseActive: boolean;
    orderHasPayments?: boolean;
    payments?: any[] | null;
    isNetworkDegraded?: boolean;
  }) {
    const item = useOrderItem(orderId, itemId);
    if (!item) return null;

    return (
      <Animated.View
        entering={iosOnly(FadeInDown.duration(200))}
        layout={iosOnly(LinearTransition.duration(200))}
        className={`rounded-xl mb-1 ${
          isCourseActive ? "border border-blue-500" : ""
        }`}
      >
        <BillItem
          item={item}
          isEditable={true}
          showPaidBadge={true}
          orderHasPayments={orderHasPayments}
          payments={payments}
          isNetworkDegraded={isNetworkDegraded}
        />
      </Animated.View>
    );
  },
);

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillSummary = React.memo(BillSummaryComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.orderId === next.orderId &&
    prev.itemIds === next.itemIds &&
    prev.expandedItemId === next.expandedItemId &&
    prev.currentCourse === next.currentCourse &&
    prev.itemCourseMap === next.itemCourseMap &&
    prev.sentCourses === next.sentCourses &&
    prev.orderHasPayments === next.orderHasPayments &&
    prev.payments === next.payments &&
    prev.isNetworkDegraded === next.isNetworkDegraded
  );
});

export default BillSummary;
