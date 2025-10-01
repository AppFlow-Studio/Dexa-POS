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
    <View className="flex-row items-center p-3 border-b border-background-400">
      {/* Column widths are set to match the header */}
      <Text className="w-1/6 font-semibold text-gray-600 text-sm">
        {order.serialNo}
      </Text>
      <View className="w-1/6">
        <Text className="font-semibold text-gray-800 text-sm">
          {order.orderDate}
        </Text>
        <Text className="text-xs text-gray-500">{order.orderTime}</Text>
      </View>
      <Text className="w-1/6 font-semibold text-gray-600 text-sm">
        {order.orderId}
      </Text>
      <View className="w-1/6">
        <TouchableOpacity className="flex-row items-center gap-1 bg-gray-100 py-0.5 px-1.5 rounded-md self-start">
          <Text className="font-semibold text-[10px] text-gray-600">
            {order.server}
          </Text>
          <ArrowUpRight size={10} color="#4b5563" />
        </TouchableOpacity>
      </View>
      <Text className="w-1/6 font-bold text-gray-800 text-sm">
        ${order.total.toFixed(2)}
      </Text>
      <View className="w-1/6 items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-1.5 rounded-md hover:bg-gray-100">
              <MoreHorizontal size={18} color="#6b7280" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-32">
            <DropdownMenuItem>
              <Zap className="mr-1.5 h-3.5 w-3.5" color="#4b5563" />
              <Text className="text-sm" onPress={() => alert("Sync")}>
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
