import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";

interface DatePickerBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet>;
  initialDate: string; // "yyyy-MM-dd"
  onDone: (date: string) => void;
  onClose: () => void;
  title: string;
}

const DatePickerBottomSheet: React.FC<DatePickerBottomSheetProps> = ({
  bottomSheetRef,
  initialDate,
  onDone,
  onClose,
  title,
}) => {
  const snapPoints = useMemo(() => ["65%"], []);
  const [selectedDate, setSelectedDate] = useState(initialDate);

  useEffect(() => {
    setSelectedDate(initialDate);
  }, [initialDate]);

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleDone = () => {
    onDone(selectedDate);
  };

  const calendarTheme = {
    calendarBackground: "#303030", // Match QuickScheduleModal theme
    monthTextColor: "#FFFFFF",
    dayTextColor: "#FFFFFF",
    textDisabledColor: "#6B7280",
    selectedDayBackgroundColor: "#3b82f6",
    selectedDayTextColor: "#FFFFFF",
    todayTextColor: "#60A5FA",
    arrowColor: "#3b82f6",
    textSectionTitleColor: "#9CA3AF",
  };

  const markedDates = useMemo(() => {
    return {
      [selectedDate]: {
        selected: true,
        selectedColor: "#3b82f6",
      },
    };
  }, [selectedDate]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#4B5563", width: 40 }}
      backgroundStyle={{ backgroundColor: "#1C1C1E" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.7}
        />
      )}
    >
      <BottomSheetView className="flex-1 p-5">
        <Text className="text-white text-lg font-semibold mb-6 text-center tracking-wide">
          {title}
        </Text>

        <View className="bg-[#303030] rounded-2xl overflow-hidden p-2">
          <Calendar
            current={selectedDate}
            onDayPress={onDayPress}
            theme={calendarTheme}
            markedDates={markedDates}
          />
        </View>

        <TouchableOpacity
          onPress={handleDone}
          className="w-full py-3.5 bg-blue-600 rounded-xl items-center shadow-lg shadow-blue-900/20 mt-6"
          activeOpacity={0.8}
        >
          <Text className="font-bold text-white text-lg tracking-wide">
            Done
          </Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default DatePickerBottomSheet;
