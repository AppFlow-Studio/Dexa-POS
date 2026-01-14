/**
 * PaymentStatusBadge Component
 *
 * Phase 3.2: Fine Dining Table Management
 * Displays color-coded payment status badge for tables.
 */

import React from "react";
import { Text, View } from "react-native";

export type PaymentStatus = "Paid" | "Partial" | "Pending" | "Unpaid";

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  size?: "sm" | "md";
}

// Color mappings for payment statuses
const STATUS_COLORS: Record<PaymentStatus, string> = {
  Paid: "bg-green-500",
  Partial: "bg-yellow-500",
  Pending: "bg-gray-500",
  Unpaid: "bg-red-500",
};

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({
  status,
  size = "sm",
}) => {
  const bgColor = STATUS_COLORS[status];
  const sizeClasses = size === "sm"
    ? "px-2 py-0.5"
    : "px-3 py-1";
  const textSizeClass = size === "sm" ? "text-xs" : "text-sm";

  return (
    <View className={`${bgColor} ${sizeClasses} rounded-full`}>
      <Text className={`${textSizeClass} text-white font-semibold`}>
        {status}
      </Text>
    </View>
  );
};
