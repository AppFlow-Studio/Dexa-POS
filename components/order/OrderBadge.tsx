import { OrderProfile } from "@/lib/types";
import { CheckCircle, CreditCard, Eye } from "lucide-react-native";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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

  const getStatusColor = (status: string, paidStatus: string) => {
    if (status === "Preparing") {
      if (paidStatus === "Paid") {
        // Preparing (Paid) - teal/green
        return {
          dot: "#3b82f6", // Teal
          bg: "#bae6fd", // Light blue
          border: "#2dd4bf", // Teal border
          text: "#134e4a", // Dark teal
        };
      } else {
        // Preparing (Unpaid or Pending) - orange
        return {
          dot: "#f97316", // Orange
          bg: "#fef3c7", // Light yellow
          border: "#fbbf24", // Yellow border
          text: "#92400e", // Dark brown
        };
      }
    }
    if (status === "Ready") {
      return {
        dot: "#10b981", // Green
        bg: "#d1fae5", // Light green
        border: "#34d399", // Green border
        text: "#065f46", // Dark green
      };
    }
    // Default
    return {
      dot: "#6b7280", // Gray
      bg: "#f3f4f6", // Light gray
      border: "#d1d5db", // Gray border
      text: "#374151", // Dark gray
    };
  };

  const colors = getStatusColor(order.order_status, order.paid_status);
  const orderNumber = order.id.slice(-4); // Last 4 digits
  return (
    <Tooltip onOpenChange={setShowTooltip}>
      <TooltipTrigger
        className={`flex-row items-center px-3 py-2 rounded-full border`}
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
        }}
      >
        <View
          className={`w-2.5 h-2.5 rounded-full mr-2`}
          style={{ backgroundColor: colors.dot }}
        />
        <Text
          className={`font-medium text-base`}
          style={{ color: colors.text }}
        >
          {order.customer_name ? order.customer_name : `#${orderNumber}`} -{" "}
          {order.order_status}
        </Text>
      </TooltipTrigger>

      <TooltipContent
        side="bottom"
        className="bg-white rounded-xl shadow-lg border border-gray-200 z-50 w-[400px]"
      >
        <View className="py-2 flex-col justify-center gap-y-2 items-center w-full">
          <View className="flex-col justify-start items-center w-full px-4 pt-2 gap-y-2">
            <View className="w-full flex flex-row justify-center items-center">
              {order.customer_name && (
                <Text className="text-2xl font-bold text-accent-500 mr-3">
                  {order.customer_name}
                </Text>
              )}
              <View className="flex-row gap-1.5">
                <View className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-300">
                  <Text className="text-base font-semibold text-gray-700">
                    #{order.id.slice(-4)}
                  </Text>
                </View>
                <View className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200">
                  <Text className="text-base font-semibold text-blue-700">
                    {order.order_type}
                  </Text>
                </View>
                <View
                  className={`px-2 py-0.5 rounded-full border ${order.paid_status === "Paid" ? "bg-green-100 border-green-200" : order.paid_status === "Pending" ? "bg-yellow-100 border-yellow-200" : "bg-red-100 border-red-200"}`}
                >
                  <Text
                    className={`text-base font-semibold ${order.paid_status === "Paid" ? "text-green-700" : order.paid_status === "Pending" ? "text-yellow-700" : "text-red-700"}`}
                  >
                    {order.paid_status}
                  </Text>
                </View>
              </View>
            </View>
            <View className="flex-row justify-between items-center w-full">
              <Text className="text-lg text-accent-500">
                {order.items.length} items -{" "}
                {order.paid_status === "Paid"
                  ? `$${order.total_amount?.toFixed(2)}`
                  : "Pending"}
              </Text>
              <Text className="text-lg">
                Opened at{" "}
                {new Date(order.opened_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>

          {order.order_status === "Preparing" && (
            <Button
              variant="outline"
              onPress={() => {
                onMarkReady();
                setShowTooltip(false);
              }}
              className="flex-row items-center px-4 py-2 bg-green-200 w-[95%] self-center border-b border-gray-100"
            >
              <CheckCircle color="#10b981" size={20} />
              <Text className="ml-2 font-medium text-gray-800 text-lg">
                Mark as Done
              </Text>
            </Button>
          )}

          <Button
            variant="outline"
            onPress={() => {
              onViewItems();
              setShowTooltip(false);
            }}
            className="flex-row items-center px-4 py-2 w-[95%] self-center"
          >
            <Eye color="#6b7280" size={20} />
            <Text className="ml-2 font-medium text-gray-800 text-lg">
              View Items
            </Text>
          </Button>

          {order.paid_status !== "Paid" && (
            <Button
              variant="outline"
              onPress={() => {
                setShowTooltip(false);
                onRetrieve();
              }}
              className="flex-row items-center px-4 py-2 w-[95%] self-center justify-center bg-blue-200"
            >
              <CreditCard color="blue" size={20} />
              <Text className="ml-2 font-medium text-blue-700 text-lg">
                Retrieve to Pay
              </Text>
            </Button>
          )}
        </View>
      </TooltipContent>
    </Tooltip>
  );
};

export default OrderBadge;
