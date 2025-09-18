import { PreviousOrder } from "@/lib/types";
import { Href, Link } from "expo-router";
import { MoreHorizontal, Pencil, Printer, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface PreviousOrderRowProps {
  order: PreviousOrder;
  onViewNotes: (order: PreviousOrder) => void;
  onPrint: (order: PreviousOrder) => void;
  onDelete: (order: PreviousOrder) => void;
}

const statusClasses: Record<string, string> = {
  Paid: "bg-green-100 text-green-800",
  "In Progress": "bg-orange-100 text-orange-800",
  Refunded: "bg-gray-200 text-gray-600",
  "Partially Refunded": "bg-yellow-100 text-yellow-800",
};

const PreviousOrderRow: React.FC<PreviousOrderRowProps> = ({
  order,
  onViewNotes,
  onPrint,
  onDelete,
}) => {
  const orderPath = `/previous-orders/${order.orderId}`;

  return (
    <Link href={orderPath as Href} asChild>
      <TouchableOpacity
        activeOpacity={0.7}
        className="flex-row items-center p-6 border-b border-gray-700"
      >
        <Text
          style={{ width: "9%" }}
          className="text-lg font-semibold text-gray-300 px-2"
        >
          {order.serialNo}
        </Text>
        <View style={{ width: "9%" }} className="px-2">
          <Text className="text-xl text-white font-semibold">
            {order.orderDate}
          </Text>
          <Text className="text-lg text-gray-400">{order.orderTime}</Text>
        </View>
        <Text
          style={{ width: "9%" }}
          className="text-lg font-semibold text-gray-300 px-2"
        >
          {order.orderId}
        </Text>
        <Text
          style={{ width: "12%" }}
          className="text-lg font-semibold text-white px-2"
        >
          {order.customer}
        </Text>
        <View style={{ width: "9%" }} className="px-2">
          <View
            className={`px-3 py-2 rounded-full self-start ${statusClasses[order.paymentStatus]}`}
          >
            <Text
              className={`font-bold text-lg ${statusClasses[order.paymentStatus]}`}
            >
              {order.paymentStatus}
            </Text>
          </View>
        </View>
        <Text
          style={{ width: "9%" }}
          className="text-lg font-semibold text-gray-300 px-2"
        >
          {order.server}
        </Text>
        <Text
          style={{ width: "7%" }}
          className="text-lg font-semibold text-gray-300 text-center px-2"
        >
          {order.itemCount}
        </Text>
        <Text
          style={{ width: "9%" }}
          className="text-lg font-semibold text-gray-300 px-2"
        >
          {order.type}
        </Text>
        <View style={{ width: "9%" }}>
          <Text className="text-lg font-bold text-white px-2">
            ${order.total.toFixed(2)}
          </Text>
          {order.refundedAmount != null && order.refundedAmount > 0 && (
            <Text className="text-lg text-red-400">
              -${order.refundedAmount.toFixed(2)}
            </Text>
          )}
        </View>
        <View
          style={{ width: "12%" }}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <TouchableOpacity
            onPress={() => onViewNotes(order)}
            className="flex-row items-center justify-center gap-1 bg-blue-900/30 border border-blue-500 py-3 px-3 rounded-lg self-start"
          >
            <Text className="font-bold text-xl text-blue-400">Notes</Text>
            <Pencil size={20} color="#60A5FA" />
          </TouchableOpacity>
        </View>
        <View style={{ width: "5%" }} className="items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-2">
                <MoreHorizontal color="#9CA3AF" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-[#303030] border-gray-600">
              <DropdownMenuItem
                onTouchStart={(e) => e.stopPropagation()}
                onPress={() => onViewNotes(order)}
              >
                <Pencil className="mr-2 h-6 w-6" color="#9CA3AF" />
                <Text className="text-2xl text-white">View Modifiers</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onTouchStart={(e) => e.stopPropagation()}
                onPress={() => onPrint(order)}
              >
                <Printer className="mr-2 h-6 w-6" color="#9CA3AF" />
                <Text className="text-2xl text-white">Print Receipt</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onTouchStart={(e) => e.stopPropagation()}
                onPress={() => onDelete(order)}
              >
                <Trash2 className="mr-2 h-6 w-6 text-red-400" color="#F87171" />
                <Text className="text-2xl text-red-400">Delete</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

export default PreviousOrderRow;
