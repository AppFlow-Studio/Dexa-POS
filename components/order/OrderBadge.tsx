import { OrderProfile } from "@/lib/types";
import { CheckCircle, CreditCard, Eye } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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
    <Tooltip className="relative">
      <TooltipTrigger
        // onPress={() => setShowTooltip(!showTooltip)}
        className={`flex-row items-center px-4 py-3 rounded-full border`}
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
        }}
      >
        {/* Status Dot */}
        <View
          className={`w-3 h-3 rounded-full mr-2`}
          style={{ backgroundColor: colors.dot }}
        />

        {/* Order Number and Status */}
        <Text className={`font-medium text-xl`} style={{ color: colors.text }}>
          {order.customer_name ? order.customer_name : `#${orderNumber}`} -{" "}
          {order.order_status} ({order.paid_status})
        </Text>
      </TooltipTrigger>

      {/* Tooltip */}
      <TooltipContent side="bottom" className=" -top-20 bg-white rounded-xl shadow-lg border border-gray-200 z-50 w-[40%]">
        <View className="py-2 flex-col justify-center gap-y-3 items-center w-full">
          <View className="flex-col justify-start items-center w-full px-6 gap-y-3">
            <View className="w-full flex flex-row justify-center items-center">
              {order.customer_name && <Text className="text-3xl font-bold text-accent-500 mr-4">
                {order.customer_name}
              </Text>}
              <View className="flex-row gap-2">
                {/* Order ID Badge */}
                <View className="px-3 py-1 rounded-full bg-gray-100 border border-gray-300">
                  <Text className="text-xl font-semibold text-gray-700">
                    #{order.id.slice(-4)}
                  </Text>
                </View>
                {/* Order Type Badge */}
                <View className="px-3 py-1 rounded-full bg-blue-100 border border-blue-200">
                  <Text className="text-xl font-semibold text-blue-700">
                    {order.order_type}
                  </Text>
                </View>
                {/* Paid Status Badge */}
                <View
                  className={`px-3 py-1 rounded-full border ${order.paid_status === "Paid"
                    ? "bg-green-100 border-green-200"
                    : order.paid_status === "Pending"
                      ? "bg-yellow-100 border-yellow-200"
                      : "bg-red-100 border-red-200"
                    }`}
                >
                  <Text
                    className={`text-xl font-semibold ${order.paid_status === "Paid"
                      ? "text-green-700"
                      : order.paid_status === "Pending"
                        ? "text-yellow-700"
                        : "text-red-700"
                      }`}
                  >
                    {order.paid_status}
                  </Text>
                </View>
                {/* Order Status Badge */}
                <View
                  className={`px-3 py-1 rounded-full border ${order.order_status === "Ready"
                    ? "bg-green-50 border-green-200"
                    : order.order_status === "Preparing"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-gray-100 border-gray-200"
                    }`}
                >
                  <Text
                    className={`text-xl font-semibold ${order.order_status === "Ready"
                      ? "text-green-700"
                      : order.order_status === "Preparing"
                        ? "text-yellow-700"
                        : "text-gray-700"
                      }`}
                  >
                    {order.order_status}
                  </Text>
                </View>
              </View>
            </View>
            <View className="flex-row justify-between items-center w-full">
              <Text className="text-xl text-accent-500 ">
                {" "}
                {order.items.length} items -{" "}
                {order.paid_status === "Paid"
                  ? `${order.total_amount?.toFixed(2)}`
                  : "Pending"}
              </Text>
              <Text className="text-xl">
                Opened at{" "}
                {new Date(order.opened_at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
          {/* Mark Ready Button */}
  
          {/* 
                Need to set up here stock management logic
              */}
          {order.order_status === "Preparing" && <Button
            variant="outline"
            onPress={() => {
              onMarkReady();
              setShowTooltip(false);
            }}
            className="flex-row items-center px-4 py-3 bg-green-200 w-[95%] self-center border-b border-gray-100 hover:bg-gray-50"
          >
            <CheckCircle color="#10b981" size={24} />
            <Text className="ml-2 font-medium text-gray-800 text-xl">
              Mark as Done
            </Text>
          </Button>}
  
          {/* View Items Button */}
          <Button
            variant="outline"
            onPress={() => {
              onViewItems();
              setShowTooltip(false);
            }}
            className="flex-row items-center px-4 py-3  w-[95%] self-center hover:bg-gray-50"
          >
            <Eye color="#6b7280" size={24} />
            <Text className="ml-2 font-medium text-gray-800 text-xl">
              View Items
            </Text>
          </Button>
  
          {
            order.paid_status !== "Paid" && (
              <Button
                variant="outline"
                onPress={() => {
                  setShowTooltip(false);
                  onRetrieve();
                }}
                className="flex-row items-center flex px-4 py-3 w-[95%] self-center justify-center bg-blue-200 "
              >
                <CreditCard color="blue" size={24} />
                <Text className="ml-2 font-medium text-blue-700 text-xl">
                  Retrieve to Pay
                </Text>
              </Button>
            )
          }
        </View>
      </TooltipContent>

      {/* Overlay to close tooltip when clicking outside */}
      {showTooltip && (
        <TouchableOpacity
          style={{
            position: "absolute",
            top: -1000,
            left: -1000,
            right: -1000,
            bottom: -1000,
            zIndex: 40,
          }}
          onPress={() => setShowTooltip(false)}
          activeOpacity={1}
        />
      )}
    </Tooltip>
  );
};

export default OrderBadge;
