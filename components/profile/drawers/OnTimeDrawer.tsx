import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@/components/ui/bottomSheet";
import { CheckCircle2, Clock, XCircle } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

const MetricCard = ({
  label,
  value,
  variant,
  icon,
}: {
  label: string;
  value: string;
  variant: "success" | "danger" | "default";
  icon: React.ReactNode;
}) => {
  const textClass =
    variant === "success"
      ? "text-green-400"
      : variant === "danger"
        ? "text-red-400"
        : "text-white";
  return (
    <View className="flex-1 bg-panel p-4 rounded-xl border border-gray-700">
      <View className="flex-row items-center gap-2 mb-1">
        {icon}
        <Text className="text-sm text-gray-400">{label}</Text>
      </View>
      <Text className={`text-2xl font-bold ${textClass}`}>{value}</Text>
    </View>
  );
};

const OnTimeDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const recentShifts = [
    {
      date: "Jan 13 - Server",
      scheduled: "09:00",
      actual: "09:02",
      delta: "+2 min",
      status: "on-time",
    },
    {
      date: "Jan 14 - Server",
      scheduled: "11:00",
      actual: "11:00",
      delta: "0 min",
      status: "on-time",
    },
    {
      date: "Jan 10 - Bartender",
      scheduled: "14:00",
      actual: "14:08",
      delta: "+8 min",
      status: "late",
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
        <Text className="text-2xl font-bold text-white">
          On-Time Performance
        </Text>
        <View className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Current Rate"
            value="94%"
            variant="success"
            icon={<></>}
          />
          <MetricCard
            label="Last Period"
            value="89%"
            variant="default"
            icon={<></>}
          />
          <MetricCard
            label="Target"
            value="95%"
            variant="default"
            icon={<></>}
          />
        </View>
        <View className="flex-row gap-4">
          <MetricCard
            label="On Time"
            value="47 shifts"
            variant="success"
            icon={<CheckCircle2 size={16} color={colors.success} />}
          />
          <MetricCard
            label="Late"
            value="3 shifts"
            variant="danger"
            icon={<XCircle size={16} color={colors.danger} />}
          />
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-4">
            Recent Clock-Ins
          </Text>
          <View className="gap-y-3">
            {recentShifts.map((shift) => (
              <View
                key={shift.date}
                className="flex-row items-center justify-between p-3 bg-panel rounded-lg"
              >
                <View className="flex-row items-center gap-3">
                  {shift.status === "on-time" ? (
                    <CheckCircle2 size={16} color={colors.success} />
                  ) : (
                    <Clock size={16} color={colors.danger} />
                  )}
                  <View>
                    <Text className="text-sm font-medium text-white">
                      {shift.date}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      Scheduled: {shift.scheduled} | Actual: {shift.actual}
                    </Text>
                  </View>
                </View>
                <Text
                  className={`text-sm font-medium ${shift.status === "on-time" ? "text-green-400" : "text-red-400"}`}
                >
                  {shift.delta}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Insights
          </Text>
          <Text className="text-sm text-gray-400">
            • You're 5% above your previous period performance
            {"\n"}• Only 1% away from the 95% target rate
            {"\n"}• Most late arrivals occur on afternoon shifts
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default OnTimeDrawer;
