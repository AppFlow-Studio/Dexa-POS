import { OrderProfile } from "@/lib/types";
import {
  Clock,
  DollarSign,
  Printer,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ExpandedOrderPanelProps {
  order: OrderProfile;
  onPrint: (order: OrderProfile) => void;
  onViewTimeline: (order: OrderProfile) => void;
  onTipAdjust: (order: OrderProfile) => void;
}

const ExpandedOrderPanel: React.FC<ExpandedOrderPanelProps> = ({
  order,
  onPrint,
  onViewTimeline,
  onTipAdjust,
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
    if (activePayments.length > 0) {
      const p = activePayments[0];
      if (p.method === "Cash") {
        paymentMethodLabel = "Cash";
      } else {
        paymentMethodLabel = `${p.cardBrand || "Card"} ${p.last4 ? `••••${p.last4}` : ""}`.trim();
      }
      if (activePayments.length > 1) {
        paymentMethodLabel += ` +${activePayments.length - 1} more`;
      }
    }

    return { subtotal, tax, tip, refund, net, paymentMethodLabel };
  }, [order]);

  const hasCardPayments = useMemo(() => {
    return (order.payments || []).some(
      (p) => p.method !== "Cash" && !p.isVoided,
    );
  }, [order.payments]);

  return (
    <View className="bg-[#252525] border-t border-gray-700 px-4 py-3">
      <View className="flex-row gap-4">
        {/* Column 1: Items */}
        <View className="flex-1">
          <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            Items
          </Text>
          {order.items.slice(0, 8).map((item, idx) => (
            <Text
              key={item.id || idx}
              className="text-sm text-gray-300 mb-0.5"
              numberOfLines={1}
            >
              {item.quantity > 1 ? `${item.quantity}x ` : ""}
              {item.name}
            </Text>
          ))}
          {order.items.length > 8 && (
            <Text className="text-xs text-gray-500 mt-1">
              +{order.items.length - 8} more items
            </Text>
          )}
        </View>

        {/* Column 2: Payment */}
        <View className="flex-1">
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
          <View className="border-t border-gray-600 my-1" />
          <PaymentLine
            label="Net"
            amount={paymentSummary.net}
            bold
          />
          {paymentSummary.paymentMethodLabel ? (
            <Text className="text-xs text-gray-500 mt-1.5">
              {paymentSummary.paymentMethodLabel}
            </Text>
          ) : null}
        </View>

        {/* Column 3: Notes & Actions */}
        <View className="flex-1">
          <Text className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            Notes & Actions
          </Text>
          {order.notes ? (
            <View className="border border-gray-600 rounded-lg p-2 mb-2">
              <Text
                className="text-xs text-gray-300"
                numberOfLines={3}
              >
                {order.notes}
              </Text>
            </View>
          ) : null}
          <View className="gap-1.5">
            <QuickActionButton
              icon={<Printer color="#9CA3AF" size={14} />}
              label="Print Receipt"
              onPress={() => onPrint(order)}
            />
            <QuickActionButton
              icon={<Clock color="#9CA3AF" size={14} />}
              label="View Timeline"
              onPress={() => onViewTimeline(order)}
            />
            {hasCardPayments && (
              <QuickActionButton
                icon={<DollarSign color="#9CA3AF" size={14} />}
                label="Adjust Tip"
                onPress={() => onTipAdjust(order)}
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
    className="flex-row items-center gap-1.5 border border-gray-600 rounded-lg px-2 py-1.5"
  >
    {icon}
    <Text className="text-xs text-gray-300">{label}</Text>
  </TouchableOpacity>
);

export default React.memo(ExpandedOrderPanel);
