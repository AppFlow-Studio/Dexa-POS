import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { Text, View } from "react-native";

interface TotalsProps {
  cart: CartItem[];
}

const TAX_RATE = 0.05;

const Totals: React.FC<TotalsProps> = ({ cart }) => {
  const {
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
  } = useOrderStore();

  const voucher = 0.0; // This can remain as a static value for now

  return (
    <View className="px-4 py-2 bg-background-200">
      <View className="flex-row justify-between items-center mb-2 mt-2">
        <Text className="text-xl text-accent-300">Subtotal</Text>
        <Text className="text-xl text-accent-300">
          ${activeOrderSubtotal.toFixed(2)}
        </Text>
      </View>
      {activeOrderDiscount > 0 && (
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl text-green-600">Discount</Text>
          <Text className="text-xl text-green-600">
            -${activeOrderDiscount.toFixed(2)}
          </Text>
        </View>
      )}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xl text-accent-300">Tax</Text>
        <Text className="text-xl text-accent-300">
          ${activeOrderTax.toFixed(2)}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xl text-accent-300">Voucher</Text>
        <Text className="text-xl text-accent-300">${voucher.toFixed(2)}</Text>
      </View>
      <View className="border-t border-dashed border-gray-300 pt-2 flex-row justify-between items-center">
        <Text className="text-xl font-bold text-accent-500">Total</Text>
        <Text className="text-xl font-bold text-accent-500">
          ${activeOrderTotal.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default Totals;
