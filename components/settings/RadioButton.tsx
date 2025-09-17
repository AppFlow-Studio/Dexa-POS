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
      className={`flex-row justify-between items-center p-6 border rounded-lg ${isSelected ? "border-blue-500 bg-blue-50" : "bg-[#303030] border-gray-600"}`}
    >
      <Text
        className={`font-bold text-2xl ${isSelected ? "text-blue-400" : "text-gray-300"}`}
      >
        {label}
      </Text>
      <View
        className={`w-7 h-7 rounded-full border-2 items-center justify-center ${isSelected ? "border-green-500" : "border-gray-500"}`}
      >
        {isSelected && <View className="w-3 h-3 bg-green-500 rounded-full" />}
      </View>
    </TouchableOpacity>
  );
};

export default RadioButton;
