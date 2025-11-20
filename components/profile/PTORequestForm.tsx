import { useToast } from "@/contexts/ToastContext";
import { PTORequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePtoStore } from "@/stores/usePtoStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  addDays,
  differenceInDays,
  format,
  isBefore,
  startOfDay,
} from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  View as RNView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
  const { balances } = usePtoStore();
  const { show } = useToast();
  const { minimumPtoNoticeDays } = useStoreSettingsStore();

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hoursPerDay, setHoursPerDay] = useState("8"); // Default to 8
  const [note, setNote] = useState("");
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const startDateRef = useRef<RNView>(null);
  const endDateRef = useRef<RNView>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayFormatted = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const maxRequestDate = useMemo(
    () => addDays(today, minimumPtoNoticeDays),
    [today, minimumPtoNoticeDays]
  );
  const maxRequestDateFormatted = useMemo(
    () => format(maxRequestDate, "yyyy-MM-dd"),
    [maxRequestDate]
  );

  const totalAccruedBalance = useMemo(() => {
    if (!loggedInEmployee) return 0;
    return balances[loggedInEmployee.id]?.totalAccrued || 0;
  }, [balances, loggedInEmployee]);

  const handleSubmit = () => {
    if (!loggedInEmployee) {
      show({
        title: "Authentication Error",
        message: "Could not identify the logged-in employee.",
        type: "error",
      });
      return;
    }

    const parsedHoursPerDay = parseFloat(hoursPerDay);
    if (isNaN(parsedHoursPerDay) || parsedHoursPerDay <= 0) {
      show({
        title: "Invalid Hours",
        message: "Please enter a valid, positive number of hours per day.",
        type: "error",
      });
      return;
    }

    if (!startDate || !endDate) {
      show({
        title: "Missing Dates",
        message: "Please select both a start and an end date.",
        type: "error",
      });
      return;
    }

    if (isBefore(endDate, startDate)) {
      show({
        title: "Invalid End Date",
        message: "The end date cannot be earlier than the start date.",
        type: "error",
      });
      return;
    }

    const numberOfDays = differenceInDays(endDate, startDate) + 1;
    const totalRequestedHours = parsedHoursPerDay * numberOfDays;

    if (totalRequestedHours > totalAccruedBalance) {
      show({
        title: "Insufficient Balance",
        message: `Your request for ${totalRequestedHours.toFixed(
          2
        )}h exceeds your available balance of ${totalAccruedBalance.toFixed(
          2
        )}h.`,
        type: "error",
      });
      return;
    }

    const isConflict = checkPtoConflict(
      loggedInEmployee.id,
      startDate.toISOString(),
      endDate.toISOString()
    );

    if (isConflict) {
      show({
        title: "Scheduling Conflict",
        message: "This request overlaps with another PTO request.",
        type: "error",
      });
      return;
    }

    onAddRequest({
      employeeId: loggedInEmployee.id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hours: totalRequestedHours,
      note,
    });
    show({
      title: "Request Submitted",
      message: "Your PTO request has been submitted for approval.",
      type: "success",
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
                className="p-3 h-14 bg-[#212121] border rounded-lg flex-row justify-between items-center border-gray-600"
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
                    minDate={todayFormatted}
                    maxDate={maxRequestDateFormatted}
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
                className="p-3 h-14 bg-[#212121] border rounded-lg flex-row justify-between items-center border-gray-600"
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
                    minDate={todayFormatted}
                    maxDate={maxRequestDateFormatted}
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
          <View>
            <Text className="text-gray-300 mb-1">Hours per Day</Text>
            <TextInput
              value={hoursPerDay}
              onChangeText={(text) => {
                if (/^\d*\.?\d*$/.test(text)) {
                  setHoursPerDay(text);
                }
              }}
              placeholder="e.g., 8"
              keyboardType="numeric"
              placeholderTextColor="#6B7280"
              className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-white"
            />
          </View>
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
