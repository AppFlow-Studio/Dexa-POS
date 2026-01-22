import { OrderProfile } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { FlatList, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

export type SortColumn =
  | "time"
  | "assignee"
  | "assignment"
  | "customer"
  | "items"
  | "total";
export type SortDirection = "asc" | "desc";

interface ColumnConfig {
  key: SortColumn | "actions";
  label: string;
  sortable: boolean;
  width?: string;
  align?: "left" | "center" | "right";
}

const columns: ColumnConfig[] = [
  { key: "time", label: "TIME", sortable: true },
  { key: "assignee", label: "ASSIGNEE", sortable: true },
  { key: "assignment", label: "ASSIGNMENT", sortable: true },
  { key: "customer", label: "CUSTOMER", sortable: true },
  { key: "items", label: "ITEMS", sortable: true, align: "center" },
  { key: "total", label: "TOTAL", sortable: true, align: "right" },
  { key: "actions", label: "", sortable: false },
];

interface OrdersTableProps {
  orders: OrderProfile[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onRowClick: (orderId: string) => void;
  onDoubleClick: (orderId: string) => void;
  onMoreClick: (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

// Memoized row component for better performance
interface OrderRowProps {
  order: OrderProfile;
  isEven: boolean;
  onRowClick: (orderId: string) => void;
  onDoubleClick: (orderId: string) => void;
  onMoreClick: (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  getTableName: (tableId: string | null | undefined) => string;
}

const OrderRow = memo<OrderRowProps>(
  ({ order, isEven, onRowClick, onDoubleClick, onMoreClick, getTableName }) => {
    const buttonRef = React.useRef<React.ElementRef<
      typeof TouchableOpacity
    > | null>(null);
    const scale = useSharedValue(1);

    // Memoize the time formatting to avoid recalculation on every render
    const timeDisplay = useMemo(() => {
      const timestamp = order.opened_at;
      if (!timestamp) return { time: "—", date: "—" };
      const date = new Date(timestamp);
      const time = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );
      let dateStr: string;
      // if (diffDays === 0) dateStr = "Today";
      // else if (diffDays === 1) dateStr = "Yesterday";
      // else
      dateStr = date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });

      return { time, date: dateStr };
    }, [order.opened_at]);

    const handleRowPress = useCallback(() => {
      // onRowClick(order.id);
      usePaymentDetailSheetStore
      .getState()
      .open(
        order.id
      )
    }, [order.id, onRowClick]);

    const handleDoublePress = useCallback(() => {
      onDoubleClick(order.id);
    }, [order.id, onDoubleClick]);

    const handleMorePress = useCallback(
      (e: any) => {
        e.stopPropagation();
        buttonRef.current?.measureInWindow(
          (x: number, y: number, width: number, height: number) => {
            onMoreClick(order.id, { x, y, width, height });
          },
        );
      },
      [order.id, onMoreClick],
    );

    // Double-tap gesture (requires 2 taps within 250ms)
    const doubleTap = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .maxDuration(250)
          .onStart(() => {
            scale.value = withSequence(
              withSpring(0.95, { damping: 10, stiffness: 200 }),
              withSpring(1),
            );
            // runOnJS(handleDoublePress)();
          }),
      [handleDoublePress, scale],
    );

    // Single-tap gesture (fallback)
    const singleTap = useMemo(
      () =>
        Gesture.Tap().onEnd(() => {
          scale.value = withSequence(
            withSpring(0.98, { damping: 15, stiffness: 300 }),
            withSpring(1),
          );
          runOnJS(handleRowPress)();
        }),
      [handleRowPress, scale],
    );

    // Compose: double-tap takes priority, single-tap is fallback
    const composedTap = useMemo(
      () => Gesture.Exclusive(doubleTap, singleTap),
      [doubleTap, singleTap],
    );

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <GestureDetector gesture={composedTap}>
        <Animated.View
          style={[{ minHeight: 60 }, animatedStyle]}
          className={`
          flex-row items-center border-b border-gray-800
          ${isEven ? "bg-[#1a1a1a]" : "bg-[#202020]"}
        `}
        >
        {/* TIME Column - now includes order number */}
        <View className="flex-[1.5] py-3 px-4">
          <Text className="text-sm font-medium text-white">
            {timeDisplay.time}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {timeDisplay.date}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {order.display_number || order.order_number?.slice(-6) || "—"}
          </Text>
        </View>

        {/* ASSIGNEE Column - staff name preferred, then station */}
        <View className="flex-[2] py-3 px-4">
          <Text className="text-sm font-medium text-white">
            {order.server_name || order._sourceStationName || "Unknown"}
          </Text>
        </View>

        {/* ASSIGNMENT Column */}
        <View className="flex-[1.8] py-3 px-4">
          <Text className="text-sm font-medium text-white">
            {order.order_type || "—"}
          </Text>
          {order.service_location_id && (
            <Text className="text-xs text-gray-500 mt-0.5">
              Table{" "}
              {order.service_location_name ||
                getTableName(order.service_location_id)}
            </Text>
          )}
        </View>

        {/* CUSTOMER Column */}
        <View className="flex-[2] py-3 px-4">
          <Text className="text-sm font-medium text-white">
            {order.customer_name || "—"}
          </Text>
        </View>

        {/* ITEMS Column */}
        <View className="flex-1 py-3 px-4 items-center">
          <View className="bg-gray-700 rounded-full px-3 py-1 min-w-[32px] items-center">
            <Text className="text-sm font-semibold text-white">
              {order.items?.length || 0}
            </Text>
          </View>
        </View>

        {/* TOTAL Column with improved payment status colors */}
        <View className="flex-[1.5] py-3 px-4 items-end">
          <Text className="text-base font-bold text-white">
            ${(order.total_amount || 0).toFixed(2)}
          </Text>
          <Text
            className={`
            text-xs font-medium mt-0.5
            ${
              order.paid_status === "Paid"
                ? "text-green-400"
                : order.paid_status === "Partial"
                  ? "text-blue-400"
                  : "text-orange-400"
            }
          `}
          >
            {order.paid_status}
          </Text>
        </View>

        {/* ACTIONS Column */}
        <View className="w-[60px] py-3 px-4 items-center">
          <TouchableOpacity
            ref={buttonRef}
            onPress={handleMorePress}
            className="p-2 rounded-full active:bg-gray-600"
          >
            <MoreVertical size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

OrderRow.displayName = "OrderRow";

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  onDoubleClick,
  onMoreClick,
  refreshing,
  onRefresh,
}) => {
  // Lift store access to parent to simple prop passing
  const { tablesById } = useFloorPlanStore();

  // Stable table lookup function
  const getTableName = useCallback(
    (tableId: string | null | undefined): string => {
      if (!tableId) return "Unknown";
      const table = tablesById[tableId];
      return table?.name || "Unknown";
    },
    [tablesById],
  );

  // Sort orders based on current sort column and direction
  // This is expensive, so we memoize strictly
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case "time":
          aVal = new Date(a.opened_at || 0).getTime();
          bVal = new Date(b.opened_at || 0).getTime();
          break;
        case "assignee":
          aVal = (a.server_name || a._sourceStationName || "").toLowerCase();
          bVal = (b.server_name || b._sourceStationName || "").toLowerCase();
          break;
        case "assignment":
          aVal = (a.order_type || "").toLowerCase();
          bVal = (b.order_type || "").toLowerCase();
          break;
        case "customer":
          aVal = (a.customer_name || "walk-in").toLowerCase();
          bVal = (b.customer_name || "walk-in").toLowerCase();
          break;
        case "items":
          aVal = a.items?.length || 0;
          bVal = b.items?.length || 0;
          break;
        case "total":
          aVal = a.total_amount || 0;
          bVal = b.total_amount || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [orders, sortColumn, sortDirection]);

  // Use FlatList for better performance with large lists
  // This renders only items currently on screen
  const renderItem = useCallback(
    ({ item, index }: { item: OrderProfile; index: number }) => (
      <OrderRow
        order={item}
        isEven={index % 2 === 0}
        onRowClick={onRowClick}
        onDoubleClick={onDoubleClick}
        onMoreClick={onMoreClick}
        getTableName={getTableName}
      />
    ),
    [onRowClick, onDoubleClick, onMoreClick, getTableName],
  );

  return (
    <View className="flex-1 bg-[#1a1a1a] rounded-lg border border-gray-700">
      {/* Table Header */}
      <View className="flex-row bg-[#252525] border-b border-gray-700">
        {columns.map((column) => (
          <TouchableOpacity
            key={column.key}
            onPress={() => column.sortable && onSort(column.key as SortColumn)}
            disabled={!column.sortable}
            className={`
              py-3 px-4 flex-row items-center
              ${column.key === "time" ? "flex-[1.5]" : ""}
              ${column.key === "assignee" ? "flex-[2]" : ""}
              ${column.key === "assignment" ? "flex-[1.8]" : ""}
              ${column.key === "customer" ? "flex-[2]" : ""}
              ${column.key === "items" ? "flex-1" : ""}
              ${column.key === "total" ? "flex-[1.5]" : ""}
              ${column.key === "actions" ? "w-[60px]" : ""}
            `}
            style={{
              justifyContent:
                column.align === "right"
                  ? "flex-end"
                  : column.align === "center"
                    ? "center"
                    : "flex-start",
            }}
          >
            <Text className="text-xs font-bold text-gray-400 uppercase">
              {column.label}
            </Text>
            {column.sortable && sortColumn === column.key && (
              <View className="ml-1">
                {sortDirection === "asc" ? (
                  <ArrowUp size={12} color="#9CA3AF" />
                ) : (
                  <ArrowDown size={12} color="#9CA3AF" />
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Table Body - Optimized with FlatList */}
      <FlatList
        data={sortedOrders}
        renderItem={renderItem}
        keyExtractor={(item: OrderProfile) => item.id}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={() => (
          <View className="py-20 items-center justify-center">
            <Text className="text-gray-500 text-sm">No orders found</Text>
          </View>
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={true}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
};

export default memo(OrdersTable);
