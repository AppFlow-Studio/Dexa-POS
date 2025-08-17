import { CartItem } from "@/lib/types";
import { useCartStore } from "@/stores/useCartStore";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface TotalsProps {
  cart: CartItem[];
}

const TAX_RATE = 0.05;

const Totals: React.FC<TotalsProps> = ({ cart }) => {
  // We still need the global store to check for a check-level discount
  const checkDiscount = useCartStore((state) => state.checkDiscount);

  const { subtotal, tax, total, totalDiscountAmount } = useMemo(() => {
    // --- THIS IS THE FIX ---
    // 1. Calculate the subtotal based on `item.price` (the price with customizations)
    const sub = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

    // 2. Calculate item-level discounts based on the final item price
    const itemDiscounts = cart.reduce((acc, item) => {
      if (item.appliedDiscount) {
        // The discount is a percentage of the final item price
        return acc + item.price * item.appliedDiscount.value * item.quantity;
      }
      return acc;
    }, 0);

    const subtotalAfterItemDiscounts = sub - itemDiscounts;

    // 3. Calculate check-level discount based on the subtotal *after* item discounts
    let checkDiscountAmount = 0;
    if (checkDiscount) {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    }

    const totalDiscount = itemDiscounts + checkDiscountAmount;
    const finalSubtotal = sub - totalDiscount;
    const tx = finalSubtotal * TAX_RATE;
    const tot = finalSubtotal + tx;

    return {
      subtotal: sub,
      tax: tx,
      total: tot,
      totalDiscountAmount: totalDiscount,
    };
  }, [cart, checkDiscount]); // Add checkDiscount to the dependency array

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
          <Text className="text-base text-green-600">Discount</Text>
          <Text className="text-base text-green-600">
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
