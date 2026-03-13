import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useWasOrderRecentlyUpdated } from "@/stores/useConflictStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { formatOrderStatus } from "@/utils/orderStatusHelpers";
import {
  CheckCircle,
  CreditCard,
  Eye,
  Printer,
  RefreshCw,
  Repeat2,
  RotateCcw,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";

interface OrderBadgeProps {
  order: OrderProfile;
  onMarkReady: () => void;
  onMarkDone?: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
  onReopenCheck?: () => void;
  onPrintReceipt?: () => void;
}

// ============================================================================
// DOT-CHIP COLOR HELPERS
// ============================================================================
const getOrderDotColor = (
  status: string,
  refundState?: { isFullyRefunded: boolean; isPartiallyRefunded: boolean },
): string => {
  if (refundState?.isFullyRefunded) return colors.orderCancelled;
  if (refundState?.isPartiallyRefunded) return colors.paymentPartialRefund;
  switch (status) {
    case "sent_to_kitchen":
      return colors.orderSentToKitchen;
    case "preparing":
      return colors.orderPreparing;
    case "ready":
      return colors.orderReady;
    case "completed":
      return colors.orderCompleted;
    case "cancelled":
    case "void":
      return colors.orderCancelled;
    default:
      return colors.orderDefault;
  }
};

// ============================================================================
// STATUS PILL HELPER — returns style for the popover header status pill
// ============================================================================
const getStatusPillStyle = (
  paidStatus: string,
  orderStatus: string,
  refundState: { isFullyRefunded: boolean; isPartiallyRefunded: boolean },
): { bg: string; textColor: string; label: string } => {
  if (refundState.isFullyRefunded)
    return { bg: "rgba(239,68,71,0.2)", textColor: colors.danger, label: "Refunded" };
  if (refundState.isPartiallyRefunded)
    return { bg: "rgba(249,115,22,0.2)", textColor: colors.paymentPartialRefund, label: "Partial Refund" };
  if (paidStatus === "Paid")
    return { bg: "rgba(34,197,94,0.15)", textColor: colors.paymentPaid, label: "Paid" };
  if (paidStatus === "Partial")
    return { bg: "rgba(249,115,22,0.15)", textColor: colors.paymentPartial, label: "Partial" };
  if (orderStatus === "preparing" || orderStatus === "sent_to_kitchen")
    return { bg: "rgba(251,191,36,0.15)", textColor: colors.warning, label: formatOrderStatus(orderStatus) };
  if (orderStatus === "ready")
    return { bg: "rgba(34,197,94,0.15)", textColor: colors.success, label: "Ready" };
  return { bg: "rgba(156,163,175,0.15)", textColor: colors.muted, label: "Pending" };
};

// ============================================================================
// LAZY POPOVER CONTENT - Only renders when popover is visible
// ============================================================================
interface PopoverContentProps {
  order: OrderProfile;
  currentStationId: string | null;
  onMarkReady: () => void;
  onMarkDone?: () => void;
  onViewItems: () => void;
  onRetrieve: () => void;
  onReopenCheck?: () => void;
  onPrintReceipt?: () => void;
  onClose: () => void;
}

const PopoverContent = React.memo<PopoverContentProps>(
  ({
    order,
    currentStationId,
    onMarkReady,
    onMarkDone,
    onViewItems,
    onRetrieve,
    onReopenCheck,
    onPrintReceipt,
    onClose,
  }) => {
    // Memoize refund status
    const refundStatus = useMemo(() => {
      const payments = order.payments || [];
      if (payments.length === 0) {
        return {
          hasRefund: false,
          isFullyRefunded: false,
          isPartiallyRefunded: false,
          totalRefunded: 0,
        };
      }

      const totalRefunded = payments.reduce(
        (sum, p) => sum + (p.refundedAmount ?? 0),
        0,
      );
      const hasRefund = totalRefunded > 0;
      const isFullyRefunded =
        payments.length > 0 &&
        payments.every((p) => (p.refundedAmount ?? 0) >= (p.amount ?? 0));
      const isPartiallyRefunded = hasRefund && !isFullyRefunded;

      return { hasRefund, isFullyRefunded, isPartiallyRefunded, totalRefunded };
    }, [order.payments]);

    // Memoize payment calculations
    const {
      amountDue,
      isPartiallyPaid,
      cashAmountDue,
      cashSavings,
    } = useMemo(() => {
      const due = order.amount_due ?? order.total_amount ?? 0;
      const paid = order.amount_paid ?? 0;
      const partial = paid > 0 && order.paid_status !== "Paid";
      const cashDue = order.cash_amount_due ?? due;
      const savings = due - cashDue;
      return {
        amountDue: due,
        isPartiallyPaid: partial,
        cashAmountDue: cashDue,
        cashSavings: savings,
      };
    }, [
      order.amount_due,
      order.total_amount,
      order.amount_paid,
      order.paid_status,
      order.cash_amount_due,
    ]);

    // Memoize formatted time
    const formattedTime = useMemo(() => {
      if (!order.opened_at) return "";
      return new Date(order.opened_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }, [order.opened_at]);

    // Memoize display ID
    const displayId = useMemo(() => {
      return (
        order.display_number || order.order_number || `#${order.id.slice(-4)}`
      );
    }, [order.display_number, order.order_number, order.id]);

    // Status pill
    const statusPill = useMemo(
      () =>
        getStatusPillStyle(order.paid_status, order.order_status, {
          isFullyRefunded: refundStatus.isFullyRefunded,
          isPartiallyRefunded: refundStatus.isPartiallyRefunded,
        }),
      [order.paid_status, order.order_status, refundStatus.isFullyRefunded, refundStatus.isPartiallyRefunded],
    );

    // Check if from another station
    const isFromOtherStation =
      order._sourceStationName && order.station_id !== currentStationId;

    const totalAmount = order.total_amount ?? 0;

    return (
      <View
        className="rounded-xl shadow-lg border w-[340px]"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        {/* ── Row 1: Order ID · Type · Status pill ── */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1 mr-2">
              <Text className="text-lg font-bold" style={{ color: colors.heading }}>
                {displayId}
              </Text>
              <Text style={{ color: colors.muted }}>·</Text>
              <Text className="text-sm" style={{ color: colors.muted }}>
                {order.order_type}
              </Text>
            </View>
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: statusPill.bg }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: statusPill.textColor }}
              >
                {statusPill.label}
              </Text>
            </View>
          </View>

          {/* ── Row 2: Customer · Items · Time ── */}
          <View className="flex-row items-center justify-between mt-1.5">
            <View className="flex-row items-center gap-1.5 flex-1">
              <Text className="text-sm" style={{ color: colors.label }}>
                {order.customer_name || "Walk-In"}
              </Text>
              <Text style={{ color: colors.muted }}>·</Text>
              <Text className="text-sm" style={{ color: colors.muted }}>
                {order.items.length} item{order.items.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <Text className="text-sm" style={{ color: colors.muted }}>
              {formattedTime}
            </Text>
          </View>

          {/* ── Row 3: Status chips ── */}
          <View className="flex-row flex-wrap gap-1.5 mt-2">
            {/* Order Type chip */}
            {order.order_type ? (
              <View
                className="px-2 py-0.5 rounded-md"
                style={{ backgroundColor: "rgba(96,165,250,0.15)" }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: colors.info }}
                >
                  {order.order_type}
                </Text>
              </View>
            ) : null}
            {/* Order Status chip */}
            {order.order_status ? (
              <View
                className="px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor:
                    getOrderDotColor(order.order_status, refundStatus) + "26",
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{
                    color: getOrderDotColor(order.order_status, refundStatus),
                  }}
                >
                  {formatOrderStatus(order.order_status)}
                </Text>
              </View>
            ) : null}
            {/* Check Status chip */}
            {order.check_status ? (
              <View
                className="px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor:
                    order.check_status === "Opened"
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(156,163,175,0.15)",
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{
                    color:
                      order.check_status === "Opened"
                        ? colors.success
                        : colors.muted,
                  }}
                >
                  {order.check_status}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Source station badge */}
          {isFromOtherStation && (
            <View className="flex-row items-center mt-2">
              <Repeat2 color={colors.info} size={13} />
              <Text className="text-xs ml-1" style={{ color: colors.info }}>
                From: {order._sourceStationName}
              </Text>
            </View>
          )}
        </View>

        {/* ── Price section ── */}
        <View
          className="px-4 py-3 border-t"
          style={{ borderColor: colors.border }}
        >
          <Text
            className="text-2xl font-bold text-right"
            style={{ color: colors.heading }}
          >
            ${totalAmount.toFixed(2)}
          </Text>
          {order.paid_status !== "Paid" &&
            !refundStatus.hasRefund &&
            cashSavings > 0.01 && (
              <Text
                className="text-sm text-right mt-0.5"
                style={{ color: colors.success }}
              >
                Cash ${cashAmountDue.toFixed(2)} (save ${cashSavings.toFixed(2)})
              </Text>
            )}
          {refundStatus.totalRefunded > 0 && (
            <Text
              className="text-sm text-right mt-0.5"
              style={{ color: colors.danger }}
            >
              Refunded: ${refundStatus.totalRefunded.toFixed(2)}
            </Text>
          )}

          {/* ── Payment method lines ── */}
          {(order.payments || []).filter((p) => !p.isVoided).length > 0 && (
            <View className="mt-1.5">
              {(order.payments || [])
                .filter((p) => !p.isVoided)
                .map((payment, idx) => (
                  <Text
                    key={idx}
                    className="text-sm text-right"
                    style={{ color: colors.label }}
                  >
                    {payment.method === "Cash"
                      ? `💵 Cash  $${(payment.amount ?? 0).toFixed(2)}`
                      : payment.cardBrand || payment.last4
                        ? `💳 ${payment.cardBrand || "Card"}${payment.last4 ? ` ••••${payment.last4}` : ""}  $${(payment.amount ?? 0).toFixed(2)}`
                        : `💳 Card  $${(payment.amount ?? 0).toFixed(2)}`}
                  </Text>
                ))}
            </View>
          )}
        </View>

        {/* ── Action buttons ── */}
        <View
          className="px-2 pt-1 pb-2 border-t"
          style={{ borderColor: colors.border }}
        >
          {/* Mark as Done */}
          {(order.order_status === "preparing" ||
            order.order_status === "sent_to_kitchen") && (
            <TouchableOpacity
              onPress={() => {
                onMarkReady();
                onClose();
              }}
              className="flex-row items-center px-3 py-2.5 rounded-lg"
            >
              <CheckCircle color={colors.orderReady} size={18} />
              <Text
                className="ml-3 font-semibold text-base"
                style={{ color: colors.success }}
              >
                Mark as Done
              </Text>
            </TouchableOpacity>
          )}

          {/* Mark as Done — for ready+paid orders */}
          {order.order_status === "ready" && order.paid_status === "Paid" && onMarkDone && (
            <TouchableOpacity
              onPress={() => {
                onMarkDone();
                onClose();
              }}
              className="flex-row items-center px-3 py-2.5 rounded-lg"
            >
              <CheckCircle color={colors.orderReady} size={18} />
              <Text
                className="ml-3 font-semibold text-base"
                style={{ color: colors.success }}
              >
                Mark as Done
              </Text>
            </TouchableOpacity>
          )}

          {/* Print Receipt */}
          {onPrintReceipt && order.paid_status === "Paid" && (
            <TouchableOpacity
              onPress={() => {
                onPrintReceipt();
                onClose();
              }}
              className="flex-row items-center px-3 py-2.5 rounded-lg"
            >
              <Printer color={colors.label} size={18} />
              <Text
                className="ml-3 font-semibold text-base"
                style={{ color: colors.label }}
              >
                Print Receipt
              </Text>
            </TouchableOpacity>
          )}

          {/* View Items */}
          <TouchableOpacity
            onPress={() => {
              onViewItems();
              onClose();
            }}
            className="flex-row items-center px-3 py-2.5 rounded-lg"
          >
            <Eye color={colors.label} size={18} />
            <Text
              className="ml-3 font-semibold text-base"
              style={{ color: colors.label }}
            >
              View Items
            </Text>
          </TouchableOpacity>

          {/* ── Bottom action: Retrieve / Reopen ── */}
          {order.paid_status !== "Paid" &&
          amountDue > 0.01 &&
          order.check_status !== "Closed" ? (
            <TouchableOpacity
              onPress={() => {
                onRetrieve();
                onClose();
              }}
              className="flex-row items-center justify-between px-3 py-2.5 rounded-lg mt-1"
              style={{ backgroundColor: "rgba(96,165,250,0.12)" }}
            >
              <View className="flex-row items-center">
                <CreditCard color={colors.info} size={18} />
                <Text
                  className="ml-3 font-semibold text-base"
                  style={{ color: colors.info }}
                >
                  {isPartiallyPaid ? "Pay Remaining" : "Retrieve to Pay"}
                </Text>
              </View>
              <Text
                className="font-bold text-base"
                style={{ color: colors.info }}
              >
                ${amountDue.toFixed(2)}
              </Text>
            </TouchableOpacity>
          ) : order.paid_status !== "Paid" &&
            amountDue >= 0.01 &&
            order.check_status === "Closed" ? (
            <TouchableOpacity
              onPress={() => {
                onReopenCheck?.();
                onClose();
              }}
              className="flex-row items-center justify-between px-3 py-2.5 rounded-lg mt-1"
              style={{ backgroundColor: "rgba(251,191,36,0.12)" }}
            >
              <View className="flex-row items-center">
                <RotateCcw color={colors.warning} size={18} />
                <Text
                  className="ml-3 font-semibold text-base"
                  style={{ color: colors.warning }}
                >
                  Reopen Check
                </Text>
              </View>
              <Text
                className="font-bold text-base"
                style={{ color: colors.warning }}
              >
                ${amountDue.toFixed(2)}
              </Text>
            </TouchableOpacity>
          ) : null}
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
  onMarkDone,
  onViewItems,
  onRetrieve,
  onReopenCheck,
  onPrintReceipt,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // PERFORMANCE: Get currentStationId via selector (not getState() during render)
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);

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

    const hasRefund = payments.some((p) => (p.refundedAmount ?? 0) > 0);
    const isFullyRefunded =
      payments.length > 0 &&
      payments.every((p) => (p.refundedAmount ?? 0) >= (p.amount ?? 0));
    const isPartiallyRefunded = hasRefund && !isFullyRefunded;

    return { isFullyRefunded, isPartiallyRefunded };
  }, [order.payments]);

  // PERFORMANCE: Memoize dot color and paid suffix
  const dotColor = useMemo(
    () => getOrderDotColor(order.order_status, refundState),
    [order.order_status, refundState],
  );

  const displayId = useMemo(() => {
    return order.display_number || order.order_number || `#${order.id.slice(-4)}`;
  }, [order.display_number, order.order_number, order.id]);

  const statusLabel = useMemo(() => {
    if (refundState.isFullyRefunded) return "refunded";
    if (refundState.isPartiallyRefunded) return "partial refund";
    const status = order.order_status;
    if (status === "sent_to_kitchen") return "sent to kitchen";
    return status || "pending";
  }, [order.order_status, refundState.isFullyRefunded, refundState.isPartiallyRefunded]);

  // PERFORMANCE: Memoize callbacks to prevent recreation
  const handleClose = useCallback(() => setShowTooltip(false), []);
  const handleOpen = useCallback(() => setShowTooltip(true), []);

  // Badge elevation: active, recently updated, or popover open
  const isActive = activeOrderId === order.id || wasRecentlyUpdated;
  const isElevated = showTooltip || isActive;

  return (
    <Popover
      isVisible={showTooltip}
      onRequestClose={handleClose}
      // PERFORMANCE: Disable animation for instant appearance
      animationConfig={{ duration: 0 }}
      popoverStyle={{ backgroundColor: colors.card, borderRadius: 12 }}
      from={
        <TouchableOpacity
          onPress={handleOpen}
          className="flex-row items-center px-3 py-1.5 rounded-full border"
          style={{
            backgroundColor: isElevated ? colors.card : colors.panel,
            borderColor: showTooltip
              ? colors.teal
              : isActive
                ? colors.info
                : colors.border,
            borderWidth: isElevated ? 2 : 1,
            ...(showTooltip
              ? {
                  shadowColor: colors.teal,
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 8,
                }
              : {}),
          }}
        >
          {wasRecentlyUpdated && (
            <View className="mr-1.5">
              <RefreshCw color={colors.info} size={12} />
            </View>
          )}
          <View
            className="w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: dotColor }}
          />
          <Text className="font-semibold text-sm text-gray-200" numberOfLines={1}>
            {displayId}
          </Text>
          <Text className="text-sm text-gray-500 mx-1">·</Text>
          <Text
            className="text-sm text-gray-400"
            numberOfLines={1}
          >
            {statusLabel}
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
          onMarkDone={onMarkDone}
          onViewItems={onViewItems}
          onRetrieve={onRetrieve}
          onReopenCheck={onReopenCheck}
          onPrintReceipt={onPrintReceipt}
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
