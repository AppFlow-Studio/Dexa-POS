import { Shift } from "@/lib/types";
import { format } from "date-fns";
import React from "react";
import { View } from "react-native";
import CalendarDayCard from "./CalendarDayCard";

interface ScheduleCalendarViewProps {
  weekDays: Date[];
  getShiftsForDate: (date: Date) => Shift[];
  onShiftPress: (shift: Shift) => void;
}

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  weekDays,
  getShiftsForDate,
  onShiftPress,
}) => {
  return (
    <View className="bg-surface p-4 rounded-xl border border-gray-700">
      <View className="flex-row gap-2">
        {weekDays.map((date) => (
          <CalendarDayCard
            key={date.toISOString()}
            date={date.getDate()}
            dayName={format(date, "EEE")}
            shifts={getShiftsForDate(date)}
            isToday={
              format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
            }
            onShiftPress={onShiftPress}
          />
        ))}
      </View>
    </View>
  );
};

export default ScheduleCalendarView;
