import { OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { formatOrderStatus } from "@/utils/orderStatusHelpers";
import { ArrowUpRight, Archive, RefreshCcw, Repeat2, CreditCard, Globe } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderCardProps {
  order: OrderProfile;
  onViewItems: () => void;
  onComplete: () => void;
  onRetrieve?: () => void;
  onMarkDone?: () => void;
  onReopenCheck?: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onViewItems,
  onComplete,
  onRetrieve,
  onMarkDone,
  onReopenCheck,
}) => {
  const tablesById = useFloorPlanStore((s) => s.tablesById);

  // Look up table name from service_location_id
  const tableName = useMemo(() => {
    if (!order.service_location_id) return null;
    const table = tablesById[order.service_location_id];
    return table?.name || null;
  }, [order.service_location_id, tablesById]);

  // Derive refund status
  const refundStatus = useMemo(() => {
    const payments = order.payments || [];
    if (payments.length === 0) {
      return { hasRefund: false, isFullyRefunded: false, isPartiallyRefunded: false };
    }
    
    const hasRefund = payments.some(p => (p.refundedAmount ?? 0) > 0);
    const isFullyRefunded = payments.length > 0 && payments.every(
      p => (p.refundedAmount ?? 0) >= (p.amount ?? 0)
    );
    const isPartiallyRefunded = hasRefund && !isFullyRefunded;
    
    return { hasRefund, isFullyRefunded, isPartiallyRefunded };
  }, [order.payments]);

  // Derive closed with balance status
  const isClosedWithBalance = order.check_status === "Closed" && (order.amount_due ?? 0) > 0;

  // Ready + Paid: needs explicit "Done" action from cashier
  const isReadyAndPaid = order.order_status === "ready" && order.paid_status === "Paid";

  // Dot-chip color helpers
  const orderDotColor = useMemo(() => {
    if (refundStatus.isFullyRefunded) return colors.orderCancelled;
    if (refundStatus.isPartiallyRefunded) return colors.paymentPartialRefund;
    switch (order.order_status) {
      case "sent_to_kitchen": return colors.orderSentToKitchen;
      case "preparing": return colors.orderPreparing;
      case "ready": return colors.orderReady;
      case "completed": return colors.orderCompleted;
      case "cancelled": case "void": return colors.orderCancelled;
      default: return colors.orderDefault;
    }
  }, [order.order_status, refundStatus]);

  const paidDotColor = useMemo(() => {
    if (refundStatus.isFullyRefunded) return colors.paymentRefunded;
    if (refundStatus.isPartiallyRefunded) return colors.paymentPartialRefund;
    if (order.paid_status === "Paid") return colors.paymentPaid;
    if (order.paid_status === "Partial") return colors.paymentPartial;
    return colors.paymentUnpaid; // Unpaid/Pending
  }, [order.paid_status, refundStatus]);

  const paidLabel = refundStatus.isFullyRefunded
    ? "REFUNDED"
    : refundStatus.isPartiallyRefunded
    ? "Partial Refund"
    : order.paid_status;

  const currentStationId = useOrderStore((s) => s.currentStationId);

  // Payment calculations (same as OrderBadge popover)
  const { totalAmount, amountDue, cashAmountDue, cashSavings, totalRefunded, validPayments } =
    useMemo(() => {
      const total = order.total_amount ?? 0;
      const due = order.amount_due ?? total;
      const cashDue = order.cash_amount_due ?? due;
      const savings = due > 0 && cashDue < due ? due - cashDue : 0;

      const payments = (order.payments || []).filter((p) => !p.isVoided);
      const refunded = payments.reduce(
        (sum, p) => sum + (p.refundedAmount ?? 0),
        0,
      );

      return {
        totalAmount: total,
        amountDue: due,
        cashAmountDue: cashDue,
        cashSavings: savings,
        totalRefunded: refunded,
        validPayments: payments,
      };
    }, [order.total_amount, order.amount_due, order.cash_amount_due, order.payments]);

  const isOnlineOrder = order.order_source === "online";
  const isUnpaid = order.paid_status !== "Paid";
  return (
    <View
      className="p-3 rounded-2xl border w-72 mr-4"
      style={{
        backgroundColor: colors.card,
        borderColor: isOnlineOrder ? "rgba(59,130,246,0.5)" : colors.border,
      }}
    >
      {/* Status chips */}
      <View className="flex-row items-center gap-2 flex-wrap">
        <View className="flex-row items-center px-2.5 py-1 rounded-full bg-surface">
          <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: orderDotColor }} />
          <Text className="text-sm font-medium text-gray-300">
            {formatOrderStatus(order.order_status)}
          </Text>
        </View>
        <View className="flex-row items-center px-2.5 py-1 rounded-full bg-surface">
          <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: paidDotColor }} />
          <Text className="text-sm font-medium text-gray-300">
            {paidLabel}
          </Text>
        </View>
        {isClosedWithBalance && (
          <View className="flex-row items-center px-2.5 py-1 rounded-full bg-surface">
            <View className="w-2 h-2 rounded-full mr-1.5 bg-gray-500" />
            <Text className="text-sm font-medium text-gray-300">Closed</Text>
          </View>
        )}
        {order.order_source === "online" && (
          <View className="flex-row items-center px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: "rgba(59,130,246,0.4)" }}>
            <Globe color="#60a5fa" size={11} />
            <Text className="text-xs font-semibold ml-1" style={{ color: "#60a5fa" }}>Online</Text>
          </View>
        )}
      </View>

      {/* Customer + order number */}
      <Text className="text-xl font-bold text-white mt-2">
        {order.customer_name || "Walk-In"} {order?.display_number}
      </Text>

      {/* Order type, table, time */}
      <View className="flex-row justify-between mt-1">
        <Text className="text-sm text-gray-400">
          {order.order_type}
          {tableName && <> · Table {tableName}</>}
          {" · "}
          {order.items.length} item{order.items.length !== 1 ? "s" : ""}
        </Text>
        <Text className="text-sm text-gray-400">
          {new Date(order.opened_at!).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      {/* Source station badge */}
      {order._sourceStationName && order.station_id !== currentStationId && (
        <View className="flex-row items-center mt-1">
          <Repeat2 color={colors.info} size={12} />
          <Text className="text-blue-400 text-xs ml-1">
            From {order._sourceStationName}
          </Text>
        </View>
      )}

      {/* ── Pricing + Payments section ── */}
      <View className="mt-3 pt-2 border-t" style={{ borderColor: colors.border }}>
        {/* Total */}
        <Text
          className="text-2xl font-bold text-right"
          style={{ color: colors.heading }}
        >
          ${totalAmount.toFixed(2)}
        </Text>

        {/* Cash savings */}
        {order.paid_status !== "Paid" &&
          !refundStatus.hasRefund &&
          cashSavings > 0.01 && (
            <Text
              className="text-xs text-right mt-0.5"
              style={{ color: colors.success }}
            >
              Cash ${cashAmountDue.toFixed(2)} (save ${cashSavings.toFixed(2)})
            </Text>
          )}

        {/* Refund total */}
        {totalRefunded > 0 && (
          <Text
            className="text-xs text-right mt-0.5"
            style={{ color: colors.danger }}
          >
            Refunded: ${totalRefunded.toFixed(2)}
          </Text>
        )}

        {/* Payment method lines */}
        {validPayments.length > 0 && (
          <View className="mt-1.5">
            {validPayments.map((payment, idx) => (
              <Text
                key={payment.id || idx}
                className="text-xs text-right"
                style={{ color: colors.label }}
              >
                {payment.method === "Cash"
                  ? `Cash  $${(payment.amount ?? 0).toFixed(2)}`
                  : payment.cardBrand || payment.last4
                    ? `${payment.cardBrand || "Card"}${payment.last4 ? ` ····${payment.last4}` : ""}  $${(payment.amount ?? 0).toFixed(2)}`
                    : `Card  $${(payment.amount ?? 0).toFixed(2)}`}
              </Text>
            ))}
          </View>
        )}

        {/* Amount due (partial payment) */}
        {isUnpaid && amountDue > 0.01 && order.amount_paid != null && order.amount_paid > 0 && (
          <Text
            className="text-xs text-right font-semibold mt-1"
            style={{ color: colors.warning }}
          >
            ${amountDue.toFixed(2)} due
          </Text>
        )}
      </View>

      {/* ── Action buttons ── */}
      <View className="flex-row justify-between items-center mt-3">
        <TouchableOpacity
          onPress={onViewItems}
          className="flex-row items-center justify-center py-2 px-3 rounded-xl border"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <Text className="font-semibold text-white text-base mr-1">
            View Items
          </Text>
          <ArrowUpRight color={colors.heading} size={18} />
        </TouchableOpacity>

        {(isClosedWithBalance || refundStatus.isFullyRefunded || isReadyAndPaid) ? (
          <View className="flex-row flex-1 ml-2 gap-2">
            {onMarkDone && (
              <TouchableOpacity
                onPress={onMarkDone}
                className="px-3 py-2 bg-gray-600 rounded-xl flex-1 flex-row items-center justify-center"
              >
                <Archive color={colors.heading} size={16} />
                <Text className="text-white font-bold text-center text-sm ml-1">
                  Done
                </Text>
              </TouchableOpacity>
            )}
            {onReopenCheck && !refundStatus.isFullyRefunded && !isReadyAndPaid && (
              <TouchableOpacity
                onPress={onReopenCheck}
                className="px-3 py-2 bg-blue-600 rounded-xl flex-1 flex-row items-center justify-center"
              >
                <RefreshCcw color={colors.heading} size={16} />
                <Text className="text-white font-bold text-center text-sm ml-1">
                  Reopen
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={onComplete}
            className="px-4 py-2 bg-blue-600 rounded-xl flex-1 ml-2"
          >
            <Text className="text-white font-bold text-center text-base">
              Complete
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {isUnpaid && onRetrieve && !isClosedWithBalance && !refundStatus.isFullyRefunded && (
        <View className="mt-2">
          <TouchableOpacity
            onPress={onRetrieve}
            className="flex-row items-center justify-center px-4 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(96,165,250,0.12)" }}
          >
            <CreditCard color={colors.info} size={16} />
            <Text className="font-bold text-base ml-2" style={{ color: colors.info }}>
              Retrieve to Pay · ${amountDue.toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default React.memo(OrderCard);
