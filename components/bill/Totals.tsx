import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface TotalsProps {
  cart: CartItem[];
}

const TotalsComponent: React.FC<TotalsProps> = ({ cart }) => {
  // Phase 7: Use derived selector instead of 6 individual store selectors
  const totals = useActiveOrderTotals();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const ordersById = useOrderStore((s) => s.ordersById);

  // Get the active order to check for partial payments
  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

  // Calculate amount paid and balance due
  const paymentInfo = useMemo(() => {
    if (!totals) {
      return {
        hasPayments: false,
        isPaid: false,
        balanceDue: 0,
        cashBalanceDue: 0,
        cashSavings: 0,
        amountPaid: 0,
      };
    }

    const hasPayments = (activeOrder?.payments?.length ?? 0) > 0;
    const isPaid = activeOrder?.paid_status === "Paid" && totals.amountDue <= 0.01;

    const totalRefunded = (activeOrder?.payments ?? [])
      .filter((p: any) => !p.isVoided)
      .reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0);

    // Derived selector already prioritizes backend values for amountDue
    const balanceDue = totals.amountDue;
    const cashBalanceDue = totals.cashAmountDue;

    const amountPaid =
      activeOrder?.amount_paid !== undefined
        ? activeOrder.amount_paid
        : totals.total - totals.amountDue;

    // Calculate savings if paying cash
    const cashSavings = balanceDue - cashBalanceDue;

    return {
      hasPayments,
      isPaid,
      balanceDue,
      cashBalanceDue,
      cashSavings: cashSavings > 0.01 ? cashSavings : 0,
      amountPaid: Math.max(0, amountPaid),
      totalRefunded,
    };
  }, [totals, activeOrder]);

  if (!totals) {
    return null;
  }

  return (
    <View className="px-6 py-0.5 bg-[#212121]">
      <View className="gap-y-0.5">
        {/* <View className="flex-row justify-between items-center">
          <Text className="text-lg text-gray-300">Subtotal</Text>
          <Text className="text-lg font-medium text-white">
            ${totals.subtotal.toFixed(2)}
          </Text>
        </View> */}

        {totals.discount > 0 && (
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-green-400">Discount</Text>
            <Text className="text-base font-medium text-green-400">
              -${totals.discount.toFixed(2)}
            </Text>
          </View>
        )}

        <View className="flex-row justify-between items-center">
          <Text className="text-base text-gray-300">Tax</Text>
          <Text className="text-base font-medium text-white">
            ${totals.tax.toFixed(2)}
          </Text>
        </View>

        {/* <View className="flex-row justify-between items-center">
          <Text className="text-lg text-gray-300">Voucher</Text>
          <Text className="text-lg font-medium text-white">
            ${voucher.toFixed(2)}
          </Text>
        </View> */}
      </View>

      {/* Total Line */}
      {/* <View className="border-t border-dashed border-gray-600 mt-2 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-white">Total</Text>
        <Text className="text-lg font-bold text-white">
          ${totals.total.toFixed(2)}
        </Text>
      </View> */}

      {/* Amount Paid (only show if partial payment made) */}
      {paymentInfo.hasPayments && paymentInfo.amountPaid > 0 && (
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-lg text-green-400">Paid</Text>
          <Text className="text-lg font-medium text-green-400">
            -${paymentInfo.amountPaid.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Refunded amount */}
      {paymentInfo.totalRefunded > 0 && (
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-lg text-red-400">Refunded</Text>
          <Text className="text-lg font-medium text-red-400">
            +${paymentInfo.totalRefunded.toFixed(2)}
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
      {/* {!paymentInfo.isPaid && paymentInfo.cashSavings > 0 && paymentInfo.balanceDue > 0.01 && (
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-sm text-green-400">Cash Price</Text>
          <Text className="text-sm font-medium text-green-400">
            ${paymentInfo.cashBalanceDue.toFixed(2)} (save ${paymentInfo.cashSavings.toFixed(2)})
          </Text>
        </View>
      )} */}

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

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const Totals = React.memo(TotalsComponent);

export default Totals;
