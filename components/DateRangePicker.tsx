import { Calendar as CalendarIcon, X } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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

// Helper to format a single date for the bottom display
const formatDisplayDate = (date: Date | undefined) => {
  if (!date) return "YYYY-MM-DD";
  return date.toISOString().split("T")[0];
};

// Helper to get the next month
const getNextMonth = (date: Date) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
};

const getMarkedDates = (range: DateRange, activeSelector: "from" | "to") => {
  const marked: { [key: string]: any } = {};
  if (!range.from) return marked;

  const fromString = range.from.toISOString().split("T")[0];
  marked[fromString] = {
    startingDay: true,
    color: "#3b82f6",
    textColor: "white",
  };

  if (range.to) {
    const toString = range.to.toISOString().split("T")[0];
    let currentDate = new Date(range.from);
    currentDate.setDate(currentDate.getDate() + 1);

    while (currentDate < range.to) {
      const dateString = currentDate.toISOString().split("T")[0];
      marked[dateString] = {
        color: "#3b82f6",
        textColor: "white",
        disabled: true,
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    marked[toString] = {
      endingDay: true,
      color: "#3b82f6",
      textColor: "white",
    };
  } else {
    // Highlight the start date even if no end date is selected
    marked[fromString].color = activeSelector === "to" ? "#3b82f6" : "#60a5fa";
  }
  return marked;
};

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  range,
  onRangeChange,
}) => {
  const [activeSelector, setActiveSelector] = useState<"from" | "to">("from");
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const handleDayPress = (day: DateData) => {
    const date = new Date(day.timestamp);

    if (activeSelector === "from" || (range.from && date < range.from)) {
      onRangeChange({ from: date, to: undefined });
      setActiveSelector("to");
    } else {
      onRangeChange({ from: range.from, to: date });
      setActiveSelector("from"); // Reset for next selection cycle
    }
  };

  const clearRange = (e: any) => {
    e.stopPropagation();
    onRangeChange({ from: undefined, to: undefined });
  };

  const calendarTheme = {
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
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TouchableOpacity className="flex-row items-center p-3 gap-2 bg-[#303030] border border-gray-600 rounded-lg">
          <CalendarIcon color="#9CA3AF" size={20} />
          <Text className="text-lg font-semibold text-gray-300">
            {range.from
              ? `${formatDisplayDate(range.from)} - ${formatDisplayDate(
                  range.to || range.from
                )}`
              : "Select Date Range"}
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
      <PopoverContent
        className="p-0 w-[700px] bg-[#303030] border border-gray-700 rounded-2xl"
        align="end"
      >
        <View className="flex-row p-4 gap-x-4 w-[700px] justify-between">
          <View className="flex-1">
            <Calendar
              current={currentMonth}
              onMonthChange={(month) =>
                setCurrentMonth(month.dateString.slice(0, 7))
              }
              onDayPress={handleDayPress}
              markingType="period"
              markedDates={getMarkedDates(range, activeSelector)}
              theme={{
                backgroundColor: "#303030",
                calendarBackground: "#303030",
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
          </View>
          <View className="flex-1">
            <Calendar
              current={getNextMonth(new Date(currentMonth))
                .toISOString()
                .slice(0, 7)}
              onMonthChange={(month) =>
                setCurrentMonth(
                  new Date(new Date(month.dateString).setMonth(month.month - 2))
                    .toISOString()
                    .slice(0, 7)
                )
              }
              onDayPress={handleDayPress}
              markingType="period"
              markedDates={getMarkedDates(range, activeSelector)}
              theme={{
                backgroundColor: "#303030",
                calendarBackground: "#303030",
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
          </View>
        </View>
        <View className="flex-row items-center justify-between p-4 border-t border-gray-700">
          <View className="flex-row gap-x-4 items-center">
            <TouchableOpacity
              onPress={() => setActiveSelector("from")}
              className={`p-3 rounded-lg border-2 ${
                activeSelector === "from"
                  ? "border-blue-500"
                  : "border-gray-600"
              }`}
            >
              <Text className="text-gray-400 text-sm mb-1">Start Date</Text>
              <Text className="text-white font-semibold text-base">
                {formatDisplayDate(range.from)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveSelector("to")}
              className={`p-3 rounded-lg border-2 ${
                activeSelector === "to" ? "border-blue-500" : "border-gray-600"
              }`}
            >
              <Text className="text-gray-400 text-sm mb-1">End Date</Text>
              <Text className="text-white font-semibold text-base">
                {formatDisplayDate(range.to)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
