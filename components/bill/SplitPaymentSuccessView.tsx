import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowRight, CheckCircle2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const SplitPaymentSuccessView = () => {
  const splits = usePaymentStore((s) => s.splits);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const moveToNextSplit = usePaymentStore((s) => s.moveToNextSplit);

  // The split that just finished is the one currently set as 'activeSplitId'
  // (before we move to next) OR we can find the last paid one.
  // Actually, we haven't changed activeSplitId yet in the store logic above,
  // we just updated its status to 'paid'. So activeSplitId is the one just finished.

  const justPaidSplit = splits.find((s) => s.id === activeSplitId);
  const nextSplit = splits.find((s) => s.status === "pending");

  return (
    <View className="flex-1 bg-panel items-center justify-center p-6">
      <View className="items-center mb-10">
        <View className="w-24 h-24 bg-green-500/20 rounded-full items-center justify-center mb-6">
          <CheckCircle2 size={48} color={colors.success} />
        </View>
        <Text className="text-3xl font-bold text-white text-center mb-2">
          Payment Received
        </Text>
        <Text className="text-xl text-gray-400 text-center">
          {justPaidSplit?.customerName} is all set!
        </Text>
      </View>

      <TouchableOpacity
        onPress={moveToNextSplit}
        className="w-full py-5 bg-blue-600 rounded-2xl flex-row items-center justify-center shadow-lg active:bg-blue-700"
      >
        <Text className="text-xl font-bold text-white mr-2">
          Pay for {nextSplit?.customerName || "Next Guest"}
        </Text>
        <ArrowRight size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

export default SplitPaymentSuccessView;
