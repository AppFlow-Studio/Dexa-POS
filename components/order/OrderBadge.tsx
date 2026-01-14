import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useWasOrderRecentlyUpdated } from "@/stores/useConflictStore";
import { CheckCircle, CreditCard, Eye, Repeat2, RefreshCw } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View, Animated } from "react-native";
import Popover from "react-native-popover-view";

interface OrderBadgeProps {
  order: OrderProfile;
  onMarkReady: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
}

const OrderBadgeComponent: React.FC<OrderBadgeProps> = ({
  order,
  onMarkReady,
  onViewItems,
  onRetrieve,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Phase 6: Check if order was recently updated by another station
  const wasRecentlyUpdated = useWasOrderRecentlyUpdated(order.db_order_id || order.id);

  // Calculate payment info - prioritize backend values
  const amountDue = order.amount_due ?? order.total_amount ?? 0;
  const amountPaid = order.amount_paid ?? 0;
  const isPartiallyPaid = amountPaid > 0 && order.paid_status !== "Paid";
  const hasPayments = (order.payments?.length ?? 0) > 0;
//  console.log("order [OrderBadgeComponent]", order.display_number,  order.amount_due);
  // Cash pricing - use backend value or fallback to amountDue (no savings if not available)
  const cashAmountDue = order.cash_amount_due ?? amountDue;
  const cashSavings = amountDue - cashAmountDue;

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
      } else if( paidStatus === "Partial" ) {
        return {
          dot: "#8b5cf6", // Purple
          bg: "#f5f3ff", // Light purple
          border: "#c4b5fd", // Purple border
          text: "#581c87", // Dark purple
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
            borderColor: wasRecentlyUpdated ? "#3b82f6" : colors.border,
            borderWidth: wasRecentlyUpdated ? 2 : 1,
          }}
        >
          {/* Phase 6: Updated indicator */}
          {wasRecentlyUpdated && (
            <View className="mr-1.5">
              <RefreshCw color="#3b82f6" size={14} />
            </View>
          )}
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
              : order.display_number || order.order_number || `#${order.id.slice(-4)}`}{" "}
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
                {order.display_number || order.order_number || `#${order.id.slice(-4)}`}
              </Text>
            </View>
            <View className="px-2 py-1 rounded-md bg-blue-900/50">
              <Text className="text-sm font-semibold text-blue-400">
                {order.order_type}
              </Text>
            </View>
            <View
              className={`px-2 py-1 rounded-md ${order.paid_status === "Paid"
                ? "bg-green-900/50"
                : order.paid_status === "Partial" || isPartiallyPaid
                  ? "bg-purple-900/50"
                  : "bg-red-900/50"
                }`}
            >
              <Text
                className={`text-sm font-semibold ${order.paid_status === "Paid"
                  ? "text-green-400"
                  : order.paid_status === "Partial" || isPartiallyPaid
                    ? "text-purple-400"
                    : "text-red-400"
                  }`}
              >
                {order.paid_status === "Paid"
                  ? "Paid"
                  : order.paid_status === "Partial" || isPartiallyPaid
                    ? "Partial"
                    : order.paid_status}
              </Text>
            </View>
            <View
              className={`px-2 py-1 rounded-md ${order.order_status === "preparing"
                ? "bg-orange-900/50"
                : "bg-gray-700/80"
                }`}
            >
              <Text
                className={`text-sm font-semibold ${order.order_status === "preparing"
                  ? "text-orange-400"
                  : "text-gray-300"
                  }`}
              >
                {order.order_status}
              </Text>
            </View>
          </View>

          {/* Show source station for orders from other stations */}
          {order._sourceStationName && order.station_id !== useOrderStore.getState().currentStationId && (
            <View className="flex-row items-center mt-2 pt-2 border-t border-gray-700">
              <Repeat2 color="#3b82f6" size={14} />
              <Text className="text-blue-400 text-xs ml-1">
                From: {order._sourceStationName}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between items-center w-full">
            <View>
              <Text className="text-base text-gray-400">
                {order.items.length} items - Total: ${order.total_amount?.toFixed(2) || "0.00"}
              </Text>
              {/* Show paid amount if there are partial payments */}
              {isPartiallyPaid && (
                <Text className="text-sm text-green-400 font-medium">
                  Paid: ${amountPaid.toFixed(2)}
                </Text>
              )}
              {/* Show outstanding amount if not fully paid */}
              {order.paid_status !== "Paid" && amountDue > 0.01 && (
                <Text className="text-sm text-yellow-400 font-bold">
                  Due: ${amountDue.toFixed(2)}
                </Text>
              )}
              {/* Show cash savings option */}
              {order.paid_status !== "Paid" && cashSavings > 0.01 && (
                <Text className="text-xs text-green-400">
                  Cash: ${cashAmountDue.toFixed(2)} (save ${cashSavings.toFixed(2)})
                </Text>
              )}
              {order.paid_status === "Paid" && (
                <Text className="text-sm text-green-400 font-medium">
                  Fully Paid ✓
                </Text>
              )}
            </View>
            <Text className="text-base text-gray-400">
              Opened at{" "}
              {new Date(order.opened_at!).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>

        {/* Payment Breakdown (show if there are payments) */}
        {hasPayments && order.payments && order.payments.length > 0 && (
          <View className="px-4 py-2 border-b border-gray-600">
            <Text className="text-gray-500 text-xs uppercase mb-1 font-medium">
              Payments
            </Text>
            {order.payments
              .filter((p) => !p.isVoided)
              .map((p, i) => (
                <View key={i} className="flex-row justify-between items-center py-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-gray-300 text-sm">{p.method}</Text>
                    {p.last4 && (
                      <Text className="text-gray-500 text-xs">••••{p.last4}</Text>
                    )}
                  </View>
                  <Text className="text-gray-300 text-sm font-medium">
                    ${p.amount.toFixed(2)}
                  </Text>
                </View>
              ))}
          </View>
        )}

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

          {order.paid_status !== "Paid" && amountDue > 0.01 && (
            <TouchableOpacity
              onPress={() => {
                onRetrieve();
                setShowTooltip(false);
              }}
              className="flex-row items-center justify-between p-3 rounded-lg bg-blue-600/20"
            >
              <View className="flex-row items-center">
                <CreditCard color="#60a5fa" size={20} />
                <Text className="ml-3 font-semibold text-blue-400 text-lg">
                  {isPartiallyPaid ? "Pay Remaining" : "Retrieve to Pay"}
                </Text>
              </View>
              <Text className="font-bold text-blue-400 text-lg">
                ${amountDue.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Popover>
  );
};

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const OrderBadge = React.memo(OrderBadgeComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.order.id === next.order.id &&
    prev.order.order_status === next.order.order_status &&
    prev.order.paid_status === next.order.paid_status &&
    prev.order.items.length === next.order.items.length &&
    prev.order.amount_due === next.order.amount_due &&
    prev.order.amount_paid === next.order.amount_paid &&
    prev.order.total_amount === next.order.total_amount &&
    prev.order.customer_name === next.order.customer_name &&
    prev.order.payments?.length === next.order.payments?.length &&
    // Station-related fields for display
    prev.order.station_id === next.order.station_id &&
    prev.order._sourceStationName === next.order._sourceStationName
  );
});

export default OrderBadge;
