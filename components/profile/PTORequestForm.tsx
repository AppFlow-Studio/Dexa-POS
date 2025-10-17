import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { differenceInDays, format, isBefore } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";

interface PTORequestFormProps {
  onClose: () => void;
}

const PTORequestForm: React.FC<PTORequestFormProps> = ({ onClose }) => {
  const { addPTORequest } = useScheduleStore();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [note, setNote] = useState("");

  const [isCalendarVisible, setCalendarVisible] = useState(false);
  const [datePickerFor, setDatePickerFor] = useState<"start" | "end" | null>(
    null
  );

  const calculateHours = () => {
    if (!startDate || !endDate) return 0;
    try {
      const days = differenceInDays(endDate, startDate) + 1;
      return days > 0 ? days * 8 : 0;
    } catch {
      return 0;
    }
  };

  const handleSubmit = () => {
    if (!startDate || !endDate) {
      toast.error("Please select both a start and end date.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    if (isBefore(endDate, startDate)) {
      toast.error("End date cannot be before the start date.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    addPTORequest({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hours: calculateHours(),
      note,
      status: "pending",
    });
    onClose();
  };

  const openDatePicker = (type: "start" | "end") => {
    setDatePickerFor(type);
    setCalendarVisible(true);
  };

  const onDayPress = (day: DateData) => {
    const selectedDate = new Date(day.timestamp);
    if (datePickerFor === "start") {
      setStartDate(selectedDate);
      setDatePickerFor("end"); // Automatically move to select end date next
    } else if (datePickerFor === "end") {
      setEndDate(selectedDate);
      setCalendarVisible(false); // Close calendar after selecting end date
      setDatePickerFor(null);
    }
  };

  return (
    <View className="p-4 bg-[#303030] border border-gray-700 rounded-2xl mb-6">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-xl font-semibold text-white">
          New PTO Request
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text className="text-gray-400">Cancel</Text>
        </TouchableOpacity>
      </View>
      <View className="gap-y-4">
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-gray-300 mb-1">Start Date</Text>
            <TouchableOpacity
              onPress={() => openDatePicker("start")}
              className="p-3 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center"
            >
              <Text className="text-white">
                {startDate ? format(startDate, "yyyy-MM-dd") : "Select Date"}
              </Text>
              <CalendarIcon size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View className="flex-1">
            <Text className="text-gray-300 mb-1">End Date</Text>
            <TouchableOpacity
              onPress={() => openDatePicker("end")}
              className="p-3 h-14 justify-center bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center"
            >
              <Text className="text-white">
                {endDate ? format(endDate, "yyyy-MM-dd") : "Select Date"}
              </Text>
              <CalendarIcon size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {calculateHours() > 0 && (
          <View className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg flex-row justify-between items-center">
            <Text className="text-sm text-gray-400">Total Hours Requested</Text>
            <Text className="text-lg font-bold text-blue-400">
              {calculateHours()}h
            </Text>
          </View>
        )}
        <View>
          <Text className="text-gray-300 mb-1">Note (Optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add any additional details..."
            multiline
            placeholderTextColor="#6B7280"
            className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white min-h-[80px]"
          />
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          className="py-3 bg-blue-600 rounded-lg items-center"
        >
          <Text className="font-bold text-white">Submit Request</Text>
        </TouchableOpacity>
      </View>

      <Modal
        transparent={true}
        visible={isCalendarVisible}
        onRequestClose={() => setCalendarVisible(false)}
        animationType="fade"
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          className="bg-black/50 items-center justify-center"
          activeOpacity={1}
          onPressOut={() => setCalendarVisible(false)}
        >
          <View
            className="bg-[#303030] border border-gray-700 rounded-2xl p-4"
            onStartShouldSetResponder={() => true}
          >
            <Calendar
              onDayPress={onDayPress}
              theme={{
                calendarBackground: "#303030",
                monthTextColor: "#FFFFFF",
                dayTextColor: "#FFFFFF",
                textDisabledColor: "#6B7280",
                selectedDayBackgroundColor: "#3b82f6",
                selectedDayTextColor: "#FFFFFF",
                todayTextColor: "#60A5FA",
                arrowColor: "#3b82f6",
                textSectionTitleColor: "#9CA3AF",
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default PTORequestForm;
