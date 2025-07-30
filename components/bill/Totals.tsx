import { useCartStore } from "@/stores/useCartStore";
import React from "react";
import { Text, View } from "react-native";

const Totals: React.FC = () => {
  const { subtotal, tax, total } = useCartStore();
  const voucher = 0.0;

  return (
    <View className="my-4">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base text-gray-600">Subtotal</Text>
        <Text className="text-base text-gray-800">${subtotal.toFixed(2)}</Text>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-base text-gray-600">Tax</Text>
        <Text className="text-base text-gray-800">${tax.toFixed(2)}</Text>
      </View>
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-base text-gray-600">Voucher</Text>
        <Text className="text-base text-gray-800">${voucher.toFixed(2)}</Text>
      </View>
      <View className="border-t border-dashed border-gray-300 pt-4 flex-row justify-between items-center">
        <Text className="text-lg font-bold text-gray-900">Total</Text>
        <Text className="text-lg font-bold text-gray-900">
          ${total.toFixed(2)}
        </Text>
      </View>
    </View>
  );
};

export default Totals;
