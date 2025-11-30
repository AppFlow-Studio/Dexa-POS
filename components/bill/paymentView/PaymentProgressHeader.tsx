import { usePaymentStore } from "@/stores/usePaymentStore";
import React from "react";
import { Text, View } from "react-native";

const PaymentProgressHeader: React.FC = () => {
  const { progress } = usePaymentStore();
  const { currentStep, totalSteps } = progress;

  return (
    <View className="h-10 bg-gray-700 items-center justify-center">
      <Text className="text-gray-400 font-semibold">
        Step {currentStep} of {totalSteps}
      </Text>
    </View>
  );
};

export default PaymentProgressHeader;