import React from 'react';
import { View, Text } from 'react-native';

interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  trendColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, trend, trendColor }) => {
  return (
    <View className="p-4 rounded-lg bg-[#303030] border border-gray-700 flex-1">
      <Text className="text-xs text-gray-400 mb-1">{title}</Text>
      <Text className="text-2xl font-bold text-white">{value}</Text>
      {trend && <Text className={`text-xs ${trendColor || 'text-gray-400'} mt-1`}>{trend}</Text>}
    </View>
  );
};

export default StatCard;
