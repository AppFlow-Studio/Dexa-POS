import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { Text, View } from "react-native";

interface TotalsProps {
  cart: CartItem[];
}

const Totals: React.FC<TotalsProps> = ({ cart }) => {
  const {
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
  } = useOrderStore();

  const voucher = 0.0;

  return (
    <View className="px-6 py-1 bg-[#212121]">
      <View className="space-y-1">
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


      <View className="border-t border-dashed border-gray-600 mt-2 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-white">Total</Text>
        <Text className="text-lg font-bold text-white">
          ${activeOrderTotal.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default Totals;
