import { ArrowUp } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "increase" | "decrease";
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon,
}) => {
  const changeColor =
    changeType === "increase" ? "text-green-500" : "text-red-500";

  return (
    <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-200">
      <View className="flex-row justify-between items-start">
        <Text className="text-base font-semibold text-gray-500">{title}</Text>
        <View className="p-2 bg-blue-50 rounded-lg">{icon}</View>
      </View>
      <Text className="text-3xl font-bold text-gray-800 mt-2">{value}</Text>
      <View className="flex-row items-center mt-1">
        <ArrowUp className={changeColor} size={16} />
        <Text className={`ml-1 font-semibold ${changeColor}`}>{change}</Text>
        <Text className="text-gray-500"> than yesterday</Text>
      </View>
    </View>
  );
};

export default StatCard;
