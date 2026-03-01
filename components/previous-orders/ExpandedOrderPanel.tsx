import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import {
  Clock,
  CreditCard,
  DollarSign,
  Printer,
  RotateCcw,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ExpandedOrderPanelProps {
  order: OrderProfile;
  onPrint: (order: OrderProfile) => void;
  onViewTimeline: (order: OrderProfile) => void;
  onTipAdjust: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
}

const ExpandedOrderPanel: React.FC<ExpandedOrderPanelProps> = ({
  order,
  onPrint,
  onViewTimeline,
  onTipAdjust,
  onRefund,
}) => {
  const paymentSummary = useMemo(() => {
    const subtotal = order.items.reduce((sum, item) => {
      return sum + (item.subtotal ?? item.price * item.quantity);
    }, 0);
    const tax = order.total_tax ?? 0;
    const tip = (order.payments || [])
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0);
    const refund = (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
    const total = order.total_amount ?? 0;
    const net = total - refund;

    // Payment method info
    const activePayments = (order.payments || []).filter((p) => !p.isVoided);
    let paymentMethodLabel = "";
    let isCashPayment = false;
    if (activePayments.length > 0) {
      const p = activePayments[0];
      if (p.method === "Cash") {
        paymentMethodLabel = "Cash";
        isCashPayment = true;
      } else {
        const brand = p.cardBrand || "Card";
        paymentMethodLabel = p.last4
          ? `${brand} ending in ${p.last4}`
          : brand;
      }
      if (activePayments.length > 1) {
        paymentMethodLabel += ` +${activePayments.length - 1} more`;
      }
    }

    return { subtotal, tax, tip, refund, net, paymentMethodLabel, isCashPayment };
  }, [order]);

  const hasCardPayments = useMemo(() => {
    return (order.payments || []).some(
      (p) => p.method !== "Cash" && !p.isVoided,
    );
  }, [order.payments]);

  return (
    <View
      className="bg-screen border-t border-border px-4 py-3"
      style={{ borderLeftWidth: 3, borderLeftColor: colors.teal }}
    >
      <View className="flex-row gap-6">
        {/* Column 1: Items (~50%) */}
        <View style={{ flex: 5 }}>
          <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            Items
          </Text>
          {order.items.slice(0, 3).map((item, idx) => (
            <View
              key={item.id || idx}
              className="flex-row justify-between mb-0.5"
            >
              <Text
                className="text-sm text-gray-300 flex-1 mr-2"
                numberOfLines={1}
              >
                {item.quantity > 1 ? `${item.quantity}x ` : "1x "}
                {item.name}
              </Text>
              <Text className="text-sm text-gray-400">
                ${(item.subtotal ?? item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
          {order.items.length > 3 && (
            <Text className="text-xs text-gray-500 mt-1">
              ...and {order.items.length - 3} more items
            </Text>
          )}
        </View>

        {/* Vertical divider */}
        <View className="border-r border-border" />

        {/* Column 2: Payment (~28%) */}
        <View style={{ flex: 2.8 }}>
          <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            Payment
          </Text>
          <PaymentLine label="Subtotal" amount={paymentSummary.subtotal} />
          <PaymentLine label="Tax" amount={paymentSummary.tax} />
          {paymentSummary.tip > 0 && (
            <PaymentLine
              label="Tip"
              amount={paymentSummary.tip}
              color="text-green-400"
            />
          )}
          {paymentSummary.refund > 0 && (
            <PaymentLine
              label="Refund"
              amount={-paymentSummary.refund}
              color="text-red-400"
            />
          )}
          <View className="border-t border-border my-1.5" />
          <View className="flex-row justify-between mb-0.5">
            <Text className="text-sm font-bold text-white">Net Total</Text>
            <Text className="text-sm font-bold text-white">
              ${paymentSummary.net.toFixed(2)}
            </Text>
          </View>
          {paymentSummary.paymentMethodLabel ? (
            <View className="flex-row items-center gap-1.5 mt-2">
              {!paymentSummary.isCashPayment && (
                <CreditCard color="#6B7280" size={13} />
              )}
              <Text className="text-xs text-gray-500">
                {paymentSummary.paymentMethodLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Vertical divider */}
        <View className="border-r border-border" />

        {/* Column 3: Actions (~22%) */}
        <View style={{ flex: 2.2 }}>
          <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            Actions
          </Text>
          <View className="gap-2">
            <QuickActionButton
              icon={<Printer color="#A5B4FC" size={14} />}
              label="Print Receipt"
              onPress={() => onPrint(order)}
            />
            <QuickActionButton
              icon={<Clock color="#A5B4FC" size={14} />}
              label="View Timeline"
              onPress={() => onViewTimeline(order)}
            />
            {hasCardPayments && (
              <QuickActionButton
                icon={<DollarSign color="#A5B4FC" size={14} />}
                label="Adjust Tip"
                onPress={() => onTipAdjust(order)}
              />
            )}
            {onRefund && (
              <QuickActionButton
                icon={<RotateCcw color="#A5B4FC" size={14} />}
                label="Process Refund"
                onPress={() => onRefund(order)}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const PaymentLine = ({
  label,
  amount,
  color,
  bold,
}: {
  label: string;
  amount: number;
  color?: string;
  bold?: boolean;
}) => (
  <View className="flex-row justify-between mb-0.5">
    <Text
      className={`text-xs ${bold ? "font-bold text-white" : "text-gray-400"}`}
    >
      {label}
    </Text>
    <Text
      className={`text-xs ${bold ? "font-bold text-white" : color || "text-gray-300"}`}
    >
      {amount < 0 ? "-" : ""}${Math.abs(amount).toFixed(2)}
    </Text>
  </View>
);

const QuickActionButton = ({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className="flex-row items-center justify-center gap-2 rounded-lg px-3 py-2"
    style={{
      backgroundColor: "rgba(49, 46, 129, 0.4)",
      borderWidth: 1,
      borderColor: "rgba(67, 56, 202, 0.5)",
    }}
  >
    {icon}
    <Text className="text-xs font-medium text-gray-200">{label}</Text>
  </TouchableOpacity>
);

export default React.memo(ExpandedOrderPanel);
