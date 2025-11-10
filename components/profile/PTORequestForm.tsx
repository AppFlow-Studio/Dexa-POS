import { PTORequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { differenceInDays, format, isBefore, startOfDay } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  View as RNView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import Popover from "react-native-popover-view";

interface PTORequestFormProps {
  onClose: () => void;
  onAddRequest: (
    request: Omit<PTORequest, "id" | "submittedAt" | "status">
  ) => void;
}

const PTORequestForm: React.FC<PTORequestFormProps> = ({
  onClose,
  onAddRequest,
}) => {
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const { checkPtoConflict } = useScheduleStore();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const startDateRef = useRef<RNView>(null);
  const endDateRef = useRef<RNView>(null);

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
    if (!loggedInEmployee) {
      toast.error("Employee not logged in.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    if (!startDate || !endDate) {
      toast.error("Please select both a start and end date.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const today = startOfDay(new Date());
    if (isBefore(startDate, today)) {
      toast.error("Start date cannot be in the past.", {
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

    const isConflict = checkPtoConflict(
      loggedInEmployee.id,
      startDate.toISOString(),
      endDate.toISOString()
    );

    if (isConflict) {
      toast.error("This PTO request overlaps with an existing request.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    onAddRequest({
      employeeId: loggedInEmployee.id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hours: calculateHours(),
      note,
    });
    onClose();
  };

  const onDayPress = (day: DateData, type: "start" | "end") => {
    const selectedDate = new Date(day.timestamp);
    if (type === "start") {
      setStartDate(selectedDate);
      setIsStartDatePickerOpen(false);
    } else {
      setEndDate(selectedDate);
      setIsEndDatePickerOpen(false);
    }
  };

  const calendarTheme = {
    calendarBackground: "#303030",
    monthTextColor: "#FFFFFF",
    dayTextColor: "#FFFFFF",
    textDisabledColor: "#6B7280",
    selectedDayBackgroundColor: "#3b82f6",
    selectedDayTextColor: "#FFFFFF",
    todayTextColor: "#60A5FA",
    arrowColor: "#3b82f6",
    textSectionTitleColor: "#9CA3AF",
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
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
                ref={startDateRef}
                onPress={() => setIsStartDatePickerOpen(true)}
                className="p-3 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center"
              >
                <Text className="text-white">
                  {startDate ? format(startDate, "yyyy-MM-dd") : "Select Date"}
                </Text>
                <CalendarIcon size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <Popover
                from={startDateRef as unknown as React.RefObject<RNView>}
                isVisible={isStartDatePickerOpen}
                onRequestClose={() => setIsStartDatePickerOpen(false)}
              >
                <View className="w-96 bg-[#303030] border-gray-700 z-50 rounded-lg">
                  <Calendar
                    onDayPress={(day) => onDayPress(day, "start")}
                    theme={calendarTheme}
                    markedDates={{
                      [startDate ? format(startDate, "yyyy-MM-dd") : ""]: {
                        selected: true,
                        selectedColor: "#3b82f6",
                      },
                    }}
                  />
                </View>
              </Popover>
            </View>

            <View className="flex-1">
              <Text className="text-gray-300 mb-1">End Date</Text>
              <TouchableOpacity
                ref={endDateRef}
                onPress={() => setIsEndDatePickerOpen(true)}
                className="p-3 h-14 bg-[#212121] border border-gray-600 rounded-lg flex-row justify-between items-center"
              >
                <Text className="text-white">
                  {endDate ? format(endDate, "yyyy-MM-dd") : "Select Date"}
                </Text>
                <CalendarIcon size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <Popover
                from={endDateRef as unknown as React.RefObject<RNView>}
                isVisible={isEndDatePickerOpen}
                onRequestClose={() => setIsEndDatePickerOpen(false)}
              >
                <View className="w-96 bg-[#303030] border-gray-700 z-50 rounded-lg">
                  <Calendar
                    onDayPress={(day) => onDayPress(day, "end")}
                    theme={calendarTheme}
                    markedDates={{
                      [endDate ? format(endDate, "yyyy-MM-dd") : ""]: {
                        selected: true,
                        selectedColor: "#3b82f6",
                      },
                    }}
                  />
                </View>
              </Popover>
            </View>
          </View>

          {calculateHours() > 0 && (
            <View className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg flex-row justify-between items-center">
              <Text className="text-sm text-gray-400">
                Total Hours Requested
              </Text>
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
      </View>
    </KeyboardAvoidingView>
  );
};

export default PTORequestForm;
