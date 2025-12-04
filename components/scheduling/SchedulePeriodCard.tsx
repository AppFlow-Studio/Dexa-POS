import { Calendar, Pencil, Trash2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { PeriodData } from "./PeriodWizard";

interface SchedulePeriodCardProps {
  period: PeriodData;
  onEdit: () => void;
  onDelete: () => void;
  onPressSchedule: () => void;
}

const statusStyles = {
  draft: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
  active: "bg-green-500/10 border-green-500/20 text-green-500",
  completed: "bg-gray-500/10 border-gray-500/20 text-gray-400",
};

const SchedulePeriodCard: React.FC<SchedulePeriodCardProps> = ({
  period,
  onEdit,
  onDelete,
  onPressSchedule,
}) => {
  // Default to draft styles if status is unknown
  const currentStatusStyle = statusStyles[period.status] || statusStyles.draft;

  return (
    <View className="bg-[#303030] border border-gray-700 rounded-2xl p-5 mb-4 shadow-sm w-full">
      {/* --- Header Section --- */}
      <View className="flex-row justify-between items-start">
        <View className="flex-row gap-4 flex-1 mr-2">
          {/* Icon Box */}
          <View className="w-12 h-12 bg-[#252525] border border-gray-700 rounded-xl items-center justify-center">
            <Calendar size={24} color="#60A5FA" />
          </View>

          {/* Text Content */}
          <View className="flex-1 justify-center">
            <Text
              className="text-white font-bold text-lg leading-tight"
              numberOfLines={1}
            >
              {period.name}
            </Text>
            <Text className="text-gray-400 text-sm mt-1">
              {period.startDate} - {period.endDate}
            </Text>
          </View>
        </View>

        {/* Status Badge */}
        <View
          className={`px-3 py-1 rounded-full border ${currentStatusStyle.split(" ").slice(0, 2).join(" ")}`}
        >
          <Text
            className={`text-xs font-bold capitalize ${currentStatusStyle.split(" ")[2]}`}
          >
            {period.status}
          </Text>
        </View>
      </View>

      {/* --- Divider (Optional, using margin instead) --- */}

      {/* --- Actions Section --- */}
      <View className="flex-row items-center mt-5">
        {/* Edit Button */}
        <TouchableOpacity
          onPress={onEdit}
          className="w-11 h-11 border border-gray-600 rounded-xl bg-[#383838] items-center justify-center mr-3 active:bg-[#404040]"
        >
          <Pencil size={20} color="#E5E7EB" />
        </TouchableOpacity>

        {/* Delete Button */}
        <TouchableOpacity
          onPress={onDelete}
          className="w-11 h-11 border border-red-900/30 rounded-xl bg-red-500/10 items-center justify-center mr-3 active:bg-red-500/20"
        >
          <Trash2 size={20} color="#EF4444" />
        </TouchableOpacity>

        {/* Main Action Button - Expands to fill space */}
        <TouchableOpacity
          onPress={onPressSchedule}
          className="flex-1 h-11 bg-blue-600 rounded-xl items-center justify-center active:bg-blue-700"
        >
          <Text className="text-white font-bold text-base">
            {period.isScheduled ? "View Schedule" : "Create Schedule"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SchedulePeriodCard;
