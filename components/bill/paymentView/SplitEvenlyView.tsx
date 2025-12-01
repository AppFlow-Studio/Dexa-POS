import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, Check, Minus, Plus, Users } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const SplitEvenlyView = () => {
  const { setView, splitEvenly } =
    usePaymentStore();
  const { activeOrderOutstandingTotal } = useOrderStore();

  const [numberOfPeople, setNumberOfPeople] = useState(2);

  const amountPerPerson = activeOrderOutstandingTotal / numberOfPeople;

  const handleIncrement = () => {
    if (numberOfPeople < 20) setNumberOfPeople((p) => p + 1);
  };

  const handleDecrement = () => {
    if (numberOfPeople > 2) setNumberOfPeople((p) => p - 1);
  };

  const handleConfirmSplit = () => {
    splitEvenly(numberOfPeople, amountPerPerson);
    setView("success");
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-[#333] shrink-0">
        <TouchableOpacity
          onPress={() => setView("split-options")}
          className="p-2 bg-[#333] rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Split Evenly</Text>
          <Text className="text-gray-400">Divide the total bill equally.</Text>
        </View>
      </View>

      {/* Main Content - Side by Side Layout */}
      <View className="flex-1 flex-row p-6 gap-6">
        {/* LEFT: Controls (Input) */}
        <View className="flex-1 bg-[#2A2A2A] rounded-3xl border border-[#333] justify-center items-center">
          <View className="items-center">
            <View className="w-16 h-16 bg-blue-900/20 rounded-full items-center justify-center mb-6">
              <Users size={32} color="#60A5FA" />
            </View>
            <Text className="text-xl font-semibold text-gray-300 mb-8">
              Number of People
            </Text>

            <View className="flex-row items-center gap-8">
              <TouchableOpacity
                onPress={handleDecrement}
                className={`w-20 h-20 rounded-full border-2 items-center justify-center ${
                  numberOfPeople <= 2
                    ? "border-[#444] bg-[#222]"
                    : "border-gray-500 bg-[#333]"
                }`}
                disabled={numberOfPeople <= 2}
              >
                <Minus
                  size={36}
                  color={numberOfPeople <= 2 ? "#555" : "white"}
                />
              </TouchableOpacity>

              <Text className="text-8xl font-bold text-white w-32 text-center">
                {numberOfPeople}
              </Text>

              <TouchableOpacity
                onPress={handleIncrement}
                className="w-20 h-20 rounded-full border-2 border-gray-500 bg-[#333] items-center justify-center"
              >
                <Plus size={36} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* RIGHT: Financials & Action (Result) */}
        <View className="flex-1 justify-between">
          {/* Summary Card */}
          <View className="bg-[#262626] rounded-3xl border border-[#333] p-8 flex-1 justify-center mb-6">
            {/* Total Bill */}
            <View className="flex-row justify-between items-end mb-6 pb-6 border-b border-[#333]">
              <Text className="text-gray-400 font-medium text-lg">
                Total Bill
              </Text>
              <Text className="text-3xl font-bold text-gray-300">
                ${activeOrderOutstandingTotal.toFixed(2)}
              </Text>
            </View>

            {/* Per Person */}
            <View>
              <Text className="text-gray-400 font-medium text-lg mb-2">
                Amount per person
              </Text>
              <Text className="text-6xl font-bold text-blue-400">
                ${amountPerPerson.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleConfirmSplit}
            className="w-full py-5 bg-blue-600 rounded-2xl flex-row items-center justify-center shadow-lg shadow-blue-900/20 active:bg-blue-700"
          >
            <Check size={24} color="white" className="mr-3" />
            <Text className="font-bold text-xl text-white">
              Create {numberOfPeople} Splits
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitEvenlyView;
