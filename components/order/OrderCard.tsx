import { OrderProfile } from "@/lib/types";
import { ArrowUpRight } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderCardProps {
  order: OrderProfile;
  onViewItems: () => void;
  onComplete: () => void;
  onRetrieve?: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onViewItems,
  onComplete,
  onRetrieve,
}) => {
  const isReady =
    order.order_status === "Ready" || order.order_status === "Closed";
  const statusBg = isReady ? "bg-blue-100" : "bg-[#DC9F1E33]";
  const statusText = isReady ? "text-blue-700" : "text-[#DC9F1E]";
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
        ? "text-yellow-700"
        : "text-red-700";
  const isUnpaid = order.paid_status !== "Paid";
  return (
    <View className="bg-[#303030] p-3 rounded-2xl border border-gray-700 w-72 mr-4">
      <View className="flex-row items-center gap-2">
        <View className={`px-3 py-1 rounded-full self-start ${statusBg}`}>
          <Text className={`text-base font-bold ${statusText}`}>
            {order.order_status}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full self-start ${paidBg}`}>
          <Text className={`text-base font-bold ${paidText}`}>
            {order.paid_status}
          </Text>
        </View>
      </View>
      <Text className="text-xl font-bold text-white mt-2">
        {order.customer_name || "Walk-In"} #{order.id.slice(-5)}
      </Text>
      <View className="flex-row justify-between mt-2">
        <Text className="text-lg text-gray-400 ">
          {order.order_type}
          {order.service_location_id && (
            <> • Table {order.service_location_id}</>
          )}
        </Text>
        <Text className="text-lg text-gray-400">
          {new Date(order.opened_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          onPress={onViewItems}
          className="flex-row items-center justify-center py-2 px-3 rounded-xl border border-gray-600 bg-[#212121]"
        >
          <Text className="font-semibold text-white text-base mr-1">
            View Items
          </Text>
          <ArrowUpRight color="#FFFFFF" size={18} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onComplete}
          className="px-4 py-2 bg-blue-600 rounded-xl flex-1 ml-2"
        >
          <Text className="text-white font-bold text-center text-base">
            Complete
          </Text>
        </TouchableOpacity>
      </View>
      {isUnpaid && onRetrieve && (
        <View className="mt-2">
          <TouchableOpacity
            onPress={onRetrieve}
            className="px-4 py-2 bg-blue-600 rounded-xl"
          >
            <Text className="text-white font-bold text-center text-base">
              Retrieve to Pay
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default OrderCard;
