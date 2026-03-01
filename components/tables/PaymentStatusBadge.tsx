/**
 * PaymentStatusBadge Component
 *
 * Phase 3.2: Fine Dining Table Management
 * Displays color-coded payment status badge for tables.
 */

import { PAYMENT_STATUS_COLORS } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";

export type PaymentStatus = "Paid" | "Partial" | "Pending" | "Unpaid";

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  size?: "sm" | "md";
}

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({
  status,
  size = "sm",
}) => {
  const sizeClasses = size === "sm"
    ? "px-2 py-0.5"
    : "px-3 py-1";
  const textSizeClass = size === "sm" ? "text-xs" : "text-sm";

  return (
    <View
      className={`${sizeClasses} rounded-full`}
      style={{ backgroundColor: PAYMENT_STATUS_COLORS[status] }}
    >
      <Text className={`${textSizeClass} text-white font-semibold`}>
        {status}
      </Text>
    </View>
  );
};
