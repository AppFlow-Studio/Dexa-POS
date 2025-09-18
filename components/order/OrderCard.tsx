import { OrderProfile } from "@/lib/types";
import { ArrowUpRight } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderCardProps {
  order: OrderProfile;
  onViewItems: () => void;
  onComplete: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onViewItems,
  onComplete,
}) => {
  const isReady = order.order_status === "Ready";
  const statusBg = isReady ? "bg-green-500/20" : "bg-yellow-500/20";
  const statusText = isReady ? "text-green-400" : "text-yellow-400";
  const paidBg =
    order.paid_status === "Paid"
      ? "bg-green-500/20"
      : order.paid_status === "Pending"
        ? "bg-yellow-500/20"
        : "bg-red-500/20";
  const paidText =
    order.paid_status === "Paid"
      ? "text-green-400"
      : order.paid_status === "Pending"
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <View className="bg-[#303030] p-4 rounded-2xl border border-gray-700 w-80 mr-4">
      <View className="flex-row items-center gap-2">
        <View className={`px-3 py-1 rounded-full self-start ${statusBg}`}>
          <Text className={`text-lg font-bold ${statusText}`}>
            {order.order_status}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full self-start ${paidBg}`}>
          <Text className={`text-lg font-bold ${paidText}`}>
            {order.paid_status}
          </Text>
        </View>
      </View>
      <Text className="text-2xl font-bold text-white mt-2">
        {order.customer_name || "Walk-In"} #{order.id.slice(-5)}
      </Text>
      <View className="flex-row justify-between mt-2">
        <Text className="text-xl text-gray-400 ">
          {order.order_type}
          {order.service_location_id && (
            <> • Table {order.service_location_id}</>
          )}
        </Text>
        <Text className="text-xl text-gray-400">
          {new Date(order.opened_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          onPress={onViewItems}
          className="flex-row items-center justify-center p-3 rounded-xl border border-gray-600 bg-[#212121]"
        >
          <Text className="font-semibold text-white text-lg mr-1">
            View Items
          </Text>
          <ArrowUpRight color="#FFFFFF" size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onComplete}
          className="px-5 py-3 bg-blue-600 rounded-xl flex-1 ml-2"
        >
          <Text className="text-white font-bold text-center text-lg">
            Complete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderCard;
