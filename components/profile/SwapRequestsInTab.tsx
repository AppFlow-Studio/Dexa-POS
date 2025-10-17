import { ArrowRightLeft } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

const SwapRequestsInTab = () => {
  return (
    <View className="p-12 bg-[#303030] border border-gray-700 rounded-2xl items-center justify-center">
      <ArrowRightLeft size={48} color="#6B7280" />
      <Text className="text-lg font-semibold text-white mt-4">
        No Incoming Swap Requests
      </Text>
      <Text className="text-sm text-gray-500 mt-2">
        No one has requested to swap shifts with you yet.
      </Text>
    </View>
  );
};

export default SwapRequestsInTab;
