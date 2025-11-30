import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useOrderStore } from "@/stores/useOrderStore";

const SplitEvenlyView = () => {
  const { addSplit, updateSplitAmount } = usePaymentStore();
  const { activeOrderOutstandingTotal } = useOrderStore();
  const [numberOfPeople, setNumberOfPeople] = useState(2);

  const handleSplitEvenly = (numPeople: number) => {
    setNumberOfPeople(numPeople);
    const amountPerPerson = activeOrderOutstandingTotal / numPeople;
    // Clear existing splits and create new ones
    // This is a simplified approach. A more robust implementation would handle existing splits.
    const { splits, removeSplit } = usePaymentStore.getState();
    splits.forEach((split) => removeSplit(split.id));

    for (let i = 0; i < numPeople; i++) {
      const newSplitId = `split_${Date.now()}_${i}`;
      addSplit(`Person ${i + 1}`);
      // The `addSplit` is async, so we need to wait for the next render to update the amount.
      // A better approach would be to have a single action that creates all splits at once.
      setTimeout(() => {
        const { splits } = usePaymentStore.getState();
        const newSplit = splits.find(s => s.customerName === `Person ${i + 1}`);
        if(newSplit) {
            updateSplitAmount(newSplit.id, amountPerPerson);
        }
      }, 0);
    }
  };

  return (
    <View className="flex-1 p-4 bg-[#212121]">
      <Text className="text-2xl font-bold text-white mb-4">Split Evenly</Text>
      <Text className="text-lg font-semibold text-gray-300 mb-2">
        Number of People:
      </Text>
      <View className="flex-row gap-3">
        {[2, 3, 4, 5, 6, 7, 8].map((num) => (
          <TouchableOpacity
            key={num}
            onPress={() => handleSplitEvenly(num)}
            className={`w-14 h-14 rounded-lg border items-center justify-center ${
              numberOfPeople === num
                ? "border-blue-500 bg-blue-900/30"
                : "border-gray-600"
            }`}
          >
            <Text
              className={`text-xl font-semibold ${
                numberOfPeople === num ? "text-blue-400" : "text-gray-300"
              }`}
            >
              {num}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default SplitEvenlyView;
