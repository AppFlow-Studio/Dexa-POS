import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@/components/ui/bottomSheet";
import { CheckCircle2, Coffee } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, View } from "react-native";
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

const BreakComplianceDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const recentBreaks = [
    {
      date: "Jan 13",
      shift: "09:00-17:00",
      breakTaken: "30 min",
      required: "30 min",
    },
    {
      date: "Jan 14",
      shift: "11:00-19:00",
      breakTaken: "30 min",
      required: "30 min",
    },
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
        <Text className="text-2xl font-bold text-white">Break Compliance</Text>
        <View className="flex-row gap-4">
          <MetricCard label="Compliance Rate" value="100%" variant="success" />
          <MetricCard label="Last Period" value="95%" />
          <MetricCard label="Violations" value="0" variant="success" />
        </View>
        <View className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex-row items-start gap-3">
          <Coffee size={16} color={colors.info} className="mt-1" />
          <View>
            <Text className="text-sm font-semibold text-white mb-2">
              Break Policy
            </Text>
            <Text className="text-sm text-gray-400">
              • 30 minutes for shifts 6+ hours{"\n"}• Must be taken between
              hours 3-5 of shift{"\n"}• Additional 15 min for shifts 10+ hours
            </Text>
          </View>
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-4">
            Recent Breaks
          </Text>
          <View className="gap-y-3">
            {recentBreaks.map((item) => (
              <View
                key={item.date}
                className="flex-row items-center justify-between p-3 bg-panel rounded-lg"
              >
                <View className="flex-row items-center gap-3">
                  <CheckCircle2 size={16} color={colors.success} />
                  <View>
                    <Text className="text-sm font-medium text-white">
                      {item.date}
                    </Text>
                    <Text className="text-xs text-gray-400">{item.shift}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-medium text-green-400">
                    {item.breakTaken}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    Required: {item.required}
                  </Text>
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
            • Perfect compliance for the last 30 days
            {"\n"}• You're consistently taking breaks at the right time
            {"\n"}• Keep up the great work maintaining work-life balance
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default BreakComplianceDrawer;
