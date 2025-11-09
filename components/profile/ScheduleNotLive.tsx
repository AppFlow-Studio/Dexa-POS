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
      <View className="p-6 bg-[#212121] rounded-2xl border border-gray-700 flex-row items-center">
        {/* Icon */}
        <View className="p-4 bg-gray-800 rounded-full">
          <Calendar size={28} color="#9CA3AF" />
        </View>

        {/* Text Block */}
        <View className="flex-1 mx-6">
          <Text className="text-xl font-bold text-white mb-1" numberOfLines={2}>
            Your schedule for {weekRange} isn't live yet.
          </Text>
          <Text className="text-gray-400" numberOfLines={2}>
            Managers are finishing the puzzle. Check back after Wed 4:00 pm.
          </Text>
        </View>

        {/* Buttons */}
        <View className="flex-row gap-4">
          <TouchableOpacity className="py-3 px-5 bg-blue-600 rounded-lg">
            <Text className="text-white font-bold text-center text-base">
              Set Availability
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onViewLastWeek}
            className="py-3 px-5 border border-gray-600 rounded-lg"
          >
            <Text className="text-gray-300 font-bold text-center text-base">
              View Last Week
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onViewNextPublishedWeek}
            className="py-3 px-5 border border-gray-600 rounded-lg"
          >
            <Text className="text-gray-300 font-bold text-center text-base">
              View Next Published Week
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ScheduleNotLive;
