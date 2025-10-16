import { Shift } from "@/lib/types";
import { format, isSameDay } from "date-fns";
import React from "react";
import { Text, View } from "react-native";
import ShiftCard from "./ShiftCard";

interface DayColumnProps {
  date: Date;
  shifts: Shift[];
  onShiftPress: (shift: Shift) => void;
}

const DayColumn: React.FC<DayColumnProps> = ({
  date,
  shifts,
  onShiftPress,
}) => {
  const isToday = isSameDay(date, new Date());

  return (
    <View className="flex-1 gap-2">
      <View
        className={`text-center p-3 rounded-xl ${
          isToday ? "bg-blue-600" : "bg-[#303030]"
        }`}
      >
        <Text
          className={`text-xs font-medium text-center mb-1 ${
            isToday ? "text-blue-200" : "text-gray-400"
          }`}
        >
          {format(date, "EEE")}
        </Text>
        <Text
          className={`text-2xl font-bold text-center ${
            isToday ? "text-white" : "text-gray-200"
          }`}
        >
          {format(date, "d")}
        </Text>
      </View>
      <View className="flex-col gap-2 min-h-[200px]">
        {shifts.length > 0 ? (
          shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onPress={() => onShiftPress(shift)}
            />
          ))
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500 text-sm">No shifts</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default DayColumn;
