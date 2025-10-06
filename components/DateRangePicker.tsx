import { Calendar as CalendarIcon, X } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangePickerProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

const formatDateRange = (range: DateRange): string => {
  const fromStr = range.from?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const toStr = range.to?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (range.from && !range.to) {
    return fromStr!;
  }
  if (fromStr && toStr) {
    if (fromStr === toStr.split(",")[0]) return toStr; // Show full date if only one day is selected
    return `${fromStr} - ${toStr}`;
  }
  return "Select a date range";
};

// --- THIS FUNCTION IS NOW FIXED ---
const getMarkedDates = (range: DateRange) => {
  const marked: { [key: string]: any } = {};
  if (!range.from) {
    return marked;
  }

  // CRITICAL FIX: Create a NEW Date object for the loop to avoid mutating state.
  const loopDate = new Date(range.from);
  const endDate = range.to ? new Date(range.to) : new Date(range.from);

  // Set times to 0 to ensure accurate date-only comparison
  loopDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(0, 0, 0, 0);

  const fromString = range.from.toISOString().split("T")[0];
  const toString = range.to ? range.to.toISOString().split("T")[0] : fromString;

  while (loopDate <= endDate) {
    const dateString = loopDate.toISOString().split("T")[0];
    marked[dateString] = {
      color: "#3b82f6",
      textColor: "white",
      startingDay: dateString === fromString,
      endingDay: dateString === toString,
    };
    // Increment the date for the next iteration
    loopDate.setDate(loopDate.getDate() + 1);
  }
  return marked;
};

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  range,
  onRangeChange,
}) => {
  const handleDayPress = (day: DateData) => {
    const date = new Date(day.timestamp);

    if (!range.from || (range.from && range.to)) {
      onRangeChange({ from: date, to: undefined });
    } else if (date < range.from) {
      onRangeChange({ from: date, to: undefined });
    } else {
      onRangeChange({ from: range.from, to: date });
    }
  };

  const clearRange = (e: any) => {
    e.stopPropagation(); // Prevent the popover from opening when clearing
    onRangeChange({ from: undefined, to: undefined });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TouchableOpacity className="flex-row items-center p-3 gap-2 bg-[#303030] border border-gray-600 rounded-lg">
          <CalendarIcon color="#9CA3AF" size={20} />
          <Text className="text-lg font-semibold text-gray-300">
            {formatDateRange(range)}
          </Text>
          {range.from && (
            <TouchableOpacity
              onPress={clearRange}
              className="ml-2 p-1 bg-gray-700 rounded-full"
            >
              <X size={14} color="#E5E7EB" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[350px]" align="end">
        <Calendar
          onDayPress={handleDayPress}
          markingType="period"
          markedDates={getMarkedDates(range)}
          theme={{
            backgroundColor: "#212121",
            calendarBackground: "#212121",
            textSectionTitleColor: "#9CA3AF",
            selectedDayBackgroundColor: "#3b82f6",
            selectedDayTextColor: "#ffffff",
            todayTextColor: "#60A5FA",
            dayTextColor: "#FFFFFF",
            arrowColor: "#60A5FA",
            monthTextColor: "#FFFFFF",
            textMonthFontWeight: "bold",
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
