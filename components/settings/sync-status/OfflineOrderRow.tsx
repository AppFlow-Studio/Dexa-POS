import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfflineOrder } from "@/lib/types";
import { ArrowUpRight, MoreHorizontal, Trash2, Zap } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const OfflineOrderRow: React.FC<{ order: OfflineOrder }> = ({ order }) => {
  return (
    <View className="flex-row items-center p-4 border-b border-gray-100">
      {/* Column widths are set to match the header */}
      <Text className="w-1/6 font-semibold text-gray-600">
        {order.serialNo}
      </Text>
      <View className="w-1/6">
        <Text className="font-semibold text-gray-800">{order.orderDate}</Text>
        <Text className="text-sm text-gray-500">{order.orderTime}</Text>
      </View>
      <Text className="w-1/6 font-semibold text-gray-600">{order.orderId}</Text>
      <View className="w-1/6">
        <TouchableOpacity className="flex-row items-center gap-1 bg-gray-100 py-1 px-2 rounded-md self-start">
          <Text className="font-semibold text-xs text-gray-600">
            {order.server}
          </Text>
          <ArrowUpRight size={12} color="#4b5563" />
        </TouchableOpacity>
      </View>
      <Text className="w-1/6 font-bold text-gray-800">
        ${order.total.toFixed(2)}
      </Text>
      <View className="w-1/6 items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2 rounded-md hover:bg-gray-100">
              <MoreHorizontal color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-32">
            <DropdownMenuItem>
              <Zap className="mr-2 h-4 w-4" color="#4b5563" />
              <Text onPress={() => alert("Sync")}>Sync</Text>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Trash2 className="mr-2 h-4 w-4 text-red-500" color="#ef4444" />
              <Text className="text-red-500" onPress={() => alert("Delete")}>
                Delete
              </Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

export default OfflineOrderRow;
