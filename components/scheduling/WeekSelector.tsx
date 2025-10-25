import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface WeekSelectorProps {
  startDate: Date;
  onPrevious: () => void;
  onNext: () => void;
  minDate?: Date;
  maxDate?: Date;
}

const WeekSelector: React.FC<WeekSelectorProps> = ({ startDate, onPrevious, onNext, minDate, maxDate }) => {
  const weekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const isPreviousDisabled = minDate ? weekStart <= minDate : false;
  const isNextDisabled = maxDate ? weekEnd >= maxDate : false;

  return (
    <View className="flex-row items-center gap-2 bg-[#212121] border border-gray-600 rounded-lg p-1">
      <TouchableOpacity onPress={onPrevious} disabled={isPreviousDisabled} className={`p-2 rounded-md ${isPreviousDisabled ? 'opacity-50' : ''}`}>
        <ChevronLeft size={16} color="#FFFFFF" />
      </TouchableOpacity>
      <Text className="text-white font-semibold w-48 text-center">
        {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
      </Text>
      <TouchableOpacity onPress={onNext} disabled={isNextDisabled} className={`p-2 rounded-md ${isNextDisabled ? 'opacity-50' : ''}`}>
        <ChevronRight size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

export default WeekSelector;

