import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface RadioButtonProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const RadioButton: React.FC<RadioButtonProps> = ({
  label,
  isSelected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row justify-between items-center p-4 border rounded-lg ${isSelected ? "border-primary-400 bg-blue-50" : "border-gray-200"}`}
    >
      <Text
        className={`font-semibold ${isSelected ? "text-primary-400" : "text-gray-700"}`}
      >
        {label}
      </Text>
      <View
        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${isSelected ? "border-[#30A25D]" : "border-gray-300"}`}
      >
        {isSelected && (
          <View className="w-2.5 h-2.5 bg-[#30A25D] rounded-full" />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default RadioButton;
