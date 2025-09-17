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
    <View className="px-6 py-3 bg-[#212121]">
      <View className="flex-row justify-between items-center mb-2 mt-2">
        <Text className="text-xl text-accent-100">Subtotal</Text>
        <Text className="text-xl text-accent-100">
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
        <Text className="text-xl text-accent-100">Tax</Text>
        <Text className="text-xl text-accent-100">
          ${activeOrderTax.toFixed(2)}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xl text-accent-100">Voucher</Text>
        <Text className="text-xl text-accent-100">${voucher.toFixed(2)}</Text>
      </View>
      <View className="border-t border-dashed border-gray-300 pt-2 flex-row justify-between items-center">
        <Text className="text-xl font-bold text-white">Total</Text>
        <Text className="text-xl font-bold text-white">
          ${activeOrderTotal.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default Totals;
