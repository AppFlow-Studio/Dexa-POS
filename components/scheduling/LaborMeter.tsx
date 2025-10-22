import React from 'react';
import { View, Text } from 'react-native';
import { DollarSign, TrendingUp } from 'lucide-react-native';
import { Progress } from '@/components/ui/progress'; // Assuming this component exists

interface LaborMeterProps {
  projectedCost: number;
  forecastSales: number;
  period: "day" | "week";
}

const LaborMeter: React.FC<LaborMeterProps> = ({ projectedCost, forecastSales, period }) => {
  const laborPercentage = forecastSales > 0 ? (projectedCost / forecastSales) * 100 : 0;
  const isOverBudget = laborPercentage > 30;

  const trendColor = isOverBudget ? "text-red-500" : "text-green-400";

  return (
    <View className="flex-row items-center gap-4 px-4 py-3 bg-[#212121] rounded-xl border border-gray-700">
      <View className="flex-row items-center gap-2 min-w-[120px]">
        <TrendingUp className={trendColor} size={16} />
        <View>
          <Text className="text-xs text-gray-400">Labor {period}</Text>
          <Text className={`text-sm font-semibold ${trendColor}`}>
            {laborPercentage.toFixed(1)}%
          </Text>
        </View>
      </View>

      <View className="flex-1 min-w-[200px]">
        <Progress value={Math.min(laborPercentage, 100)} className="h-2" />
      </View>

      <View className="flex-row items-center gap-2 text-xs text-gray-400">
        <DollarSign size={12} />
        <Text>
          ${projectedCost.toLocaleString()} / ${forecastSales.toLocaleString()}
        </Text>
      </View>
    </View>
  );
};

export default LaborMeter;
