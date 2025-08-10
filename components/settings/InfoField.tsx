import React from "react";
import { Text, View } from "react-native";

interface InfoFieldProps {
  label: string;
  value: string;
}

const InfoField: React.FC<InfoFieldProps> = ({ label, value }) => {
  return (
    <View className="bg-white p-4 rounded-2xl border border-gray-200">
      <Text className="text-base font-semibold text-gray-500 mb-1">
        {label}
      </Text>
      <Text className="text-lg text-gray-800">{value}</Text>
    </View>
  );
};

export default InfoField;
