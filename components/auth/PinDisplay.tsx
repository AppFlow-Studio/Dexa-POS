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
    <View className="flex-row items-center justify-center gap-6 h-20 bg-white border border-gray-200 rounded-lg mb-8">
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          className={`w-6 h-6 m-2 rounded-full ${
            index < pinLength ? "bg-gray-800" : "bg-gray-200"
          }`}
        />
      ))}
    </View>
  );
};

export default PinDisplay;
