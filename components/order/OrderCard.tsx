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
  const statusBg = isReady ? "bg-green-100" : "bg-yellow-100";
  const statusText = isReady ? "text-green-800" : "text-yellow-800";

  return (
    <View className="bg-white p-4 rounded-2xl border border-gray-200 w-72 mr-4">
      {/* Status Tag */}
      <View className={`px-2.5 py-1 rounded-md self-start ${statusBg}`}>
        <Text className={`text-xs font-bold ${statusText}`}>
          {order.status}
        </Text>
      </View>

      {/* Customer and Order ID */}
      <Text className="text-lg font-bold text-gray-800 mt-2">
        {order.customerName} #{order.id}
      </Text>

      {/* Order Type and Table Info */}
      <Text className="text-sm text-gray-500 mt-1">
        {order.type} • Table {order.table}
      </Text>

      {/* Action Buttons */}
      <View className="flex-row justify-between items-center mt-6">
        <Text className="text-sm text-gray-500">{order.time}</Text>
        <View className="flex-row items-center space-x-2">
          <TouchableOpacity className="flex-row items-center justify-center p-2.5 rounded-lg border border-gray-300">
            <Text className="font-semibold text-gray-700 mr-1">Item</Text>
            <ArrowUpRight color="#4b5563" size={16} />
          </TouchableOpacity>
          <TouchableOpacity className="px-5 py-2.5 bg-blue-500 rounded-lg">
            <Text className="text-white font-bold">Complete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default OrderCard;
