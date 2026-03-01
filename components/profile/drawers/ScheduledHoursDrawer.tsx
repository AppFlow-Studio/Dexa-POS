import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo } from "react";
import { Text, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { bottomSheetTheme, colors } from "@/lib/theme";

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-1 bg-panel p-4 rounded-xl border border-gray-700">
    <Text className="text-sm text-gray-400 mb-1">{label}</Text>
    <Text className="text-3xl font-bold text-white">{value}</Text>
  </View>
);

const ScheduledHoursDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const weeklyData = [
    { value: 42, label: "Week 1" },
    { value: 40, label: "Week 2" },
    { value: 38, label: "Week 3" },
    { value: 38, label: "Week 4" },
  ];
  const roleBreakdown = [
    { role: "Server", hours: 24, percentage: 63 },
    { role: "Bartender", hours: 8, percentage: 21 },
    { role: "Host", hours: 6, percentage: 16 },
  ];

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-2xl font-bold text-white">Scheduled Hours</Text>
        <View className="flex-row gap-4">
          <MetricCard label="This Week" value="38h" />
          <MetricCard label="Last Week" value="42h" />
          <MetricCard label="4-Week Avg" value="39.5h" />
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-4">
            4-Week Trend
          </Text>
          <BarChart
            data={weeklyData}
            frontColor={colors.info}
            barWidth={50}
            yAxisTextStyle={{ color: "white" }}
            xAxisLabelTextStyle={{ color: "white" }}
          />
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-4">
            Hours by Role
          </Text>
          <View className="gap-y-3">
            {roleBreakdown.map((item) => (
              <View key={item.role}>
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-sm text-gray-300">{item.role}</Text>
                  <Text className="text-sm font-semibold text-white">
                    {item.hours}h
                  </Text>
                </View>
                <View className="h-2 bg-panel rounded-full">
                  <View
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Insights
          </Text>
          <Text className="text-sm text-gray-400">
            • Your hours decreased by 4h compared to last week.
            {"\n"}• You're averaging 39.5h per week over the last month.
            {"\n"}• Most of your shifts are in the Server role (63%).
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default ScheduledHoursDrawer;
