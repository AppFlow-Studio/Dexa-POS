import { OrderProfile } from "@/lib/types";
import { CheckCircle, CreditCard, Eye } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";

interface OrderBadgeProps {
  order: OrderProfile;
  onMarkReady: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
}

const OrderBadge: React.FC<OrderBadgeProps> = ({
  order,
  onMarkReady,
  onViewItems,
  onRetrieve,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // --- Color logic updated to use backend status values ---
  const getStatusColor = (status: string, paidStatus: string) => {
    if (status === "preparing") {
      if (paidStatus === "Paid") {
        return {
          dot: "#3b82f6", // Teal
          bg: "#bae6fd", // Light blue
          border: "#2dd4bf", // Teal border
          text: "#134e4a", // Dark teal
        };
      } else {
        return {
          dot: "#f97316", // Orange
          bg: "#fef3c7", // Light yellow
          border: "#fbbf24", // Yellow border
          text: "#92400e", // Dark brown
        };
      }
    }
    if (status === "ready") {
      return {
        dot: "#10b981", // Green
        bg: "#d1fae5", // Light green
        border: "#34d399", // Green border
        text: "#065f46", // Dark green
      };
    }
    return {
      dot: "#6b7280", // Gray
      bg: "#f3f4f6", // Light gray
      border: "#d1d5db", // Gray border
      text: "#374151", // Dark gray
    };
  };

  const colors = getStatusColor(order.order_status, order.paid_status);

  return (
    <Popover
      isVisible={showTooltip}
      onRequestClose={() => setShowTooltip(false)}
      
      popoverStyle={{ backgroundColor: "#313131", borderRadius: 12 }}
      from={
        <TouchableOpacity
          onPress={() => setShowTooltip(true)}
          className="flex-row items-center px-3 py-2 rounded-lg border"
          style={{
            backgroundColor: colors.bg,
            borderColor: colors.border,
          }}
        >
          <View
            className="w-2.5 h-2.5 rounded-full mr-2"
            style={{ backgroundColor: colors.dot }}
          />
          <Text
            className="font-medium text-base"
            style={{ color: colors.text }}
            numberOfLines={1}
          >
            {order.customer_name
              ? order.customer_name
              : order.display_number || order.order_number || "New"}{" "}
            - {order.order_status}
          </Text>
        </TouchableOpacity>
      }
    >
      <View className="bg-[#313131] rounded-xl shadow-lg border border-gray-600 w-[380px]">
        <View className="p-4 border-b border-gray-600">
          {/* Flexible Header that wraps */}
          <View className="flex-row flex-wrap items-center gap-2 mb-3">
            <Text
              className="text-2xl font-bold text-white mr-2"
              numberOfLines={1}
            >
              {order.customer_name || "Walk-In"}
            </Text>
            <View className="px-2 py-1 rounded-md bg-gray-700/80">
              <Text className="text-sm font-semibold text-gray-300">
                {order.display_number || order.order_number || "New"}
              </Text>
            </View>
            <View className="px-2 py-1 rounded-md bg-blue-900/50">
              <Text className="text-sm font-semibold text-blue-400">
                {order.order_type}
              </Text>
            </View>
            <View
              className={`px-2 py-1 rounded-md ${
                order.paid_status === "Paid"
                  ? "bg-green-900/50"
                  : "bg-red-900/50"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  order.paid_status === "Paid"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {order.paid_status}
              </Text>
            </View>
            <View
              className={`px-2 py-1 rounded-md ${
                order.order_status === "preparing"
                  ? "bg-orange-900/50"
                  : "bg-gray-700/80"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  order.order_status === "preparing"
                    ? "text-orange-400"
                    : "text-gray-300"
                }`}
              >
                {order.order_status}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center w-full">
            <Text className="text-base text-gray-400">
              {order.items.length} items -{" "}
              {order.paid_status === "Paid"
                ? `$${order.total_amount?.toFixed(2)}`
                : "Pending"}
            </Text>
            <Text className="text-base text-gray-400">
              Opened at{" "}
              {new Date(order.opened_at!).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>

        {/* Action Buttons with Dark Theme */}
        <View className="flex-col gap-y-1 p-2">
          {order.order_status === "preparing" && (
            <TouchableOpacity
              onPress={() => {
                onMarkReady();
                setShowTooltip(false);
              }}
              className="flex-row items-center p-3 rounded-lg"
            >
              <CheckCircle color="#22c55e" size={20} />
              <Text className="ml-3 font-semibold text-green-300 text-lg">
                Mark as Done
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => {
              onViewItems();
              setShowTooltip(false);
            }}
            className="flex-row items-center p-3 rounded-lg"
          >
            <Eye color="#a1a1aa" size={20} />
            <Text className="ml-3 font-semibold text-gray-300 text-lg">
              View Items
            </Text>
          </TouchableOpacity>

          {order.paid_status !== "Paid" && (
            <TouchableOpacity
              onPress={() => {
                onRetrieve();
                setShowTooltip(false);
              }}
              className="flex-row items-center p-3 rounded-lg"
            >
              <CreditCard color="#60a5fa" size={20} />
              <Text className="ml-3 font-semibold text-blue-400 text-lg">
                Retrieve to Pay
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Popover>
  );
};

export default OrderBadge;
