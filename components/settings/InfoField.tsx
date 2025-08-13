import React from "react";
import { Text, View } from "react-native";

interface InfoFieldProps {
  label: string;
  value: string;
}

const InfoField: React.FC<InfoFieldProps> = ({ label, value }) => {
  return (
    <View className="bg-background-300 p-4 rounded-2xl border border-background-400">
      <Text className="text-base font-semibold text-accent-500 mb-1">
        {label}
      </Text>
      <Text className="text-lg text-gray-800 bg-white p-4 rounded-2xl">
        {value}
      </Text>
    </View>
  );
};

export default InfoField;
