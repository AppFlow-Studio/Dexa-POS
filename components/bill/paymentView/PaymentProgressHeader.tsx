import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PaymentProgressHeader: React.FC = () => {
  const { progress } = usePaymentStore();
  const { currentStep, totalSteps } = progress;

  // Animation Shared Value
  const progressWidth = useSharedValue(0);

  // Update animation when step changes
  useEffect(() => {
    const percentage = (currentStep / totalSteps) * 100;
    progressWidth.value = withTiming(percentage, { duration: 500 });
  }, [currentStep, totalSteps]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  return (
    <View className="w-full px-6 py-2 bg-[#212121]">
      {/* Label Row */}
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-gray-400 text-xs font-bold uppercase tracking-widest">
          Processing Payment
        </Text>
        <Text className="text-blue-400 text-xs font-bold">
          Step {currentStep} / {totalSteps}
        </Text>
      </View>

      {/* Progress Track */}
      <View className="h-1.5 w-full bg-[#333333] rounded-full overflow-hidden">
        {/* Animated Progress Fill */}
        <Animated.View
          className="h-full bg-blue-600 rounded-full"
          style={animatedStyle}
        />
      </View>
    </View>
  );
};

export default PaymentProgressHeader;
