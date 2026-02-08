import { OrderProfile } from "@/lib/types";
import {
    CheckCircle,
    DollarSign,
    MoreHorizontal,
    Pencil,
    Printer,
    RefreshCw,
    Repeat2,
    Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import { DimensionValue, Text, TouchableOpacity, View } from "react-native";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface PreviousOrderRowProps {
  order: OrderProfile;
  onViewNotes: (order: OrderProfile) => void;
  onPrint: (order: OrderProfile) => void;
  onDelete: (order: OrderProfile) => void;
  onCloseCheck?: (order: OrderProfile) => void;
  onReopenCheck?: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
  onDoublePress?: (order: OrderProfile) => void;
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  Paid:                 { bg: "bg-green-900/50",  text: "text-green-400" },
  Partial:              { bg: "bg-yellow-900/50", text: "text-yellow-400" },
  Pending:              { bg: "bg-orange-900/50", text: "text-orange-400" },
  Unpaid:               { bg: "bg-red-900/50",    text: "text-red-400" },
  "In Progress":        { bg: "bg-blue-900/50",   text: "text-blue-400" },
  Refunded:             { bg: "bg-red-900/50",     text: "text-red-400" },
  "Partially Refunded": { bg: "bg-yellow-900/50", text: "text-yellow-400" },
};

const orderTypeConfig: Record<string, { bg: string; text: string }> = {
  "Dine In":  { bg: "bg-purple-900/50", text: "text-purple-400" },
  Takeaway:   { bg: "bg-orange-900/50", text: "text-orange-400" },
  Delivery:   { bg: "bg-cyan-900/50",   text: "text-cyan-400" },
};

const columnWidths: { [key: string]: DimensionValue } = {
  serial: "7%",
  date: "18%",
  orderId: "10%",
  customer: "12%",
  paymentStatus: "14%",
  server: "10%",
  items: "6%",
  type: "10%",
  total: "8%",
  notes: "8%",
  actions: "7%",
};

const PreviousOrderRowContent: React.FC<PreviousOrderRowProps> = ({
  order,
  onViewNotes,
  onPrint,
  onDelete,
  onCloseCheck,
  onReopenCheck,
  onRefund,
  onDoublePress,
}) => {
  const [lastPress, setLastPress] = useState<number>(0);
  const DOUBLE_PRESS_DELAY = 500; // milliseconds

  const handlePress = () => {
    const now = Date.now();
    if (now - lastPress < DOUBLE_PRESS_DELAY && lastPress !== 0) {
      // Double press detected
      if (onDoublePress) {
        onDoublePress(order);
      }
      setLastPress(0); // Reset
    } else {
      // Single press - just update timestamp
      setLastPress(now);
    }
  };

  // Format date and time from opened_at
  const orderDate = order.opened_at
    ? new Date(order.opened_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "-";

  const orderTime = order.opened_at
    ? new Date(order.opened_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const totalRefunded = (order.payments || []).reduce(
    (sum, p) => sum + (p.refundedAmount ?? 0), 0
  );
  const isFullyRefunded = order.order_status === "refunded" ||
    (totalRefunded > 0 && totalRefunded >= (order.total_amount || 0));

  const status = order.paid_status || "Unpaid";
  const statusStyle = statusConfig[status] || { bg: "bg-gray-700", text: "text-gray-300" };

  const orderType = order.order_type || "Dine In";
  const typeStyle = orderTypeConfig[orderType] || { bg: "bg-gray-700", text: "text-gray-300" };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      className="flex-row items-center p-4 border-b border-gray-700"
    >
      <Text
        style={{ width: columnWidths.serial }}
        className="text-base font-semibold text-gray-300 px-1.5"
      >
        {order.display_number || order.order_number || order.id}
      </Text>
      <View style={{ width: columnWidths.date }} className="px-1.5">
        <Text className="text-lg text-white font-semibold">{orderDate}</Text>
        <Text className="text-base text-gray-400">{orderTime}</Text>
      </View>
      <Text
        style={{ width: columnWidths.customer }}
        className="text-base font-semibold text-white px-1.5"
      >
        {order.customer_name || "Walk-In"}
      </Text>
      <View style={{ width: columnWidths.paymentStatus }} className="px-1.5">
        <View
          className={`px-3 py-1.5 rounded-md self-start ${statusStyle.bg}`}
        >
          <Text
            className={`font-bold text-base ${statusStyle.text}`}
          >
            {status}
          </Text>
        </View>
        {totalRefunded > 0 && (
          <View className={`px-2 py-1 rounded-md self-start mt-1 ${isFullyRefunded ? "bg-red-900/50" : "bg-yellow-900/50"}`}>
            <Text className={`font-bold text-xs ${isFullyRefunded ? "text-red-400" : "text-yellow-400"}`}>
              {isFullyRefunded ? "Refunded" : "Partial Refund"}
            </Text>
          </View>
        )}
        <View className={`mt-1 px-2 py-0.5 rounded self-start ${order.check_status === "Closed" ? "bg-gray-700" : "bg-emerald-900/30"}`}>
          <Text className={`text-xs font-semibold ${order.check_status === "Closed" ? "text-gray-300" : "text-emerald-400"}`}>
            {order.check_status === "Closed" ? "Closed" : "Open"}
          </Text>
        </View>
      </View>
      <Text
        style={{ width: columnWidths.server }}
        className="text-base font-semibold text-gray-300 px-1.5"
      >
        {order.server_name || "-"}
      </Text>
      <View style={{ width: columnWidths.items }} className="px-1.5">
        <View className="bg-gray-700 rounded-full px-2.5 py-0.5 self-start">
          <Text className="text-sm font-semibold text-gray-300 text-center">
            {order.items?.length || 0}
          </Text>
        </View>
      </View>
      <View style={{ width: columnWidths.type }} className="px-1.5">
        <View className={`px-2.5 py-1 rounded-md self-start ${typeStyle.bg}`}>
          <Text className={`text-base font-semibold ${typeStyle.text}`}>
            {orderType}
          </Text>
        </View>
        {/* Show source station for orders from other stations */}
        {order._sourceStationName && (
          <View className="flex-row items-center mt-0.5">
            <Repeat2 color="#3b82f6" size={10} />
            <Text className="text-blue-400 text-xs ml-1">
              {order._sourceStationName}
            </Text>
          </View>
        )}
      </View>
      <View style={{ width: columnWidths.total }}>
        <Text className="text-base font-bold text-white px-1.5">
          {`$${(order.total_amount ?? 0).toFixed(2)}`}
        </Text>
        {order.total_discount != null && order.total_discount > 0 && (
          <Text className="text-base text-red-400 px-1.5">
            {`-$${(order.total_discount ?? 0).toFixed(2)}`}
          </Text>
        )}
        {totalRefunded > 0 && (
          <Text className="text-sm font-medium text-red-400 px-1.5 mt-0.5">
            {`${isFullyRefunded ? "Refunded" : "Partial"} $${totalRefunded.toFixed(2)}`}
          </Text>
        )}
      </View>
      <View
        style={{ width: columnWidths.notes }}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <TouchableOpacity
          onPress={() => onViewNotes(order)}
          className="flex-row items-center justify-center gap-1 bg-blue-900/30 border border-blue-500 py-2 px-2 rounded-lg self-start"
        >
          <Text className="font-bold text-base text-blue-400">Notes</Text>
          <Pencil size={18} color="#60A5FA" />
        </TouchableOpacity>
      </View>
      <View style={{ width: columnWidths.actions }} className="items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-[#303030] border-gray-600">
            {/* Close Check (if paid and not closed) */}
            {order.paid_status === "Paid" &&
              order.check_status !== "Closed" &&
              onCloseCheck && (
                <DropdownMenuItem
                  onTouchStart={(e) => e.stopPropagation()}
                  onPress={() => onCloseCheck(order)}
                >
                  <CheckCircle className="mr-2 h-5 w-5" color="#4ade80" />
                  <Text className="text-xl text-white">Close Check</Text>
                </DropdownMenuItem>
              )}

            {/* Reopen Check (if closed) */}
            {order.check_status === "Closed" && onReopenCheck && (
              <DropdownMenuItem
                onTouchStart={(e) => e.stopPropagation()}
                onPress={() => onReopenCheck(order)}
              >
                <RefreshCw className="mr-2 h-5 w-5" color="#60a5fa" />
                <Text className="text-xl text-white">Reopen Check</Text>
              </DropdownMenuItem>
            )}

            {/* Process Refund */}
            {onRefund && (
              <DropdownMenuItem
                onTouchStart={(e) => e.stopPropagation()}
                onPress={() => onRefund(order)}
              >
                <DollarSign className="mr-2 h-5 w-5" color="#f59e0b" />
                <Text className="text-xl text-white">Process Refund</Text>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onTouchStart={(e) => e.stopPropagation()}
              onPress={() => onViewNotes(order)}
            >
              <Pencil className="mr-2 h-5 w-5" color="#9CA3AF" />
              <Text className="text-xl text-white">View Modifiers</Text>
            </DropdownMenuItem>
            <DropdownMenuItem
              onTouchStart={(e) => e.stopPropagation()}
              onPress={() => onPrint(order)}
            >
              <Printer className="mr-2 h-5 w-5" color="#9CA3AF" />
              <Text className="text-xl text-white">Print Receipt</Text>
            </DropdownMenuItem>
            <DropdownMenuItem
              onTouchStart={(e) => e.stopPropagation()}
              onPress={() => onDelete(order)}
            >
              <Trash2 className="mr-2 h-5 w-5" color="#F87171" />
              <Text className="text-xl text-red-400">Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </TouchableOpacity>
  );
};

const PreviousOrderRow = React.memo(PreviousOrderRowContent, (prev, next) => {
  return (
    prev.order.id === next.order.id &&
    prev.order.paid_status === next.order.paid_status &&
    prev.order.order_status === next.order.order_status &&
    prev.order.order_type === next.order.order_type &&
    prev.order.total_amount === next.order.total_amount &&
    prev.order.total_discount === next.order.total_discount &&
    prev.order.notes === next.order.notes &&
    prev.order.check_status === next.order.check_status &&
    prev.order.payments === next.order.payments
  );
});
export default PreviousOrderRow;
