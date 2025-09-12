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
  const statusBg = isReady ? "bg-[#2BAE7433]" : "bg-[#DC9F1E33]";
  const statusText = isReady ? "text-[#2BAE74]" : "text-[#DC9F1E]";
  const paidBg =
    order.paid_status === "Paid"
      ? "bg-green-100"
      : order.paid_status === "Pending"
        ? "bg-yellow-100"
        : "bg-red-100";
  const paidText =
    order.paid_status === "Paid"
      ? "text-green-700"
      : order.paid_status === "Pending"
        ? "text-yellow-700"
        : "text-red-700";

  return (
    <View className="bg-white p-4 rounded-2xl border border-background-400 w-72 mr-4">
      <View className="flex-row items-center gap-2">
        <View className={`px-2.5 py-1 rounded-3xl self-start ${statusBg}`}>
          <Text className={`text-xs font-bold ${statusText}`}>
            {order.order_status}
          </Text>
        </View>
        <View className={`px-2.5 py-1 rounded-3xl self-start ${paidBg}`}>
          <Text className={`text-xs font-bold ${paidText}`}>
            {order.paid_status}
          </Text>
        </View>
      </View>
      <Text className="text-lg font-bold text-accent-500 mt-2">
        {order.customer_name || "Walk-In"} #{order.id.slice(-5)}
      </Text>
      <View className="flex-row justify-between mt-2">
        <Text className="text-sm text-accent-500 ">
          {order.order_type}
          {order.service_location_id && (
            <>• Table {order.service_location_id}</>
          )}
        </Text>
        <Text className="text-sm text-accent-500">
          {new Date(order.opened_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={onViewItems}
            className="flex-row items-center justify-center p-2.5 rounded-xl border border-background-500"
          >
            <Text className="font-semibold text-[#282828] mr-1">Item</Text>
            <ArrowUpRight color="#4b5563" size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onComplete}
            className="px-5 py-2.5 bg-primary-400 rounded-xl flex-1"
          >
            <Text className="text-white font-bold text-center">Complete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default OrderCard;
