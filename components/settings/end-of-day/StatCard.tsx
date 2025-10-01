import React from "react";
import { Text, View } from "react-native";

interface StatCardProps {
  title: string;
  value: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value }) => {
  return (
    <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-200">
      <Text className="text-xl font-semibold text-gray-500 mb-0.5">
        {title}
      </Text>
      <Text className="text-4xl font-bold text-gray-800">
        ${value.toFixed(2)}
      </Text>
      {/* Placeholder for change value, currently static */}
      <Text className="text-lg text-green-500">+$100.50</Text>
    </View>
  );
};

export default StatCard;
