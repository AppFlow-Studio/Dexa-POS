import React from "react";
import { View } from "react-native";

interface PinDisplayProps {
  pinLength: number;
  maxLength?: number;
}

const PinDisplay: React.FC<PinDisplayProps> = ({
  pinLength,
  maxLength = 6,
}) => {
  return (
    <View className="flex-row items-center justify-center gap-6 h-20 bg-[#212121] border-gray-700 rounded-lg mb-8">
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          className={`w-6 h-6 m-2 rounded-full ${
            index < pinLength ? "bg-white" : "bg-gray-600"
          }`}
        />
      ))}
    </View>
  );
};

export default PinDisplay;
