import { Order } from "@/lib/types";
import { ArrowUpRight } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderCardProps {
  order: Order;
}

const OrderCard: React.FC<OrderCardProps> = ({ order }) => {
  // Determine styles based on the order status
  const isReady = order.status === "Ready";
  const statusBg = isReady ? "bg-[#2BAE7433]" : "bg-[#DC9F1E33]";
  const statusText = isReady ? "text-[#2BAE74]" : "text-[#DC9F1E]";

  return (
    <View className="bg-white p-4 rounded-2xl border border-background-400 w-72 mr-4">
      {/* Status Tag */}
      <View className={`px-2.5 py-1 rounded-3xl self-start ${statusBg}`}>
        <Text className={`text-xs font-bold ${statusText}`}>
          {order.status}
        </Text>
      </View>

      {/* Customer and Order ID */}
      <Text className="text-lg font-bold text-accent-500 mt-2">
        {order.customerName} #{order.id}
      </Text>

      {/* Order Type and Table Info */}
      <View className="flex-row justify-between mt-2">
        <Text className="text-sm text-accent-500 ">
          {order.type} • Table {order.table}
        </Text>
        <Text className="text-sm text-accent-500">{order.time}</Text>
      </View>

      {/* Action Buttons */}
      <View className="flex-row justify-between items-center mt-2">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity className="flex-row items-center justify-center p-2.5 rounded-xl border border-background-500 flex-1">
            <Text className="font-semibold text-[#282828] mr-1">Item</Text>
            <ArrowUpRight color="#4b5563" size={16} />
          </TouchableOpacity>
          <TouchableOpacity className="px-5 py-2.5 bg-primary-400 rounded-xl flex-1">
            <Text className="text-white font-bold text-center">Complete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default OrderCard;
