import { colors } from "@/lib/theme";
import { addDays, format } from "date-fns";
import { Calendar } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ScheduleNotLiveProps {
  weekStartDate: Date;
  onViewLastWeek: () => void;
  onViewNextPublishedWeek: () => void;
}

const ScheduleNotLive: React.FC<ScheduleNotLiveProps> = ({
  weekStartDate,
  onViewLastWeek,
  onViewNextPublishedWeek,
}) => {
  const weekEndDate = addDays(weekStartDate, 6);
  const weekRange = `${format(weekStartDate, "MMM d")} - ${format(
    weekEndDate,
    "d"
  )}`;

  return (
    <View className="mt-4">
      <View className="p-5 bg-panel rounded-2xl border border-border flex-row items-center">
        {/* Icon */}
        <View className="p-3 rounded-xl" style={{ backgroundColor: colors.teal + '15' }}>
          <Calendar size={24} color={colors.teal} />
        </View>

        {/* Text Block */}
        <View className="flex-1 mx-5">
          <Text className="text-sm font-bold text-heading mb-1" numberOfLines={2}>
            Your schedule for {weekRange} isn't live yet.
          </Text>
          <Text className="text-xs text-label" numberOfLines={2}>
            Managers are finishing the puzzle. Check back after Wed 4:00 pm.
          </Text>
        </View>

        {/* Buttons */}
        <View className="flex-row gap-2">
          <TouchableOpacity
            className="py-2 px-4 rounded-lg"
            style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
          >
            <Text className="text-xs font-bold text-teal-400">Set Availability</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onViewLastWeek}
            className="py-2 px-4 rounded-lg border border-border"
          >
            <Text className="text-xs font-semibold text-label">Last Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onViewNextPublishedWeek}
            className="py-2 px-4 rounded-lg border border-border"
          >
            <Text className="text-xs font-semibold text-label">Next Published</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ScheduleNotLive;
