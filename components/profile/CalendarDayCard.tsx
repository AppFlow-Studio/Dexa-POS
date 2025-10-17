// File: /components/profile/CalendarDayCard.tsx
import { Shift } from "@/lib/types";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface CalendarDayCardProps {
  date: number;
  dayName: string;
  shifts: Shift[];
  isToday: boolean;
  onShiftPress: (shift: Shift) => void;
}

const CalendarDayCard: React.FC<CalendarDayCardProps> = ({
  date,
  dayName,
  shifts,
  isToday,
  onShiftPress,
}) => {
  return (
    <View className="flex-1">
      <Text className="text-center text-sm font-semibold text-gray-400 mb-2">
        {dayName}
      </Text>
      <View
        className={`p-2 border rounded-lg h-32 ${isToday ? "border-blue-500" : "border-gray-700"}`}
      >
        <Text
          className={`text-right font-semibold ${isToday ? "text-blue-400" : "text-gray-300"}`}
        >
          {date}
        </Text>
        <View className="mt-1 space-y-1">
          {shifts.map((shift) => (
            <TouchableOpacity
              key={shift.id}
              onPress={() => onShiftPress(shift)}
              className="p-1 bg-[#212121] rounded"
            >
              <Text className="text-xs text-white font-semibold">
                {shift.role}
              </Text>
              <Text className="text-[10px] text-gray-400">
                {shift.startTime} - {shift.endTime}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

export default CalendarDayCard;
