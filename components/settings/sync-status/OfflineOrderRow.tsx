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
    <View className="flex-row items-center p-4 border-b border-gray-700 bg-[#212121]">
      {/* Column widths are set to match the header */}
      <Text className="w-1/6 font-semibold text-gray-300 text-lg">
        {order.serialNo}
      </Text>
      <View className="w-1/6">
        <Text className="font-semibold text-white text-lg">
          {order.orderDate}
        </Text>
        <Text className="text-base text-gray-400">{order.orderTime}</Text>
      </View>
      <Text className="w-1/6 font-semibold text-gray-300 text-lg">
        {order.orderId}
      </Text>
      <View className="w-1/6">
        <TouchableOpacity className="flex-row items-center gap-1 bg-[#303030] border border-gray-600 py-1 px-2 rounded-md self-start">
          <Text className="font-semibold text-sm text-gray-300">
            {order.server}
          </Text>
          <ArrowUpRight size={12} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
      <Text className="w-1/6 font-bold text-white text-lg">
        ${order.total.toFixed(2)}
      </Text>
      <View className="w-1/6 items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2 rounded-md hover:bg-gray-700">
              <MoreHorizontal size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-32 bg-[#303030]">
            <DropdownMenuItem>
              <Zap className="mr-1.5 h-3.5 w-3.5 " color="#d1d5db" />
              <Text
                className="text-sm text-gray-300"
                onPress={() => alert("Sync")}
              >
                Sync
              </Text>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Trash2
                className="mr-1.5 h-3.5 w-3.5 text-red-500"
                color="#ef4444"
              />
              <Text
                className="text-red-500 text-sm"
                onPress={() => alert("Delete")}
              >
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
