import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";

interface QuickScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (startDate: string) => void;
}

const QuickScheduleModal: React.FC<QuickScheduleModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const calendarTheme = {
    calendarBackground: colors.panel,
    monthTextColor: colors.heading,
    dayTextColor: colors.heading,
    textDisabledColor: colors.muted,
    selectedDayBackgroundColor: colors.info,
    selectedDayTextColor: colors.heading,
    todayTextColor: colors.info,
    arrowColor: colors.info,
    textSectionTitleColor: colors.label,
  };

  const markedDates = useMemo(() => {
    const date = parseISO(selectedDate);
    const periodStart = date;
    const periodEnd = addDays(date, 6); // 7-day period starting from selectedDate
    const interval = eachDayOfInterval({ start: periodStart, end: periodEnd });

    const dates = interval.reduce(
      (acc, day, index) => {
        const dateString = format(day, "yyyy-MM-dd");
        acc[dateString] = {
          textColor: "white",
          startingDay: index === 0,
          endingDay: index === interval.length - 1,
          color: "#2563eb", // Opaque blue for the period background
        };
        return acc;
      },
      {} as { [key: string]: any }
    );

    // Add the solid blue circle for the specifically selected start date
    if (dates[selectedDate]) {
      dates[selectedDate].selected = true;
      dates[selectedDate].selectedColor = colors.info;
    }

    return dates;
  }, [selectedDate]);

  const handleCreate = () => {
    // Pass the selectedDate directly, as it's now the start of the 7-day period
    onCreate(selectedDate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[550px] max-w-lg bg-panel rounded-2xl border-border p-0">
        <DialogHeader className="p-6 border-b border-gray-700">
          <DialogTitle className="text-white text-xl font-bold">
            Create Schedule for Week
          </DialogTitle>
        </DialogHeader>
        <View className="p-6">
          <Calendar
            current={selectedDate}
            onDayPress={onDayPress}
            theme={calendarTheme}
            markingType={"period"}
            markedDates={markedDates}
          />
          <TouchableOpacity
            onPress={handleCreate}
            className="flex-row items-center justify-center gap-2 px-4 py-3 bg-blue-600 rounded-xl mt-6"
          >
            <Plus size={18} color={colors.heading} />
            <Text className="text-white font-bold">Create & View Week</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default QuickScheduleModal;
