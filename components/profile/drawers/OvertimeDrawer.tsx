import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { AlertTriangle } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, View } from "react-native";
import { BarChart } from "@/components/charts/LazyGiftedCharts";
import { bottomSheetTheme, colors } from "@/lib/theme";

const MetricCard = ({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "success" | "default";
}) => (
  <View className="flex-1 bg-panel p-4 rounded-xl border border-gray-700">
    <Text className="text-sm text-gray-400 mb-1">{label}</Text>
    <Text
      className={`text-3xl font-bold ${variant === "success" ? "text-green-400" : "text-white"}`}
    >
      {value}
    </Text>
  </View>
);

const OvertimeDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const weeklyProjection = [
    { value: 38, label: "This Week" },
    { value: 42, label: "Next Week" },
    { value: 40, label: "Week +2" },
    { value: 38, label: "Week +3" },
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
        <Text className="text-2xl font-bold text-white">Overtime Risk</Text>
        <View className="flex-row gap-4">
          <MetricCard label="Hours to Limit" value="12h" variant="success" />
          <MetricCard label="This Week" value="38h" />
          <MetricCard label="Weekly Limit" value="50h" />
        </View>
        <View className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex-row items-start gap-3">
          <AlertTriangle size={16} color={colors.success} className="mt-1" />
          <View>
            <Text className="text-sm font-semibold text-green-400 mb-1">
              Safe Zone
            </Text>
            <Text className="text-sm text-gray-400">
              You're well below the overtime threshold. You have 12 hours of
              buffer.
            </Text>
          </View>
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-4">
            4-Week Projection
          </Text>
          <BarChart
            data={weeklyProjection}
            frontColor={colors.info}
            barWidth={50}
            yAxisTextStyle={{ color: "white" }}
            xAxisLabelTextStyle={{ color: "white" }}
          />
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Overtime Policy
          </Text>
          <Text className="text-sm text-gray-400">
            • Weekly limit: 50 hours
            {"\n"}• Overtime pay applies after 40 hours
            {"\n"}• Manager approval required for 45+ hours
            {"\n"}• System alerts at 40h and 45h thresholds
          </Text>
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Insights
          </Text>
          <Text className="text-sm text-gray-400">
            • You're averaging 39.5 hours per week
            {"\n"}• No overtime risk in the next 4 weeks
            {"\n"}• Consistent scheduling keeps you in safe zone
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default OvertimeDrawer;
