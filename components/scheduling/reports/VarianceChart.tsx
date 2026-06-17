import { Card } from "@/components/ui/card";
import { colors } from "@/lib/theme";
import React from "react";
import { Dimensions, Text, View } from "react-native";
import { BarChart } from "@/components/charts/LazyGiftedCharts";

const LegendItem = ({ color, text }: { color: string; text: string }) => (
  <View className="flex-row items-center gap-2">
    <View className={`w-4 h-4 rounded-sm bg-[${color}]`} />
    <Text className="text-white text-sm">{text}</Text>
  </View>
);

const VarianceChart = () => {
  const mockData = [
    {
      value: 120,
      label: "Mon",
      frontColor: colors.info,
    },
    {
      value: 118,
      frontColor: "#82a6ff",
    },
    {
      value: 115,
      label: "Tue",
      frontColor: colors.info,
    },
    {
      value: 122,
      frontColor: "#82a6ff",
    },
    {
      value: 125,
      label: "Wed",
      frontColor: colors.info,
    },
    {
      value: 120,
      frontColor: "#82a6ff",
    },
    {
      value: 130,
      label: "Thu",
      frontColor: colors.info,
    },
    {
      value: 135,
      frontColor: "#82a6ff",
    },
    {
      value: 140,
      label: "Fri",
      frontColor: colors.info,
    },
    {
      value: 145,
      frontColor: "#82a6ff",
    },
    {
      value: 150,
      label: "Sat",
      frontColor: colors.info,
    },
    {
      value: 148,
      frontColor: "#82a6ff",
    },
    {
      value: 135,
      label: "Sun",
      frontColor: colors.info,
    },
    {
      value: 130,
      frontColor: "#82a6ff",
    },
  ];

  const chartWidth = Dimensions.get("window").width - 70;

  return (
    <Card className="p-6 bg-panel border-border overflow-hidden">
      <View className="mb-6">
        <Text className="text-lg font-semibold text-white mb-1">
          Hours Variance
        </Text>
        <Text className="text-sm text-gray-400">
          Scheduled vs Actual hours worked this week
        </Text>
      </View>
      <View className="flex-1 w-full overflow-hidden">
        <BarChart
          data={mockData}
          isAnimated
          animationDuration={800}
          width={chartWidth}
          barWidth={16}
          spacing={24}
          rulesType="solid"
          rulesColor={colors.border}
          yAxisTextStyle={{ color: colors.label }}
          xAxisLabelTextStyle={{ color: colors.label }}
          noOfSections={4}
          pointerConfig={{
            pointerStripHeight: 160,
            pointerStripColor: "lightgray",
            pointerStripWidth: 2,
            pointerColor: "lightgray",
            radius: 6,
            pointerLabelWidth: 120,
            pointerLabelHeight: 90,
            activatePointersOnLongPress: true,
            autoAdjustPointerLabelPosition: false,
            pointerLabelComponent: (items: any[]) => {
              return (
                <View className="h-24 w-28 justify-center items-center mt-[-4px] ml-[-40px]">
                  <Text className="text-white text-center mb-2">
                    {items[0].date}
                  </Text>
                  <View className="px-4 py-2 rounded-2xl bg-white">
                    <Text className="font-bold text-center">
                      {"$" + items[0].value.toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            },
          }}
        />
      </View>

      <View className="flex-row justify-center gap-6 mt-4">
        <LegendItem color={colors.info} text="Scheduled" />
        <LegendItem color="#82a6ff" text="Actual" />
      </View>

      <View className="flex-row justify-around mt-6 pt-6 border-t border-gray-700">
        <View className="items-center">
          <Text className="text-xs text-gray-400 mb-1">Total Scheduled</Text>
          <Text className="text-2xl font-bold text-white">915h</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-gray-400 mb-1">Total Actual</Text>
          <Text className="text-2xl font-bold text-white">918h</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs text-gray-400 mb-1">Variance</Text>
          <Text className="text-2xl font-bold text-yellow-400">+3h</Text>
        </View>
      </View>
    </Card>
  );
};

export default VarianceChart;
