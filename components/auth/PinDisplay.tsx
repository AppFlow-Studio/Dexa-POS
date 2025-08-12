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
    <View className="flex-row items-center justify-center gap-4 h-16 bg-white border border-gray-200 rounded-lg mb-8">
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          className={`w-4 h-4 m-1 rounded-full ${
            index < pinLength ? "bg-gray-800" : "bg-gray-200"
          }`}
        />
      ))}
    </View>
  );
};

export default PinDisplay;
