import { useCartStore } from "@/stores/useCartStore";
import React from "react";
import { Text, View } from "react-native";

const Totals: React.FC = () => {
  const { subtotal, tax, total, discountAmount } = useCartStore();

  const voucher = 0.0;

  return (
    <View className="p-4 bg-background-200">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base text-accent-300">Subtotal</Text>
        <Text className="text-base text-accent-300">
          ${subtotal.toFixed(2)}
        </Text>
      </View>
      {discountAmount > 0 && (
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-accent-300">Discount</Text>
          <Text className="text-base text-accent-300">
            -${discountAmount.toFixed(2)}
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
