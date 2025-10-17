import React from "react";
import { Text, View } from "react-native";

interface PTOBalanceCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "default";
}

const PTOBalanceCard: React.FC<PTOBalanceCardProps> = ({
  label,
  value,
  icon,
  variant,
}) => {
  const variantClasses = {
    success: "text-green-400",
    warning: "text-yellow-400",
    default: "text-white",
  };
  return (
    <View className="flex-1 bg-[#303030] p-4 rounded-2xl border border-gray-700">
      <View className="flex-row items-start justify-between mb-2">{icon}</View>
      <Text className={`text-3xl font-bold mb-1 ${variantClasses[variant]}`}>
        {value}
      </Text>
      <Text className="text-sm text-gray-400">{label}</Text>
    </View>
  );
};

export default PTOBalanceCard;
