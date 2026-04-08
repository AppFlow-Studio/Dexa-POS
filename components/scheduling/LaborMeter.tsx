import { Progress } from "@/components/ui/progress";
import { colors } from "@/lib/theme";
import { DollarSign, TrendingUp } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";

interface LaborMeterProps {
  projectedCost: number;
  forecastSales: number;
  period: "day" | "week";
}

const LaborMeter: React.FC<LaborMeterProps> = ({
  projectedCost,
  forecastSales,
  period,
}) => {
  const laborPercentage =
    forecastSales > 0 ? (projectedCost / forecastSales) * 100 : 0;
  const isOverBudget = laborPercentage > 30;

  const trendColor = isOverBudget ? "text-red-500" : "text-green-400";

  return (
    <View className="flex-row items-center gap-8 px-4 py-3 bg-panel rounded-2xl ">
      <View className="flex-row items-center gap-2 max-w-[60px]">
        <TrendingUp
          className={trendColor}
          color={`${isOverBudget ? "red" : "green"}`}
          size={16}
        />
        <View>
          <Text className="text-xs text-gray-400">Labor {period}</Text>
          <Text className={`text-sm font-semibold ${trendColor}`}>
            {laborPercentage.toFixed(1)}%
          </Text>
        </View>
      </View>

      <View className="flex-1 max-w-[100px]">
        <Progress
          value={Math.min(laborPercentage, 100)}
          className="h-2 bg-[#353f57]"
          indicatorClassName="bg-[#8aa5f9]"
        />
      </View>

      <View className="flex-row items-center gap-2">
        <DollarSign size={16} color={colors.label} />
        <Text className="text-gray-400">
          ${projectedCost.toLocaleString()} / ${forecastSales.toLocaleString()}
        </Text>
      </View>
    </View>
  );
};

export default LaborMeter;
