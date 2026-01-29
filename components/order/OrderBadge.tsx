import { OrderProfile } from "@/lib/types";
import { useWasOrderRecentlyUpdated } from "@/stores/useConflictStore";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  CheckCircle,
  CreditCard,
  Eye,
  RefreshCw,
  Repeat2,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";

interface OrderBadgeProps {
  order: OrderProfile;
  onMarkReady: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
}

// ============================================================================
// MEMOIZED COLOR HELPER - Extracted outside component to avoid recreation
// ============================================================================
const getStatusColor = (status: string, paidStatus: string, refundState?: { isFullyRefunded: boolean; isPartiallyRefunded: boolean }) => {
  // Handle refund states first - they take priority
  if (refundState?.isFullyRefunded) {
    return {
      dot: "#ef4444",
      bg: "#fef2f2",
      border: "#f87171",
      text: "#991b1b",
    };
  }
  if (refundState?.isPartiallyRefunded) {
    return {
      dot: "#f97316",
      bg: "#fff7ed",
      border: "#fb923c",
      text: "#9a3412",
    };
  }
  
  if (status === "preparing") {
    if (paidStatus === "Paid") {
      return {
        dot: "#3b82f6",
        bg: "#bae6fd",
        border: "#2dd4bf",
        text: "#134e4a",
      };
    } else if (paidStatus === "Partial") {
      return {
        dot: "#8b5cf6",
        bg: "#f5f3ff",
        border: "#c4b5fd",
        text: "#581c87",
      };
    } else {
      return {
        dot: "#f97316",
        bg: "#fef3c7",
        border: "#fbbf24",
        text: "#92400e",
      };
    }
  }
  if (status === "ready") {
    return {
      dot: "#10b981",
      bg: "#d1fae5",
      border: "#34d399",
      text: "#065f46",
    };
  }
  return {
    dot: "#6b7280",
    bg: "#f3f4f6",
    border: "#d1d5db",
    text: "#374151",
  };
};

// ============================================================================
// LAZY POPOVER CONTENT - Only renders when popover is visible
// ============================================================================
interface PopoverContentProps {
  order: OrderProfile;
  currentStationId: string | null;
  onMarkReady: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
  onClose: () => void;
}

const PopoverContent = React.memo<PopoverContentProps>(
  ({
    order,
    currentStationId,
    onMarkReady,
    onViewItems,
    onRetrieve,
    onClose,
  }) => {
    // Memoize refund status
    const refundStatus = useMemo(() => {
      const payments = order.payments || [];
      if (payments.length === 0) {
        return { hasRefund: false, isFullyRefunded: false, isPartiallyRefunded: false, totalRefunded: 0 };
      }
      
      const totalRefunded = payments.reduce((sum, p) => sum + (p.refundedAmount ?? 0), 0);
      const hasRefund = totalRefunded > 0;
      const isFullyRefunded = payments.length > 0 && payments.every(
        p => (p.refundedAmount ?? 0) >= (p.amount ?? 0)
      );
      const isPartiallyRefunded = hasRefund && !isFullyRefunded;
      
      return { hasRefund, isFullyRefunded, isPartiallyRefunded, totalRefunded };
    }, [order.payments]);

    // Memoize payment calculations
    const {
      amountDue,
      amountPaid,
      isPartiallyPaid,
      hasPayments,
      cashAmountDue,
      cashSavings,
    } = useMemo(() => {
      const due = order.amount_due ?? order.total_amount ?? 0;
      const paid = order.amount_paid ?? 0;
      const partial = paid > 0 && order.paid_status !== "Paid";
      const payments = (order.payments?.length ?? 0) > 0;
      const cashDue = order.cash_amount_due ?? due;
      const savings = due - cashDue;
      return {
        amountDue: due,
        amountPaid: paid,
        isPartiallyPaid: partial,
        hasPayments: payments,
        cashAmountDue: cashDue,
        cashSavings: savings,
      };
    }, [
      order.amount_due,
      order.total_amount,
      order.amount_paid,
      order.paid_status,
      order.payments?.length,
      order.cash_amount_due,
    ]);

    // Memoize formatted time - expensive Date operation
    const formattedTime = useMemo(() => {
      if (!order.opened_at) return "";
      return new Date(order.opened_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }, [order.opened_at]);

    // Memoize display ID
    const displayId = useMemo(() => {
      return (
        order.display_number || order.order_number || `#${order.id.slice(-4)}`
      );
    }, [order.display_number, order.order_number, order.id]);

    // Check if from another station
    const isFromOtherStation =
      order._sourceStationName && order.station_id !== currentStationId;

    return (
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
                {displayId}
              </Text>
            </View>
            <View className="px-2 py-1 rounded-md bg-blue-900/50">
              <Text className="text-sm font-semibold text-blue-400">
                {order.order_type}
              </Text>
            </View>
            <View
              className={`px-2 py-1 rounded-md ${
                refundStatus.isFullyRefunded
                  ? "bg-red-900/50"
                  : refundStatus.isPartiallyRefunded
                    ? "bg-orange-900/50"
                    : order.paid_status === "Paid"
                      ? "bg-green-900/50"
                      : order.paid_status === "Partial" || isPartiallyPaid
                        ? "bg-purple-900/50"
                        : "bg-red-900/50"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  refundStatus.isFullyRefunded
                    ? "text-red-400"
                    : refundStatus.isPartiallyRefunded
                      ? "text-orange-400"
                      : order.paid_status === "Paid"
                        ? "text-green-400"
                        : order.paid_status === "Partial" || isPartiallyPaid
                          ? "text-purple-400"
                          : "text-red-400"
                }`}
              >
                {refundStatus.isFullyRefunded
                  ? "REFUNDED"
                  : refundStatus.isPartiallyRefunded
                    ? "Partial Refund"
                    : order.paid_status === "Paid"
                      ? "Paid"
                      : order.paid_status === "Partial" || isPartiallyPaid
                        ? "Partial"
                        : order.paid_status}
              </Text>
            </View>
            {/* Closed badge when check is closed */}
            {order.check_status === "Closed" && (
              <View className="px-2 py-1 rounded-md bg-gray-700/50">
                <Text className="text-sm font-semibold text-gray-400">
                  Closed
                </Text>
              </View>
            )}
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

          {/* Show source station for orders from other stations */}
          {isFromOtherStation && (
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
                {order.items.length} items - Total: $
                {order.total_amount?.toFixed(2) || "0.00"}
              </Text>
              {refundStatus.totalRefunded > 0 && (
                <Text className="text-sm text-red-400 font-medium">
                  Refunded: ${refundStatus.totalRefunded.toFixed(2)}
                </Text>
              )}
              {isPartiallyPaid && !refundStatus.isFullyRefunded && (
                <Text className="text-sm text-green-400 font-medium">
                  Paid: ${amountPaid.toFixed(2)}
                </Text>
              )}
              {!refundStatus.isFullyRefunded && amountDue > 0.01 && (
                <Text className="text-sm text-yellow-400 font-bold">
                  Due: ${amountDue.toFixed(2)}
                </Text>
              )}
              {order.paid_status !== "Paid" && !refundStatus.hasRefund && cashSavings > 0.01 && (
                <Text className="text-xs text-green-400">
                  Cash: ${cashAmountDue.toFixed(2)} (save $
                  {cashSavings.toFixed(2)})
                </Text>
              )}
              {order.paid_status === "Paid" && !refundStatus.hasRefund && (
                <Text className="text-sm text-green-400 font-medium">
                  Fully Paid
                </Text>
              )}
              {refundStatus.isFullyRefunded && (
                <Text className="text-sm text-red-400 font-medium">
                  Order Refunded
                </Text>
              )}
            </View>
            <Text className="text-base text-gray-400">
              Opened at {formattedTime}
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
                <View
                  key={i}
                  className="flex-row justify-between items-center py-0.5"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-gray-300 text-sm">{p.method}</Text>
                    {p.last4 && (
                      <Text className="text-gray-500 text-xs">
                        ••••{p.last4}
                      </Text>
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
                onClose();
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
              onClose();
            }}
            className="flex-row items-center p-3 rounded-lg"
          >
            <Eye color="#a1a1aa" size={20} />
            <Text className="ml-3 font-semibold text-gray-300 text-lg">
              View Items
            </Text>
          </TouchableOpacity>

          {order.paid_status !== "Paid" && amountDue > 0.01 && order.check_status !== "Closed" && (
            <TouchableOpacity
              onPress={() => {
                onRetrieve();
                onClose();
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
    );
  },
);

// ============================================================================
// MAIN COMPONENT - Lightweight badge with lazy popover
// ============================================================================
const OrderBadgeComponent: React.FC<OrderBadgeProps> = ({
  order,
  onMarkReady,
  onViewItems,
  onRetrieve,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // PERFORMANCE: Get currentStationId via selector (not getState() during render)
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const activeOrderId = useOrderStore((s) => s.activeOrderId)

  // Phase 6: Check if order was recently updated by another station
  const wasRecentlyUpdated = useWasOrderRecentlyUpdated(
    order.db_order_id || order.id,
  );

  // Calculate refund status for badge colors
  const refundState = useMemo(() => {
    const payments = order.payments || [];
    if (payments.length === 0) {
      return { isFullyRefunded: false, isPartiallyRefunded: false };
    }
    
    const hasRefund = payments.some(p => (p.refundedAmount ?? 0) > 0);
    const isFullyRefunded = payments.length > 0 && payments.every(
      p => (p.refundedAmount ?? 0) >= (p.amount ?? 0)
    );
    const isPartiallyRefunded = hasRefund && !isFullyRefunded;
    
    return { isFullyRefunded, isPartiallyRefunded };
  }, [order.payments]);

  // PERFORMANCE: Memoize colors calculation with refund state
  const colors = useMemo(
    () => getStatusColor(order.order_status, order.paid_status, refundState),
    [order.order_status, order.paid_status, refundState],
  );

  // PERFORMANCE: Memoize display text - include refund status if applicable
  const badgeText = useMemo(() => {
    const name = order.customer_name
      ? order.customer_name
      : order.display_number || order.order_number || `#${order.id.slice(-4)}`;
    const statusText = refundState.isFullyRefunded 
      ? "REFUNDED"
      : refundState.isPartiallyRefunded 
        ? "partial refund"
        : order.order_status;
    return `${name} - ${statusText}`;
  }, [
    order.customer_name,
    order.display_number,
    order.order_number,
    order.id,
    order.order_status,
    refundState,
  ]);

  // PERFORMANCE: Memoize callbacks to prevent recreation
  const handleClose = useCallback(() => setShowTooltip(false), []);
  const handleOpen = useCallback(() => setShowTooltip(true), []);

  return (
    <Popover
      isVisible={showTooltip}
      onRequestClose={handleClose}
      // PERFORMANCE: Disable animation for instant appearance
      animationConfig={{ duration: 0 }}
      popoverStyle={{ backgroundColor: "#313131", borderRadius: 12 }}
      from={
        <TouchableOpacity
          onPress={handleOpen}
          className="flex-row items-center px-3 py-2 rounded-lg border"
          style={{
            backgroundColor: colors.bg,
            borderColor: activeOrderId == order.id || wasRecentlyUpdated ? "#3b82f6" : colors.border,
            borderWidth: activeOrderId == order.id || wasRecentlyUpdated ? 3 : 1,
          }}
        >
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
            {badgeText}
          </Text>
        </TouchableOpacity>
      }
    >
      {/* PERFORMANCE: Lazy render - only render content when popover is visible */}
      {showTooltip ? (
        <PopoverContent
          order={order}
          currentStationId={currentStationId}
          onMarkReady={onMarkReady}
          onViewItems={onViewItems}
          onRetrieve={onRetrieve}
          onClose={handleClose}
        />
      ) : null}
    </Popover>
  );
};

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const OrderBadge = React.memo(OrderBadgeComponent, (prev, next) => {
  // Helper to calculate total refunded for comparison
  const getTotalRefunded = (order: OrderProfile) => 
    (order.payments || []).reduce((sum, p) => sum + (p.refundedAmount ?? 0), 0);
  
  // Return true if props are equal (skip re-render)
  return (
    prev.order.id === next.order.id &&
    prev.order.order_status === next.order.order_status &&
    prev.order.paid_status === next.order.paid_status &&
    prev.order.check_status === next.order.check_status &&
    prev.order.items.length === next.order.items.length &&
    prev.order.amount_due === next.order.amount_due &&
    prev.order.amount_paid === next.order.amount_paid &&
    prev.order.total_amount === next.order.total_amount &&
    prev.order.customer_name === next.order.customer_name &&
    prev.order.payments?.length === next.order.payments?.length &&
    getTotalRefunded(prev.order) === getTotalRefunded(next.order) &&
    // Station-related fields for display
    prev.order.station_id === next.order.station_id &&
    prev.order._sourceStationName === next.order._sourceStationName
  );
});

export default OrderBadge;
