import { CartItem } from "@/lib/types"; // Use your global CartItem type
import React, { useMemo } from "react";
import { Text, View } from "react-native";

// 1. The component now accepts a `cart` array as a prop
interface TotalsProps {
  cart: CartItem[];
}

const TAX_RATE = 0.05; // It's good practice to keep constants like this here

const Totals: React.FC<TotalsProps> = ({ cart }) => {
  // 2. It no longer calls the useCartStore hook.
  // Instead, it calculates the totals based on the passed-in cart prop.
  const { subtotal, tax, total, totalDiscountAmount } = useMemo(() => {
    // This logic should mirror the recalculateTotals function in your store
    const sub = cart.reduce(
      (acc, item) => acc + item.originalPrice * item.quantity,
      0
    );

    const itemDiscounts = cart.reduce((acc, item) => {
      if (item.appliedDiscount) {
        return (
          acc + item.originalPrice * item.appliedDiscount.value * item.quantity
        );
      }
      return acc;
    }, 0);

    // Assuming check-level discounts are handled globally or passed down if needed
    const totalDiscount = itemDiscounts; // + checkDiscountAmount
    const subAfterDiscount = sub - totalDiscount;
    const tx = subAfterDiscount * TAX_RATE;
    const tot = subAfterDiscount + tx;

    return {
      subtotal: sub,
      tax: tx,
      total: tot,
      totalDiscountAmount: totalDiscount,
    };
  }, [cart]);

  const voucher = 0.0;

  return (
    <View className="p-4 bg-background-200">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base text-accent-300">Subtotal</Text>
        <Text className="text-base text-accent-300">
          ${subtotal.toFixed(2)}
        </Text>
      </View>
      {totalDiscountAmount > 0 && (
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-accent-300">Discount</Text>
          <Text className="text-base text-accent-300">
            -${totalDiscountAmount.toFixed(2)}
          </Text>
        </View>
      )}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base text-accent-300">Tax</Text>
        <Text className="text-base text-accent-300">${tax.toFixed(2)}</Text>
      </View>
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-base text-accent-300">Voucher</Text>
        <Text className="text-base text-accent-300">${voucher.toFixed(2)}</Text>
      </View>
      <View className="border-t border-dashed border-gray-300 pt-4 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-accent-500">Total</Text>
        <Text className="text-lg font-bold text-accent-500">
          ${total.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default Totals;
