import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@/components/ui/bottomSheet";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { bottomSheetTheme, colors } from "@/lib/theme";

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
    return {
      [selectedDate]: {
        selected: true,
        selectedColor: colors.info,
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
      {...bottomSheetTheme}
      handleIndicatorStyle={{ ...bottomSheetTheme.handleIndicatorStyle, width: 40 }}
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

        <View className="bg-panel rounded-2xl overflow-hidden p-2">
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
