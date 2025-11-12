import { PTORequest } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePtoStore } from "@/stores/usePtoStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import {
  differenceInHours,
  format,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
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
  const { schedulePeriods, weeklySchedules, checkPtoConflict, ptoRequests } =
    useScheduleStore();
  const { balances } = usePtoStore();

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const startDateRef = useRef<RNView>(null);
  const endDateRef = useRef<RNView>(null);

  const employeeShifts = useMemo(() => {
    if (!loggedInEmployee) return [];
    return [...schedulePeriods, ...weeklySchedules]
      .filter((p) => p.status === "active")
      .flatMap((s) => s.shifts)
      .filter((shift) => shift.employeeId === loggedInEmployee.id);
  }, [loggedInEmployee, schedulePeriods, weeklySchedules]);

  const hasScheduledShifts = employeeShifts.length > 0;

  const todayFormatted = useMemo(() => format(startOfDay(new Date()), "yyyy-MM-dd"), []);

  const maxDate = useMemo(() => {
    if (employeeShifts.length === 0) return undefined;
    const lastShift = employeeShifts.sort((a, b) =>
      isBefore(parseISO(a.date), parseISO(b.date)) ? 1 : -1
    )[0];
    return format(parseISO(lastShift.date), "yyyy-MM-dd");
  }, [employeeShifts]);

  const requestedHours = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const shiftsInDateRange = employeeShifts.filter((shift) =>
      isWithinInterval(parseISO(shift.date), {
        start: startDate,
        end: endDate,
      })
    );
    return shiftsInDateRange.reduce((total, shift) => {
      const duration = differenceInHours(
        parseISO(shift.endTime),
        parseISO(shift.startTime)
      );
      return total + duration;
    }, 0);
  }, [startDate, endDate, employeeShifts]);

  const spendableBalance = useMemo(() => {
    if (!loggedInEmployee) return 0;
    const balance = balances[loggedInEmployee.id] || {
      totalAccrued: 0,
      usedThisYear: 0,
    };
    const pendingApproval = ptoRequests
      .filter(
        (req) =>
          req.employeeId === loggedInEmployee.id && req.status === "pending"
      )
      .reduce((sum, req) => sum + req.hours, 0);
    return balance.totalAccrued - balance.usedThisYear - pendingApproval;
  }, [balances, ptoRequests, loggedInEmployee]);

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

    if (requestedHours > spendableBalance) {
      toast.error(
        `You cannot request ${requestedHours}h as it exceeds your available balance of ${spendableBalance.toFixed(
          2
        )}h.`,
        { position: ToastPosition.BOTTOM }
      );
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
      hours: requestedHours,
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
          {!hasScheduledShifts && (
            <View className="p-3 bg-red-600/10 border border-red-500/20 rounded-lg flex-row justify-between items-center">
              <Text className="text-sm text-red-400">
                You cannot submit a PTO request as you have no scheduled shifts.
              </Text>
            </View>
          )}
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-gray-300 mb-1">Start Date</Text>
              <TouchableOpacity
                ref={startDateRef}
                onPress={() => setIsStartDatePickerOpen(true)}
                className={`p-3 h-14 bg-[#212121] border rounded-lg flex-row justify-between items-center ${
                  !hasScheduledShifts
                    ? "border-gray-800 opacity-50"
                    : "border-gray-600"
                }`}
                disabled={!hasScheduledShifts}
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
                    maxDate={maxDate}
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
                className={`p-3 h-14 bg-[#212121] border rounded-lg flex-row justify-between items-center ${
                  !hasScheduledShifts
                    ? "border-gray-800 opacity-50"
                    : "border-gray-600"
                }`}
                disabled={!hasScheduledShifts}
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
                    maxDate={maxDate}
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

          {requestedHours > 0 && (
            <View className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg flex-row justify-between items-center">
              <Text className="text-sm text-gray-400">
                Total Hours Requested
              </Text>
              <Text className="lg font-bold text-blue-400">
                {requestedHours}h
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
            className={`py-3 bg-blue-600 rounded-lg items-center ${
              !hasScheduledShifts ? "opacity-50" : ""
            }`}
            disabled={!hasScheduledShifts}
          >
            <Text className="font-bold text-white">Submit Request</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default PTORequestForm;