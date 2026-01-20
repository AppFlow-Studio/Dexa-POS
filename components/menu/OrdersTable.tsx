import { OrderProfile } from "@/lib/types";
import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react-native";
import React, { memo, useMemo, useCallback } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type SortColumn = "time" | "assignee" | "assignment" | "customer" | "total";
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
  { key: "total", label: "TOTAL", sortable: true, align: "right" },
  { key: "actions", label: "", sortable: false },
];

interface OrdersTableProps {
  orders: OrderProfile[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onRowClick: (orderId: string) => void;
  onMoreClick: (orderId: string) => void;
}

// Memoized row component for better performance
interface OrderRowProps {
  order: OrderProfile;
  isEven: boolean;
  onRowClick: (orderId: string) => void;
  onMoreClick: (orderId: string) => void;
}

const OrderRow = memo<OrderRowProps>(({ order, isEven, onRowClick, onMoreClick }) => {
  const formatTime = useCallback((timestamp: string | null | undefined) => {
    if (!timestamp) return { time: "—", date: "—" };
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    let dateStr: string;
    if (diffDays === 0) dateStr = "Today";
    else if (diffDays === 1) dateStr = "Yesterday";
    else dateStr = date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

    return { time, date: dateStr };
  }, []);

  const timeDisplay = formatTime(order.opened_at);

  const handleRowPress = useCallback(() => {
    onRowClick(order.id);
  }, [order.id, onRowClick]);

  const handleMorePress = useCallback((e: any) => {
    e.stopPropagation();
    onMoreClick(order.id);
  }, [order.id, onMoreClick]);

  return (
    <TouchableOpacity
      onPress={handleRowPress}
      className={`
        flex-row items-center border-b border-gray-800
        ${isEven ? "bg-[#1a1a1a]" : "bg-[#202020]"}
        hover:bg-gray-800 active:bg-gray-700
      `}
      style={{ minHeight: 60 }}
    >
      {/* TIME Column */}
      <View className="flex-[1.5] py-3 px-4">
        <Text className="text-sm font-medium text-white">
          {timeDisplay.time}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          {timeDisplay.date}
        </Text>
      </View>

      {/* ASSIGNEE Column */}
      <View className="flex-[2] py-3 px-4">
        <Text className="text-sm font-medium text-white">
          {order._sourceStationName || "Unknown"}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {order.display_number || order.order_number?.slice(-6) || "—"}
        </Text>
      </View>

      {/* ASSIGNMENT Column */}
      <View className="flex-[1.8] py-3 px-4">
        <Text className="text-sm font-medium text-white">
          {order.order_type || "—"}
        </Text>
        {order.service_location_id && (
          <Text className="text-xs text-gray-500 mt-0.5">
            Table {order.service_location_id}
          </Text>
        )}
      </View>

      {/* CUSTOMER Column */}
      <View className="flex-[2] py-3 px-4">
        <Text className="text-sm font-medium text-white">
          {order.customer_name || "—"}
        </Text>
      </View>

      {/* TOTAL Column */}
      <View className="flex-[1.5] py-3 px-4 items-end">
        <Text className="text-base font-bold text-white">
          ${(order.total_amount || 0).toFixed(2)}
        </Text>
        <Text
          className={`
            text-xs font-medium mt-0.5
            ${order.paid_status === "Paid" ? "text-gray-500" : "text-green-400"}
          `}
        >
          {order.paid_status}
        </Text>
      </View>

      {/* ACTIONS Column */}
      <View className="w-[60px] py-3 px-4 items-center">
        <TouchableOpacity
          onPress={handleMorePress}
          className="p-2 rounded-full hover:bg-gray-700 active:bg-gray-600"
        >
          <MoreVertical size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

OrderRow.displayName = "OrderRow";

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  onMoreClick,
}) => {
  // Sort orders based on current sort column and direction
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
          aVal = (a._sourceStationName || "").toLowerCase();
          bVal = (b._sourceStationName || "").toLowerCase();
          break;
        case "assignment":
          aVal = (a.order_type || "").toLowerCase();
          bVal = (b.order_type || "").toLowerCase();
          break;
        case "customer":
          aVal = (a.customer_name || "walk-in").toLowerCase();
          bVal = (b.customer_name || "walk-in").toLowerCase();
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
              ${column.key === "total" ? "flex-[1.5]" : ""}
              ${column.key === "actions" ? "w-[60px]" : ""}
            `}
            style={{ justifyContent: column.align === "right" ? "flex-end" : "flex-start" }}
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

      {/* Table Body */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={true}>
        {sortedOrders.length === 0 ? (
          <View className="py-20 items-center justify-center">
            <Text className="text-gray-500 text-sm">No orders found</Text>
          </View>
        ) : (
          sortedOrders.map((order, index) => (
            <OrderRow
              key={order.id}
              order={order}
              isEven={index % 2 === 0}
              onRowClick={onRowClick}
              onMoreClick={onMoreClick}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

export default memo(OrdersTable);
