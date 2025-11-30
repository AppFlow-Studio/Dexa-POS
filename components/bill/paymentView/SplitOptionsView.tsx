import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ListChecks, Split, Users } from "lucide-react-native";
import { usePaymentStore } from "@/stores/usePaymentStore";

const SplitOptionsView: React.FC = () => {
  const setView = usePaymentStore((state) => state.setView);

  return (
    <View className="flex-1 items-center justify-center p-4 bg-[#212121]">
      <Text className="text-2xl font-bold text-white mb-8">
        How do you want to split the bill?
      </Text>

      <View className="flex-row justify-around w-full max-w-lg">
        <TouchableOpacity
          className="bg-[#303030] rounded-xl p-6 items-center w-[30%] border border-gray-700"
          onPress={() => setView("split-by-item")}
        >
          <ListChecks size={40} color="#0EA5E9" />
          <Text className="text-lg font-semibold text-white mt-4">
            Split by Item
          </Text>
          <Text className="text-sm text-gray-400 text-center mt-1">
            Assign specific items to each person.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[#303030] rounded-xl p-6 items-center w-[30%] border border-gray-700"
          onPress={() => setView("split-evenly")}
        >
          <Users size={40} color="#22C55E" />
          <Text className="text-lg font-semibold text-white mt-4">
            Split Evenly
          </Text>
          <Text className="text-sm text-gray-400 text-center mt-1">
            Divide the total among a number of people.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[#303030] rounded-xl p-6 items-center w-[30%] border border-gray-700"
          onPress={() => setView("split-custom-amount")}
        >
          <Split size={40} color="#EAB308" />
          <Text className="text-lg font-semibold text-white mt-4">
            Custom Amount
          </Text>
          <Text className="text-sm text-gray-400 text-center mt-1">
            Manually enter amounts for each split.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SplitOptionsView;
