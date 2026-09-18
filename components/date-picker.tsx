import { colors } from "@/lib/theme";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

const DatePicker: React.FC<DatePickerProps> = ({ date, onDateChange }) => {
  const handleDayPress = (day: DateData) => {
    onDateChange(new Date(day.timestamp));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TouchableOpacity className="flex-row items-center p-3 gap-2 mr-20">
          <Text
            className="text-xl font-semibold"
            style={{ color: colors.label }}
          >
            Date:
          </Text>
          <CalendarIcon color={colors.label} size={20} />
          <Text
            className="text-xl font-semibold"
            style={{ color: colors.heading }}
          >
            {date.toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "2-digit",
            })}
          </Text>
        </TouchableOpacity>
      </PopoverTrigger>
      <PopoverContent className="p-0 left-8 w-96">
        <Calendar
          onDayPress={handleDayPress}
          markedDates={{
            [date.toISOString().split("T")[0]]: {
              selected: true,
              selectedColor: colors.info,
            },
          }}
          theme={{
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
            textDayFontSize: 16,
            textMonthFontSize: 20,
            textDayHeaderFontSize: 14,
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
