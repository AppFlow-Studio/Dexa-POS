import React from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { usePaymentStore } from "@/stores/usePaymentStore";

const CustomAmountView = () => {
  const { splits, updateSplitAmount } = usePaymentStore();

  return (
    <View className="flex-1 p-4 bg-[#212121]">
      <Text className="text-2xl font-bold text-white mb-4">
        Enter Custom Amounts
      </Text>
      <ScrollView>
        {splits.map((split, index) => (
          <View
            key={split.id}
            className="flex-row items-center justify-between p-3 mb-2 bg-[#303030] border border-gray-700 rounded-lg"
          >
            <Text className="text-xl font-bold text-blue-400 w-28">
              {split.customerName}
            </Text>
            <View className="flex-1 flex-row items-center bg-[#212121] rounded-md px-2 border border-gray-600">
              <Text className="font-bold text-xl text-gray-400">$</Text>
              <TextInput
                className="flex-1 p-3 text-xl font-semibold text-right text-white h-14"
                value={split.amount > 0 ? split.amount.toString() : ""}
                onChangeText={(text) => {
                  const amount = parseFloat(text) || 0;
                  updateSplitAmount(split.id, amount);
                }}
                placeholder="0.00"
                placeholderTextColor="#6B7280"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default CustomAmountView;
