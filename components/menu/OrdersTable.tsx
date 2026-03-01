import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  withSequence,
  withSpring
} from "react-native-reanimated";

export type SortColumn =
  | "order"
  | "time"
  | "staff"
  | "total"
  | "status";
export type SortDirection = "asc" | "desc";

interface ColumnConfig {
  key: SortColumn | "actions";
  label: string;
  sortable: boolean;
  flex?: string;
  width?: string;
  align?: "left" | "center" | "right";
}

const columns: ColumnConfig[] = [
  { key: "order", label: "ORDER", sortable: true, flex: "flex-[2]" },
  { key: "time", label: "TIME", sortable: true, flex: "flex-[2.5]" },
  { key: "staff", label: "STAFF", sortable: true, flex: "flex-[1.5]" },
  { key: "total", label: "TOTAL", sortable: true, flex: "flex-[1.5]", align: "right" },
  { key: "status", label: "STATUS", sortable: true, flex: "flex-[1.2]", align: "center" },
  { key: "actions", label: "", sortable: false, width: "w-[60px]" },
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

// Status pill config
const STATUS_PILL: Record<string, { bg: string; text: string; label: string }> = {
  Paid: {
    bg: "rgba(34,197,94,0.20)",
    text: colors.paymentPaid,
    label: "Paid",
  },
  Pending: {
    bg: "rgba(251,191,36,0.20)",
    text: colors.warning,
    label: "Pending",
  },
  Unpaid: {
    bg: "rgba(251,191,36,0.20)",
    text: colors.warning,
    label: "Pending",
  },
  Partial: {
    bg: "rgba(249,115,22,0.20)",
    text: colors.paymentPartial,
    label: "Partial",
  },
  Refunded: {
    bg: "rgba(239,68,71,0.20)",
    text: colors.danger,
    label: "Refunded",
  },
};

const DEFAULT_PILL = {
  bg: "rgba(156,163,175,0.20)",
  text: colors.label,
  label: "Unknown",
};

// Left border color by status
function getLeftBorderColor(order: OrderProfile): string {
  if (order.order_status === "refunded") return colors.danger;

  const totalRefunded = (order.payments || []).reduce(
    (sum, p) => sum + (p.refundedAmount ?? 0),
    0,
  );
  if (totalRefunded > 0 && totalRefunded >= (order.total_amount || 0))
    return colors.danger;

  switch (order.paid_status) {
    case "Paid":
      return colors.muted;
    case "Partial":
      return colors.paymentPartial;
    case "Pending":
    case "Unpaid":
    default:
      return colors.warning;
  }
}

// Effective display status (accounts for refunds)
function getEffectiveStatus(order: OrderProfile): string {
  if (order.order_status === "refunded") return "Refunded";
  const totalRefunded = (order.payments || []).reduce(
    (sum, p) => sum + (p.refundedAmount ?? 0),
    0,
  );
  if (totalRefunded > 0 && totalRefunded >= (order.total_amount || 0))
    return "Refunded";
  return order.paid_status || "Pending";
}

// Sort priority for status column
const STATUS_SORT_PRIORITY: Record<string, number> = {
  Pending: 0,
  Unpaid: 0,
  Partial: 1,
  Paid: 2,
  Refunded: 3,
};

// Memoized row component
interface OrderRowProps {
  order: OrderProfile;
  isEven: boolean;
  onRowClick: (orderId: string) => void;
  onDoubleClick: (orderId: string) => void;
  onMoreClick: (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

const OrderRow = memo<OrderRowProps>(
  ({ order, isEven, onRowClick, onDoubleClick, onMoreClick }) => {
    const buttonRef = React.useRef<React.ElementRef<
      typeof TouchableOpacity
    > | null>(null);
    const scale = useSharedValue(1);

    // Time + order type display
    const timeDisplay = useMemo(() => {
      const timestamp = order.opened_at;
      if (!timestamp) return "—";
      const date = new Date(timestamp);
      const time = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return time;
    }, [order.opened_at]);

    const dateDisplay = useMemo(() => {
      const timestamp = order.opened_at;
      if (!timestamp) return "";
      const date = new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });
    }, [order.opened_at]);

    const orderTypeLabel = order.order_type || "";

    const displayNumber = order.display_number || order.order_number?.slice(-6) || "—";
    const customerName = order.customer_name || "";

    const effectiveStatus = useMemo(() => getEffectiveStatus(order), [order]);
    const pill = STATUS_PILL[effectiveStatus] || DEFAULT_PILL;
    const leftBorderColor = useMemo(() => getLeftBorderColor(order), [order]);

    const hasCashTotal =
      order.total_cash_amount != null &&
      order.total_cash_amount !== order.total_amount;

    const handleRowPress = useCallback(() => {
      usePaymentDetailSheetStore.getState().open(order.id);
    }, [order.id]);

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

    return (
      <TouchableOpacity onPress={handleRowPress} activeOpacity={0.7}>
        <Animated.View
          style={[
            { minHeight: 56, borderLeftWidth: 3, borderLeftColor: leftBorderColor, marginVertical : 1, borderRadius: 10 },
          ]}
          className={`
            flex-row items-center
            ${isEven ? "bg-panel" : "bg-screen"}
          `}
        >
          {/* ORDER cell */}
          <View className="flex-[2] py-3 px-4">
            <Text className="text-sm font-bold text-heading">
              {displayNumber}
            </Text>
            {customerName !== "" && (
              <Text className="text-xs text-hint mt-0.5" numberOfLines={1}>
                {customerName}
              </Text>
            )}
          </View>

          {/* TIME cell */}
          <View className="flex-[2.5] py-3 px-4">
            <Text className="text-sm text-heading" numberOfLines={1}>
              {timeDisplay}
              {orderTypeLabel ? ` · ${orderTypeLabel}` : ""}
            </Text>
            <Text className="text-xs text-hint mt-0.5">{dateDisplay}</Text>
          </View>

          {/* STAFF cell */}
          <View className="flex-[1.5] py-3 px-4">
            <Text className="text-sm text-heading" numberOfLines={1}>
              {order.server_name || order._sourceStationName || "—"}
            </Text>
          </View>

          {/* TOTAL cell */}
          <View className="flex-[1.5] py-3 px-4 items-end">
            <Text className="text-sm font-bold text-heading">
              ${(order.total_amount || 0).toFixed(2)}
            </Text>
            {hasCashTotal && (
              <Text
                className="text-xs mt-0.5"
                style={{ color: colors.success }}
              >
                Cash ${(order.total_cash_amount!).toFixed(2)}
              </Text>
            )}
          </View>

          {/* STATUS cell */}
          <View className="flex-[1.2] py-3 px-4 items-center">
            <View
              style={{
                backgroundColor: pill.bg,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Text
                style={{ color: pill.text, fontSize: 12, fontWeight: "600" }}
              >
                {pill.label}
              </Text>
            </View>
          </View>

          {/* ACTIONS cell */}
          <View className="w-[60px] py-3 px-4 items-center">
            <TouchableOpacity
              ref={buttonRef}
              onPress={handleMorePress}
              className="p-2 rounded-full active:bg-gray-600"
            >
              <MoreVertical size={16} color={colors.label} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableOpacity>
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
  // Sort orders based on current sort column and direction
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case "order":
          aVal = a.display_number || "";
          bVal = b.display_number || "";
          break;
        case "time":
          aVal = new Date(a.opened_at || 0).getTime();
          bVal = new Date(b.opened_at || 0).getTime();
          break;
        case "staff":
          aVal = (a.server_name || a._sourceStationName || "").toLowerCase();
          bVal = (b.server_name || b._sourceStationName || "").toLowerCase();
          break;
        case "total":
          aVal = a.total_amount || 0;
          bVal = b.total_amount || 0;
          break;
        case "status": {
          const aStatus = getEffectiveStatus(a);
          const bStatus = getEffectiveStatus(b);
          aVal = STATUS_SORT_PRIORITY[aStatus] ?? 99;
          bVal = STATUS_SORT_PRIORITY[bStatus] ?? 99;
          break;
        }
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [orders, sortColumn, sortDirection]);

  const renderItem = useCallback(
    ({ item, index }: { item: OrderProfile; index: number }) => (
      <OrderRow
        order={item}
        isEven={index % 2 === 0}
        onRowClick={onRowClick}
        onDoubleClick={onDoubleClick}
        onMoreClick={onMoreClick}
      />
    ),
    [onRowClick, onDoubleClick, onMoreClick],
  );

  return (
    <View
      className="flex-1 rounded-lg overflow-hidden"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {/* Table Header */}
      <View
        className="flex-row bg-panel"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        {columns.map((column) => (
          <TouchableOpacity
            key={column.key}
            onPress={() => column.sortable && onSort(column.key as SortColumn)}
            disabled={!column.sortable}
            className={`
              py-3 px-4 flex-row items-center
              ${column.flex || ""}
              ${column.width || ""}
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
            <Text
              className="text-xs font-bold uppercase"
              style={{ color: colors.label }}
            >
              {column.label}
            </Text>
            {column.sortable && sortColumn === column.key && (
              <View className="ml-1">
                {sortDirection === "asc" ? (
                  <ArrowUp size={12} color={colors.teal} />
                ) : (
                  <ArrowDown size={12} color={colors.teal} />
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Table Body */}
      <FlatList
        data={sortedOrders}
        renderItem={renderItem}
        keyExtractor={(item: OrderProfile) => item.id}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={() => (
          <View className="py-20 items-center justify-center">
            <Text style={{ color: colors.muted }} className="text-sm">
              No orders found
            </Text>
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
