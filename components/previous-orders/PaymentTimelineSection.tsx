import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { Check, CreditCard, DollarSign, X } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface PaymentTimelineSectionProps {
  order: OrderProfile;
}

interface Payment {
  id?: string;
  amount: number;
  method: string;
  cardBrand?: string;
  last4?: string;
  tip_amount?: number;
  timestamp?: string;
  isVoided?: boolean;
  voidReason?: string;
}

const PaymentCard: React.FC<{ payment: Payment; index: number; isLast: boolean }> = React.memo(({
  payment,
  index,
  isLast,
}) => {
  const isVoided = payment.isVoided || false;
  const paymentMethod = payment.method || "Cash";
  const totalAmount = (payment.amount || 0) + (payment.tip_amount || 0);

  // Format timestamp
  const formattedTime = payment.timestamp
    ? new Date(payment.timestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown time";

  return (
    <View className="flex-row">
      {/* Timeline indicator */}
      <View className="items-center mr-4">
        <View
          className={`w-10 h-10 rounded-full items-center justify-center ${
            isVoided ? "bg-red-600/20 border-2 border-red-500" : "bg-green-600/20 border-2 border-green-500"
          }`}
        >
          <Text>
            {isVoided ? (
              <X color={colors.danger} size={20} />
            ) : paymentMethod.toLowerCase().includes("card") ? (
              <CreditCard color={colors.success} size={20} />
            ) : (
              <DollarSign color={colors.success} size={20} />
            )}
          </Text>
        </View>
        {!isLast && <View className="w-0.5 h-full bg-gray-600 mt-2" />}
      </View>

      {/* Payment details */}
      <View className="flex-1 mb-6">
        <View
          className={`bg-panel rounded-lg border p-4 ${
            isVoided ? "border-red-700 opacity-60" : "border-border"
          }`}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Text className={`text-lg font-bold ${isVoided ? "line-through text-gray-500" : "text-white"}`}>
                Payment #{index + 1}
              </Text>
              {isVoided && (
                <View className="bg-red-600/20 border border-red-500 px-2 py-0.5 rounded">
                  <Text className="text-red-400 font-bold text-xs">VOIDED</Text>
                </View>
              )}
            </View>
          </View>

          {/* Payment method and amount */}
          <View className="flex-row items-center justify-between mb-2">
            <View>
              <Text className={`text-sm ${isVoided ? "text-gray-600" : "text-gray-400"}`}>
                {paymentMethod}
                {payment.cardBrand && payment.last4 && ` - ${payment.cardBrand} ****${payment.last4}`}
              </Text>
              <Text className={`text-xs ${isVoided ? "text-gray-700" : "text-gray-500"} mt-1`}>
                {formattedTime}
              </Text>
            </View>
            <View className="items-end">
              <Text className={`text-xl font-bold ${isVoided ? "line-through text-gray-600" : "text-white"}`}>
                ${totalAmount.toFixed(2)}
              </Text>
              {payment.tip_amount && payment.tip_amount > 0 && (
                <Text className={`text-sm ${isVoided ? "text-gray-700" : "text-gray-400"}`}>
                  Tip: ${payment.tip_amount.toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Void reason */}
          {isVoided && payment.voidReason && (
            <View className="mt-2 bg-red-900/20 border border-red-700 rounded p-2">
              <Text className="text-red-400 text-sm">Void Reason: {payment.voidReason}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const PaymentTimelineSection: React.FC<PaymentTimelineSectionProps> = ({ order }) => {
  // Sort payments by timestamp (most recent first)
  const sortedPayments = useMemo(() => {
    const payments = (order.payments || []) as Payment[];
    return [...payments].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [order.payments]);

  if (!order.payments || order.payments.length === 0) {
    return (
      <View className="py-8 items-center justify-center">
        <Text className="text-gray-400 text-center">
          No payment history available for this order
        </Text>
      </View>
    );
  }

  return (
    <View className="py-4">
      <Text className="text-xl font-bold text-white mb-4">Payment History</Text>
      <View className="pl-2">
        {sortedPayments.map((payment, index) => (
          <PaymentCard
            key={payment.id || index}
            payment={payment}
            index={index}
            isLast={index === sortedPayments.length - 1}
          />
        ))}
      </View>
    </View>
  );
};

export default PaymentTimelineSection;
