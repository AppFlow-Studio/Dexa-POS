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
      className="bg-panel p-4 rounded-xl border border-border"
      style={{ minHeight: 130 }}
      activeOpacity={0.75}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: '#2DD4BF15' }}>
          {icon}
        </View>
      </View>
      <Text className="text-xs font-medium text-label mb-1" numberOfLines={1}>{title}</Text>
      <View className="flex-row items-baseline gap-1.5 mb-1">
        <Text className="text-xl font-bold text-heading">{value}</Text>
        {trend && (
          <Text className={`text-xs font-semibold ${trendColor}`}>{trend}</Text>
        )}
      </View>
      <Text style={{ fontSize: 11, color: '#64748B' }}>{period}</Text>
    </TouchableOpacity>
  );
};

export default AnalyticsCard;
