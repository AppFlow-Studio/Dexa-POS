import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface AnalyticsCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  trend?: string;
  period: string;
  variant?: "success" | "warning";
  onPress?: () => void;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  icon,
  title,
  value,
  trend,
  period,
  variant,
  onPress,
}) => {
  const trendColor =
    variant === "success"
      ? "text-green-400"
      : variant === "warning"
        ? "text-yellow-400"
        : "text-gray-400";

  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 bg-[#303030] p-4 rounded-2xl border border-gray-700 min-h-[150px] justify-between hover:border-blue-500 transition-colors"
      activeOpacity={0.8}
    >
      <View>
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-medium text-gray-400">{title}</Text>
          {icon}
        </View>
        <View className="flex-row items-baseline gap-2 mt-2">
          <Text className="text-3xl font-bold text-white">{value}</Text>
          {trend && (
            <Text className={`text-base font-semibold ${trendColor}`}>
              {trend}
            </Text>
          )}
        </View>
      </View>
      <Text className="text-sm text-gray-500 mt-1">{period}</Text>
    </TouchableOpacity>
  );
};

export default AnalyticsCard;
