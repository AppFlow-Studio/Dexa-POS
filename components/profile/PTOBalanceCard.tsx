import React from "react";
import { Text, View } from "react-native";

interface PTOBalanceCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "default" | "primary" | "secondary"; // Added primary and secondary
}

const PTOBalanceCard: React.FC<PTOBalanceCardProps> = ({
  label,
  value,
  icon,
  variant,
}) => {
  const textClasses = {
    success: "text-green-400",
    warning: "text-yellow-400",
    default: "text-white",
    primary: "text-blue-400", // New text color for primary
    secondary: "text-gray-400", // New text color for secondary
  };

  const bgClasses = {
    success: "bg-green-600/10",
    warning: "bg-yellow-600/10",
    default: "bg-[#303030]",
    primary: "bg-blue-600/10", // New background for primary
    secondary: "bg-gray-600/10", // New background for secondary
  };

  const borderClasses = {
    success: "border-green-500/20",
    warning: "border-yellow-500/20",
    default: "border-gray-700",
    primary: "border-blue-500/20", // New border for primary
    secondary: "border-gray-500/20", // New border for secondary
  };

  return (
    <View
      className={`flex-1 p-4 rounded-2xl ${bgClasses[variant]} ${borderClasses[variant]} border`}
    >
      <View className="flex-row items-start justify-between mb-2">{icon}</View>
      <Text className={`text-3xl font-bold mb-1 ${textClasses[variant]}`}>
        {value}
      </Text>
      <Text className="text-sm text-gray-400">{label}</Text>
    </View>
  );
};

export default PTOBalanceCard;
