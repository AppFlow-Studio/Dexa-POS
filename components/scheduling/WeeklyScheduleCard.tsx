import { colors } from "@/lib/theme";
import { WeeklySchedule } from "@/lib/types";
import { Calendar, Pencil, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface WeeklyScheduleCardProps {
  schedule: WeeklySchedule;
  onEdit: () => void;
  onDelete: () => void; // Added delete prop
  onPressSchedule: () => void;
}

const statusStyles = {
  draft: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
  "draft-edit": "bg-yellow-500/10 border-yellow-500/20 text-yellow-500", // Added draft-edit
  active: "bg-green-500/10 border-green-500/20 text-green-500",
  completed: "bg-gray-500/10 border-gray-500/20 text-gray-400",
};

const WeeklyScheduleCard: React.FC<WeeklyScheduleCardProps> = ({
  schedule,
  onEdit,
  onDelete,
  onPressSchedule,
}) => {
  // Default to draft styles if status is unknown
  const currentStatusStyle =
    statusStyles[schedule.status] || statusStyles.draft;

  return (
    <View className="bg-panel border border-border rounded-2xl p-5 mb-4 shadow-sm w-full">
      {/* --- Header Section --- */}
      <View className="flex-row justify-between items-start">
        <View className="flex-row gap-4 flex-1 mr-2">
          {/* Icon Box */}
          <View className="w-12 h-12 bg-screen border border-border rounded-xl items-center justify-center">
            <Calendar size={24} color={colors.info} />
          </View>

          {/* Text Content */}
          <View className="flex-1 justify-center">
            <Text
              className="text-white font-bold text-lg leading-tight"
              numberOfLines={1}
            >
              {schedule.name}
            </Text>
            <Text className="text-gray-400 text-sm mt-1">
              {schedule.startDate} - {schedule.endDate}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View
          className={`px-3 py-1 rounded-full border ${currentStatusStyle
            .split(" ")
            .slice(0, 2)
            .join(" ")}`}
        >
          <Text
            className={`text-xs font-bold capitalize ${
              currentStatusStyle.split(" ")[2]
            }`}
          >
            {schedule.status}
          </Text>
        </View>
      </View>

      {/* --- Actions Section --- */}
      <View className="flex-row items-center justify-between mt-5">
        <View className="flex-row ">
          {/* Edit Button */}
          <TouchableOpacity
            onPress={onEdit}
            className="w-11 h-11 border border-border rounded-xl bg-card items-center justify-center mr-3 active:bg-surface"
          >
            <Pencil size={20} color={colors.heading} />
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity
            onPress={onDelete}
            className="w-11 h-11 border border-red-900/30 rounded-xl bg-red-500/10 items-center justify-center mr-3 active:bg-red-500/20"
          >
            <Trash2 size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
        {/* Main Action Button */}
        <TouchableOpacity
          onPress={onPressSchedule}
          className="px-4 py-2 bg-blue-600 rounded-lg"
        >
          <Text className="text-white font-bold text-base">View Schedule</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default WeeklyScheduleCard;
