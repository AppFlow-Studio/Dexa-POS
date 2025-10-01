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
          <Text className="text-xl font-semibold text-gray-300">Date:</Text>
          <CalendarIcon color="#9CA3AF" size={20} />
          <Text className="text-xl font-semibold text-gray-300">
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
              selectedColor: "#60A5FA",
            },
          }}
          theme={{
            backgroundColor: "#212121",
            calendarBackground: "#212121",
            textSectionTitleColor: "#9CA3AF",
            selectedDayBackgroundColor: "#60A5FA",
            selectedDayTextColor: "#ffffff",
            todayTextColor: "#60A5FA",
            dayTextColor: "#FFFFFF",
            arrowColor: "#60A5FA",
            monthTextColor: "#FFFFFF",
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
