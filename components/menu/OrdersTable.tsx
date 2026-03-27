import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { ArrowDown, ArrowUp, Lock, MoreVertical, XCircle } from "lucide-react-native";
import React, { memo, useCallback, useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

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
  { key: "actions", label: "", sortable: false, width: "w-[48px]" },
];

interface OrdersTableProps {
  orders: OrderProfile[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onMoreClick: (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

// Status pill config — follows design_theme.md: bg=color+'20', border=color+'50'
const STATUS_PILL: Record<string, { bg: string; border: string; text: string; label: string }> = {
  Paid: {
    bg: colors.success + "20",
    border: colors.success + "50",
    text: colors.success,
    label: "Paid",
  },
  Pending: {
    bg: colors.warning + "20",
    border: colors.warning + "50",
    text: colors.warning,
    label: "Pending",
  },
  Unpaid: {
    bg: colors.warning + "20",
    border: colors.warning + "50",
    text: colors.warning,
    label: "Pending",
  },
  Partial: {
    bg: colors.paymentPartial + "20",
    border: colors.paymentPartial + "50",
    text: colors.paymentPartial,
    label: "Partial",
  },
  Refunded: {
    bg: colors.danger + "20",
    border: colors.danger + "50",
    text: colors.danger,
    label: "Refunded",
  },
};

const DEFAULT_PILL = {
  bg: colors.muted + "20",
  border: colors.muted + "30",
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

/** True when every card payment on the order has been settled. */
function isOrderFullySettled(order: OrderProfile): boolean {
  const cardPayments = (order.payments || []).filter(
    (p) => p.method !== "Cash" && !p.isVoided,
  );
  return cardPayments.length > 0 && cardPayments.every((p) => p.is_settled);
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
  onMoreClick: (
    orderId: string,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

const OrderRow = memo<OrderRowProps>(
  ({ order, onMoreClick }) => {
    const buttonRef = React.useRef<View | null>(null);

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

    const isVoided = order.order_status === "void";

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

    return (
      <TouchableOpacity onPress={handleRowPress} activeOpacity={0.7}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 52,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          {/* Left accent bar */}
          <View style={{ width: 3, alignSelf: "stretch", backgroundColor: leftBorderColor }} />

          {/* ORDER cell */}
          <View style={{ flex: 2, paddingVertical: 10, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading, letterSpacing: 0.2 }}>
                #{displayNumber}
              </Text>
              {order.order_source?.toLowerCase() === "online" && (
                <View style={{
                  backgroundColor: colors.teal + "25",
                  borderWidth: 1, borderColor: colors.teal + "60",
                  borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1,
                  flexDirection: "row", alignItems: "center", gap: 3,
                }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.teal }} />
                  <Text style={{ fontSize: 9, fontWeight: "700", color: colors.teal, letterSpacing: 0.3 }}>ONLINE</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, marginTop: 2, color: colors.muted }} numberOfLines={1}>
              {customerName !== "" ? customerName : "Walk-in"}
            </Text>
          </View>

          {/* TIME + TYPE cell */}
          <View style={{ flex: 2.5, paddingVertical: 10, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>{timeDisplay}</Text>
              {orderTypeLabel !== "" && (
                <View style={{
                  backgroundColor: colors.card,
                  borderWidth: 1, borderColor: colors.border,
                  borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: colors.label }}>{orderTypeLabel}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, marginTop: 2, color: colors.muted }}>{dateDisplay}</Text>
          </View>

          {/* STAFF cell */}
          <View style={{ flex: 1.5, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 12, color: colors.label }} numberOfLines={1}>
              {order.server_name || order._sourceStationName || "—"}
            </Text>
          </View>

          {/* TOTAL cell */}
          <View style={{ flex: 1.5, paddingVertical: 10, paddingHorizontal: 14, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
              ${(order.total_amount || 0).toFixed(2)}
            </Text>
            {hasCashTotal && (
              <Text style={{ fontSize: 11, marginTop: 2, color: colors.success }}>
                cash ${(order.total_cash_amount!).toFixed(2)}
              </Text>
            )}
          </View>

          {/* STATUS cell */}
          <View style={{ flex: 1.2, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", gap: 4 }}>
            <View style={{
              backgroundColor: pill.bg,
              borderWidth: 1,
              borderColor: pill.border,
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 20,
            }}>
              <Text style={{ color: pill.text, fontSize: 11, fontWeight: "700" }}>
                {pill.label}
              </Text>
            </View>
            {isVoided && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <XCircle size={9} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "600" }}>Voided</Text>
              </View>
            )}
            {isOrderFullySettled(order) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Lock size={9} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>Settled</Text>
              </View>
            )}
          </View>

          {/* ACTIONS cell */}
          <View style={{ width: 48, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" }}>
            <TouchableOpacity
              ref={buttonRef}
              onPress={handleMorePress}
              style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: colors.card,
                borderWidth: 1, borderColor: colors.border,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <MoreVertical size={13} color={colors.label} />
            </TouchableOpacity>
          </View>
        </View>
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
    ({ item }: { item: OrderProfile }) => (
      <OrderRow
        order={item}
        onMoreClick={onMoreClick}
      />
    ),
    [onMoreClick],
  );

  return (
    <View
      className="flex-1 rounded-lg overflow-hidden"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {/* Table Header */}
      <View
        className="flex-row"
        style={{ backgroundColor: colors.screen, borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        {columns.map((column) => (
          <TouchableOpacity
            key={column.key}
            onPress={() => column.sortable && onSort(column.key as SortColumn)}
            disabled={!column.sortable}
            className={`py-2 px-3 flex-row items-center gap-x-1 ${column.flex || ""} ${column.width || ""}`}
            style={{
              justifyContent:
                column.align === "right" ? "flex-end"
                : column.align === "center" ? "center"
                : "flex-start",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: sortColumn === column.key ? colors.teal : colors.muted,
              }}
            >
              {column.label}
            </Text>
            {column.sortable && sortColumn === column.key && (
              sortDirection === "asc"
                ? <ArrowUp size={10} color={colors.teal} />
                : <ArrowDown size={10} color={colors.teal} />
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
