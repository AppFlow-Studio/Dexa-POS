import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Briefcase } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const MetricCard = ({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "success" | "default";
}) => (
  <View className="flex-1 bg-[#212121] p-4 rounded-xl border border-gray-700">
    <Text className="text-sm text-gray-400 mb-1">{label}</Text>
    <Text
      className={`text-3xl font-bold ${variant === "success" ? "text-green-400" : "text-white"}`}
    >
      {value}
    </Text>
  </View>
);

const openShifts = [
  {
    id: "open-1",
    date: "Jan 16",
    role: "Server",
    time: "11:00-19:00",
    location: "Main Floor",
    match: 95,
  },
  {
    id: "open-2",
    date: "Jan 18",
    role: "Server",
    time: "09:00-17:00",
    location: "Patio",
    match: 90,
  },
];

const OpenShiftsDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);

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
      backgroundStyle={{ backgroundColor: "#212121" }}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-2xl font-bold text-white">Open Shifts</Text>
        <View className="flex-row gap-4">
          <MetricCard label="Available" value="3" />
          <MetricCard label="Best Match" value="95%" variant="success" />
          <MetricCard label="Total Hours" value="24h" />
        </View>
        <View className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex-row items-start gap-3">
          <Briefcase size={16} color="#60A5FA" className="mt-1" />
          <View>
            <Text className="text-sm font-semibold text-white mb-1">
              How Matching Works
            </Text>
            <Text className="text-sm text-gray-400">
              Shifts are matched based on your role, availability, and location
              history.
            </Text>
          </View>
        </View>
        <View className="gap-y-3">
          {openShifts.map((shift) => (
            <View
              key={shift.id}
              className="p-4 bg-[#303030] rounded-xl border border-gray-700"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View>
                  <Text className="text-lg font-semibold text-white mb-1">
                    {shift.role}
                  </Text>
                  <Text className="text-sm text-gray-400">{shift.date}</Text>
                </View>
                <Text className="text-2xl font-bold text-blue-400">
                  {shift.match}% match
                </Text>
              </View>
              <TouchableOpacity className="py-2 bg-blue-600 rounded-lg items-center">
                <Text className="font-bold text-white">Pick Up Shift</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <View className="p-4 bg-[#303030] rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Insights
          </Text>
          <Text className="text-sm text-gray-400">
            • 2 high-match shifts available in your preferred role
            {"\n"}• Picking up all shifts would add 24 hours this week
            {"\n"}• You'd still be 2 hours below overtime threshold
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default OpenShiftsDrawer;
