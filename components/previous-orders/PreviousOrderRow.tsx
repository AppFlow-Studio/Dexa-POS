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
};

const PreviousOrderRow: React.FC<PreviousOrderRowProps> = ({
  order,
  onViewNotes,
  onPrint,
  onDelete,
}) => {
  const orderPath = `/previous-orders/${order.orderId.replace("#", "")}`;

  return (
    <Link href={orderPath as Href} asChild>
      <TouchableOpacity
        activeOpacity={0.7}
        className="flex-row items-center p-4 border-b border-gray-100"
      >
        {/* Define widths for columns for alignment */}
        <Text className="w-[8%] font-semibold text-gray-600">
          {order.serialNo}
        </Text>
        <View className="w-[12%]">
          <Text className="text-gray-800 font-semibold">{order.orderDate}</Text>
          <Text className="text-sm text-gray-500">{order.orderTime}</Text>
        </View>
        <Text className="w-[10%] font-semibold text-gray-600">
          {order.orderId}
        </Text>
        <View className="w-[12%]">
          <View
            className={`px-2 py-1 rounded-full self-start ${statusClasses[order.paymentStatus]}`}
          >
            <Text
              className={`font-bold text-xs ${statusClasses[order.paymentStatus]}`}
            >
              {order.paymentStatus}
            </Text>
          </View>
        </View>
        <Text className="w-[12%] font-semibold text-gray-600">
          {order.server}
        </Text>
        <Text className="w-[10%] font-semibold text-gray-600 text-center">
          {order.itemCount}
        </Text>
        <Text className="w-[10%] font-semibold text-gray-600">
          {order.type}
        </Text>
        <Text className="w-[10%] font-bold text-gray-800">
          ${order.total.toFixed(2)}
        </Text>
        <View className="w-[10%]" onTouchStart={(e) => e.stopPropagation()}>
          <TouchableOpacity
            onPress={() => onViewNotes(order)}
            className="flex-row items-center gap-1 bg-blue-50 py-1 px-2 rounded-md self-start"
          >
            <Text className="font-bold text-xs text-blue-600">Notes</Text>
            <Pencil size={12} color="#2563eb" />
          </TouchableOpacity>
        </View>
        <View className="w-[6%] items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-2">
                <MoreHorizontal color="#6b7280" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {/* Pass the whole order object to each handler */}
              <DropdownMenuItem onPress={() => onViewNotes(order)}>
                <Pencil className="mr-2 h-4 w-4" color="#4b5563" />
                <Text>View Modifiers</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={() => onPrint(order)}>
                <Printer className="mr-2 h-4 w-4" color="#4b5563" />
                <Text>Print Receipt</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={() => onDelete(order)}>
                <Trash2 className="mr-2 h-4 w-4 text-red-500" color="#ef4444" />
                <Text className="text-red-500">Delete</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

export default PreviousOrderRow;
