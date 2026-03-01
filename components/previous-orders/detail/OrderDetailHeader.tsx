import { colors } from "@/lib/theme";
import { PreviousOrder } from "@/lib/types";
import { ArrowLeft, ShoppingBag, Truck, Utensils } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderDetailHeaderProps {
  order: PreviousOrder;
  onBack: () => void;
}

const statusConfig: Record<
  string,
  { bg: string; text: string; label?: string }
> = {
  Paid: { bg: "bg-green-900/50", text: "text-green-400" },
  Refunded: { bg: "bg-red-900/50", text: "text-red-400" },
  "Partially Refunded": { bg: "bg-yellow-900/50", text: "text-yellow-400" },
  Unpaid: { bg: "bg-gray-700/50", text: "text-gray-400" },
  "In Progress": { bg: "bg-blue-900/50", text: "text-blue-400" },
};

const checkStatusConfig: Record<string, { bg: string; text: string }> = {
  Opened: { bg: "bg-blue-900/50", text: "text-blue-400" },
  Closed: { bg: "bg-gray-700/50", text: "text-gray-400" },
};

const orderTypeConfig: Record<
  string,
  { icon: React.ElementType; bg: string; text: string; iconColor: string }
> = {
  "Dine In": {
    icon: Utensils,
    bg: "bg-purple-900/50",
    text: "text-purple-400",
    iconColor: "#C084FC",
  },
  Takeaway: {
    icon: ShoppingBag,
    bg: "bg-orange-900/50",
    text: "text-orange-400",
    iconColor: "#FB923C",
  },
  Delivery: {
    icon: Truck,
    bg: "bg-cyan-900/50",
    text: "text-cyan-400",
    iconColor: "#22D3EE",
  },
};

const OrderDetailHeader: React.FC<OrderDetailHeaderProps> = ({
  order,
  onBack,
}) => {
  const paymentStyle = statusConfig[order.paymentStatus] || statusConfig.Unpaid;
  const checkStyle =
    checkStatusConfig[order.checkStatus || "Opened"] ||
    checkStatusConfig.Opened;
  const typeStyle = orderTypeConfig[order.type] || orderTypeConfig["Dine In"];
  const TypeIcon = typeStyle.icon;

  return (
    <View className="bg-screen px-4 py-3 border-b border-border">
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={onBack}
          className="p-2 rounded-lg bg-panel mr-3"
          activeOpacity={0.7}
        >
          <ArrowLeft color={colors.label} size={22} />
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-white flex-1" numberOfLines={1}>
          Order {order.display_number || `#${order.orderId.slice(-6)}`}
        </Text>

        <View className="flex-row gap-2 ml-2">
          {/* Payment Status Badge */}
          <View
            className={`px-2.5 py-1 rounded-full ${paymentStyle.bg} border border-gray-600/30`}
          >
            <Text className={`text-xs font-semibold ${paymentStyle.text}`}>
              {order.paymentStatus}
            </Text>
          </View>

          {/* Check Status Badge */}
          <View
            className={`px-2.5 py-1 rounded-full ${checkStyle.bg} border border-gray-600/30`}
          >
            <Text className={`text-xs font-semibold ${checkStyle.text}`}>
              {order.checkStatus || "Opened"}
            </Text>
          </View>

          {/* Order Type Badge */}
          <View
            className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 ${typeStyle.bg} border border-gray-600/30`}
          >
            <TypeIcon color={typeStyle.iconColor} size={12} />
            <Text className={`text-xs font-semibold ${typeStyle.text}`}>
              {order.type}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default React.memo(OrderDetailHeader);
