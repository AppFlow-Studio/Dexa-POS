import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface TotalsProps {
  cart: CartItem[];
}

const Totals: React.FC<TotalsProps> = ({ cart }) => {
  const {
    activeOrderId,
    ordersById,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
    activeOrderOutstandingTotal,
    activeOrderOutstandingCash,
  } = useOrderStore();

  const voucher = 0.0;

  // Get the active order to check for partial payments
  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

  // Calculate amount paid and balance due
  const paymentInfo = useMemo(() => {
    const hasPayments = (activeOrder?.payments?.length ?? 0) > 0;
    const isPaid = activeOrder?.paid_status === "Paid";

    // Use backend's authoritative amount_due if available (always CARD price)
    const balanceDue = activeOrder?.amount_due !== undefined
      ? activeOrder.amount_due
      : activeOrderOutstandingTotal;

    // Use backend's cash_amount_due if available, otherwise use local calculation
    const cashBalanceDue = activeOrder?.cash_amount_due !== undefined
      ? activeOrder.cash_amount_due
      : activeOrderOutstandingCash;

    const amountPaid = activeOrder?.amount_paid !== undefined
      ? activeOrder.amount_paid
      : (activeOrderTotal - activeOrderOutstandingTotal);

    // Calculate savings if paying cash
    const cashSavings = balanceDue - cashBalanceDue;

    return {
      hasPayments,
      isPaid,
      balanceDue,
      cashBalanceDue,
      cashSavings: cashSavings > 0.01 ? cashSavings : 0,
      amountPaid: Math.max(0, amountPaid),
    };
  }, [activeOrder, activeOrderTotal, activeOrderOutstandingTotal, activeOrderOutstandingCash]);

  return (
    <View className="px-6 py-1 bg-[#212121]">
      <View className="gap-y-1">
        <View className="flex-row justify-between items-center">
          <Text className="text-lg text-gray-300">Subtotal</Text>
          <Text className="text-lg font-medium text-white">
            ${activeOrderSubtotal.toFixed(2)}
          </Text>
        </View>

        {activeOrderDiscount > 0 && (
          <View className="flex-row justify-between items-center">
            <Text className="text-lg text-green-400">Discount</Text>
            <Text className="text-lg font-medium text-green-400">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
        )}

        <View className="flex-row justify-between items-center">
          <Text className="text-lg text-gray-300">Tax</Text>
          <Text className="text-lg font-medium text-white">
            ${activeOrderTax.toFixed(2)}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-lg text-gray-300">Voucher</Text>
          <Text className="text-lg font-medium text-white">
            ${voucher.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Total Line */}
      <View className="border-t border-dashed border-gray-600 mt-2 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-white">Total</Text>
        <Text className="text-lg font-bold text-white">
          ${activeOrderTotal.toFixed(2)}
        </Text>
      </View>

      {/* Amount Paid (only show if partial payment made) */}
      {paymentInfo.hasPayments && paymentInfo.amountPaid > 0 && (
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-lg text-green-400">Paid</Text>
          <Text className="text-lg font-medium text-green-400">
            -${paymentInfo.amountPaid.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Balance Due (only show if there's a remaining balance after payment) */}
      {paymentInfo.hasPayments && !paymentInfo.isPaid && paymentInfo.balanceDue > 0.01 && (
        <View className="flex-row justify-between items-center mt-1 pt-1 border-t border-yellow-600/50">
          <Text className="text-lg font-bold text-yellow-400">Balance Due</Text>
          <Text className="text-lg font-bold text-yellow-400">
            ${paymentInfo.balanceDue.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Cash Discount Option (show when not fully paid and cash price is lower) */}
      {!paymentInfo.isPaid && paymentInfo.cashSavings > 0 && paymentInfo.balanceDue > 0.01 && (
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-sm text-green-400">Cash Price</Text>
          <Text className="text-sm font-medium text-green-400">
            ${paymentInfo.cashBalanceDue.toFixed(2)} (save ${paymentInfo.cashSavings.toFixed(2)})
          </Text>
        </View>
      )}

      {/* Fully Paid indicator */}
      {paymentInfo.isPaid && (
        <View className="flex-row justify-between items-center mt-1 pt-1 border-t border-green-600/50">
          <Text className="text-lg font-bold text-green-400">Fully Paid</Text>
          <Text className="text-lg font-bold text-green-400">✓</Text>
        </View>
      )}
    </View>
  );
};

export default Totals;
