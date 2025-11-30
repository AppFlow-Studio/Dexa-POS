import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, ListChecks, Split, Users } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const SplitOptionsView: React.FC = () => {
  const setView = usePaymentStore((state) => state.setView);

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-[#333]">
        <TouchableOpacity
          onPress={() => setView("payment-method-selection")}
          className="p-2 bg-[#333] rounded-lg mr-4"
        >
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold text-white">Split Bill</Text>
          <Text className="text-gray-400">
            Choose how to divide the payment.
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View className="flex-1 justify-center items-center p-6">
        <View className="flex-row gap-4 w-full max-w-4xl h-[280px]">
          {/* Option 1: Split by Item */}
          <TouchableOpacity
            className="flex-1 bg-[#2A2A2A] rounded-2xl p-6 border border-[#333] justify-between active:bg-[#333]"
            onPress={() => setView("split-by-item")}
          >
            <View className="w-16 h-16 rounded-full bg-sky-500/10 items-center justify-center mb-4">
              <ListChecks size={32} color="#0EA5E9" />
            </View>
            <View>
              <Text className="text-xl font-bold text-white mb-2">
                Split by Item
              </Text>
              <Text className="text-gray-400 leading-5">
                Assign specific items to specific guests (e.g. Guest 1 had the
                Burger).
              </Text>
            </View>
          </TouchableOpacity>

          {/* Option 2: Split Evenly */}
          <TouchableOpacity
            className="flex-1 bg-[#2A2A2A] rounded-2xl p-6 border border-[#333] justify-between active:bg-[#333]"
            onPress={() => setView("split-evenly")}
          >
            <View className="w-16 h-16 rounded-full bg-green-500/10 items-center justify-center mb-4">
              <Users size={32} color="#22C55E" />
            </View>
            <View>
              <Text className="text-xl font-bold text-white mb-2">
                Split Evenly
              </Text>
              <Text className="text-gray-400 leading-5">
                Divide the total bill equally among a specific number of people.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Option 3: Custom Amount */}
          <TouchableOpacity
            className="flex-1 bg-[#2A2A2A] rounded-2xl p-6 border border-[#333] justify-between active:bg-[#333]"
            onPress={() => setView("split-custom-amount")}
          >
            <View className="w-16 h-16 rounded-full bg-yellow-500/10 items-center justify-center mb-4">
              <Split size={32} color="#EAB308" />
            </View>
            <View>
              <Text className="text-xl font-bold text-white mb-2">
                Custom Amount
              </Text>
              <Text className="text-gray-400 leading-5">
                Manually type in exactly how much each person wants to pay.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default SplitOptionsView;
