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
        <TouchableOpacity className="flex-row items-center p-3 gap-2">
          <Text className="font-semibold text-gray-600">Date:</Text>
          <CalendarIcon color="#6b7280" size={20} />
          <Text className="font-semibold text-gray-600">
            {date.toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "2-digit",
            })}
          </Text>
        </TouchableOpacity>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Calendar
          onDayPress={handleDayPress}
          markedDates={{
            [date.toISOString().split("T")[0]]: {
              selected: true,
              selectedColor: "#ef4444",
            },
          }}
          theme={{
            backgroundColor: "#ffffff",
            calendarBackground: "#ffffff",
            textSectionTitleColor: "#6b7280",
            selectedDayBackgroundColor: "#ef4444",
            selectedDayTextColor: "#ffffff",
            todayTextColor: "#ef4444",
            dayTextColor: "#1f2937",
            arrowColor: "#3b82f6",
            monthTextColor: "#1f2937",
            textMonthFontWeight: "bold",
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
