import { OrderProfile } from "@/lib/types";
import { CheckCircle, DollarSign, MoreHorizontal, Pencil, Printer, RefreshCw, Repeat2, Trash2 } from "lucide-react-native";
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

const statusClasses: Record<string, string> = {
  Paid: "bg-green-100 text-green-800",
  "In Progress": "bg-orange-100 text-orange-800",
  Refunded: "bg-gray-200 text-gray-600",
  "Partially Refunded": "bg-yellow-100 text-yellow-800",
  Unpaid: "bg-red-100 text-red-800",
};

const columnWidths: { [key: string]: DimensionValue } = {
  serial: "8%",
  date: "12%",
  orderId: "10%",
  customer: "12%",
  paymentStatus: "10%",
  server: "10%",
  items: "7%",
  type: "10%",
  total: "8%",
  notes: "8%",
  actions: "5%",
};

const PreviousOrderRow: React.FC<PreviousOrderRowProps> = ({
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
          <Text className="text-lg text-white font-semibold">
            {orderDate}
          </Text>
          <Text className="text-base text-gray-400">{orderTime}</Text>
        </View>
        <Text
          style={{ width: columnWidths.orderId }}
          className="text-base font-semibold text-gray-300 px-1.5"
        >
          {order.order_number || order.id}
        </Text>
        <Text
          style={{ width: columnWidths.customer }}
          className="text-base font-semibold text-white px-1.5"
        >
          {order.customer_name || "Walk-In"}
        </Text>
        <View style={{ width: columnWidths.paymentStatus }} className="px-1.5">
          <View
            className={`px-3 py-1.5 rounded-md  self-start ${
              statusClasses[order.paid_status || "Unpaid"]
            }`}
          >
            <Text
              className={`font-bold text-base ${
                statusClasses[order.paid_status || "Unpaid"]
              }`}
            >
              {order.paid_status || "Unpaid"}
            </Text>
          </View>
        </View>
        <Text
          style={{ width: columnWidths.server }}
          className="text-base font-semibold text-gray-300 px-1.5"
        >
          {order.server_name || "-"}
        </Text>
        <Text
          style={{ width: columnWidths.items }}
          className="text-base font-semibold text-gray-300 text-center px-1.5"
        >
          {order.items?.length || 0}
        </Text>
        <View style={{ width: columnWidths.type }} className="px-1.5">
          <Text className="text-base font-semibold text-gray-300">
            {order.order_type || "Dine In"}
          </Text>
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
            ${order.total_amount?.toFixed(2) || "0.00"}
          </Text>
          {order.total_discount != null && order.total_discount > 0 && (
            <Text className="text-base text-red-400">
              -${order.total_discount?.toFixed(2)}
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
              {order.paid_status === "Paid" && order.check_status !== "Closed" && onCloseCheck && (
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

export default PreviousOrderRow;
