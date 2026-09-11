import { colors } from "@/lib/theme";
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

  if (range.to) {
    const toString = range.to.toISOString().split("T")[0];

    // Check if start and end date are the same - make full circle
    if (fromString === toString) {
      marked[fromString] = {
        startingDay: true,
        endingDay: true,
        color: colors.info,
        textColor: colors.onSolid,
      };
    } else {
      // Different dates - mark range
      marked[fromString] = {
        startingDay: true,
        color: colors.info,
        textColor: colors.onSolid,
      };

      let currentDate = new Date(range.from);
      currentDate.setDate(currentDate.getDate() + 1);

      while (currentDate < range.to) {
        const dateString = currentDate.toISOString().split("T")[0];
        marked[dateString] = {
          color: colors.info,
          textColor: colors.onSolid,
        };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      marked[toString] = {
        endingDay: true,
        color: colors.info,
        textColor: colors.onSolid,
      };
    }
  } else {
    // Only start date selected - full circle on start
    marked[fromString] = {
      startingDay: true,
      endingDay: true,
      color: colors.info,
      textColor: colors.onSolid,
    };
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
    backgroundColor: colors.panel,
    calendarBackground: colors.panel,
    textSectionTitleColor: colors.label,
    selectedDayBackgroundColor: colors.info,
    selectedDayTextColor: colors.onSolid,
    todayTextColor: colors.info,
    dayTextColor: colors.heading,
    arrowColor: colors.info,
    monthTextColor: colors.heading,
    textMonthFontWeight: "bold",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TouchableOpacity
          className="flex-row items-center p-3 gap-2 bg-surface border rounded-lg"
          style={{ borderColor: colors.border }}
        >
          <CalendarIcon color={colors.label} size={20} />
          <Text
            className="text-lg font-semibold"
            style={{ color: colors.heading }}
          >
            {range.from
              ? `${formatDisplayDate(range.from)} - ${formatDisplayDate(
                  range.to || range.from
                )}`
              : "Select Date Range"}
          </Text>
          {range.from && (
            <TouchableOpacity
              onPress={clearRange}
              className="ml-2 p-1 rounded-full"
              style={{ backgroundColor: colors.card }}
            >
              <X size={14} color={colors.heading} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[700px] bg-surface border rounded-2xl"
        style={{ borderColor: colors.border }}
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
                backgroundColor: colors.card,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.label,
                selectedDayBackgroundColor: colors.info,
                selectedDayTextColor: colors.onSolid,
                todayTextColor: colors.info,
                dayTextColor: colors.heading,
                arrowColor: colors.info,
                monthTextColor: colors.heading,
                textMonthFontWeight: "bold",
              }}
            />
          </View>
          {/* <View className="flex-1">
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
                backgroundColor: colors.card,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.label,
                selectedDayBackgroundColor: colors.info,
                selectedDayTextColor: colors.onSolid,
                todayTextColor: colors.info,
                dayTextColor: colors.heading,
                arrowColor: colors.info,
                monthTextColor: colors.heading,
                textMonthFontWeight: "bold",
              }}
            />
          </View> */}
        </View>
        <View
          className="flex-row items-center justify-between p-4 border-t"
          style={{ borderTopColor: colors.border }}
        >
          <View className="flex-row gap-x-4 items-center">
            <TouchableOpacity
              onPress={() => setActiveSelector("from")}
              className="p-3 rounded-lg border-2"
              style={{
                borderColor:
                  activeSelector === "from" ? colors.info : colors.border,
              }}
            >
              <Text className="text-sm mb-1" style={{ color: colors.label }}>
                Start Date
              </Text>
              <Text
                className="font-semibold text-base"
                style={{ color: colors.heading }}
              >
                {formatDisplayDate(range.from)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveSelector("to")}
              className="p-3 rounded-lg border-2"
              style={{
                borderColor:
                  activeSelector === "to" ? colors.info : colors.border,
              }}
            >
              <Text className="text-sm mb-1" style={{ color: colors.label }}>
                End Date
              </Text>
              <Text
                className="font-semibold text-base"
                style={{ color: colors.heading }}
              >
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
