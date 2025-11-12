import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { format } from "date-fns";
import { router } from "expo-router";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import Popover from "react-native-popover-view";

const TABLE_HEADERS = [
  "Employee",
  "Role",
  "Clock In",
  "Break In",
  "Break Out",
  "Clock Out",
  "Duration",
];

const DailyShiftReportScreen = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const shiftHistory = useTimeclockStore((state) => state.shiftHistory);
  const employees = useEmployeeStore((state) => state.employees);

  const employeeMap = useMemo(() => {
    return new Map(employees.map((emp) => [emp.id, emp.fullName]));
  }, [employees]);

  const shiftsForSelectedDate = useMemo(() => {
    const formattedDate = selectedDate.toISOString().split("T")[0];
    return shiftHistory.filter((entry) => entry.date === formattedDate);
  }, [selectedDate, shiftHistory]);

  const onDateChange = (day: DateData) => {
    setSelectedDate(new Date(day.timestamp));
    setIsCalendarOpen(false);
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

  const renderShiftItem = ({
    item,
  }: {
    item: (typeof shiftsForSelectedDate)[0];
  }) => (
    <View className="flex-row p-3 border-b border-gray-700 last:border-b-0">
      <Text className="flex-1 text-sm text-white">
        {employeeMap.get(item.employeeId) || "Unknown"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.role !== "N/A" ? item.role : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {format(new Date(item.clockIn), "p")}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.breakInitiated !== "N/A"
          ? format(new Date(item.breakInitiated), "p")
          : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {item.breakEnded !== "N/A"
          ? format(new Date(item.breakEnded), "p")
          : "—"}
      </Text>
      <Text className="flex-1 text-sm text-white">
        {format(new Date(item.clockOut), "p")}
      </Text>
      <Text className="flex-1 text-sm text-white">{item.duration}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2">
            <ArrowLeft color="#9CA3AF" size={22} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-white">
              Daily Shift Report
            </Text>
            <Text className="text-sm text-gray-400">
              Review shift history by date
            </Text>
          </View>
        </View>
        <Popover
          isVisible={isCalendarOpen}
          onRequestClose={() => setIsCalendarOpen(false)}
          from={
            <TouchableOpacity
              onPress={() => setIsCalendarOpen(true)}
              className="flex-row items-center gap-2 bg-blue-600 px-4 py-2 rounded-lg"
            >
              <CalendarIcon color="white" size={16} />
              <Text className="text-white font-semibold">
                {format(selectedDate, "PPP")}
              </Text>
            </TouchableOpacity>
          }
        >
          <View className="w-96 bg-[#303030] border-gray-700 z-50 rounded-lg">
            <Calendar
              current={format(selectedDate, "yyyy-MM-dd")}
              onDayPress={onDateChange}
              theme={calendarTheme}
              markedDates={{
                [format(selectedDate, "yyyy-MM-dd")]: {
                  selected: true,
                  selectedColor: "#3b82f6",
                },
              }}
            />
          </View>
        </Popover>
      </View>

      <View className="flex-1 p-4">
        <View className="flex-1 bg-[#303030] rounded-xl border border-gray-600 overflow-hidden">
          <View className="flex-row p-3 bg-[#404040] border-b border-gray-600">
            {TABLE_HEADERS.map((header) => (
              <Text
                key={header}
                className="flex-1 font-semibold text-xs text-gray-300"
              >
                {header}
              </Text>
            ))}
          </View>
          <FlatList
            data={shiftsForSelectedDate}
            keyExtractor={(item) => item.id}
            renderItem={renderShiftItem}
            ListEmptyComponent={
              <View className="p-4 items-center">
                <Text className="text-gray-400">
                  No shift history found for this date.
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </View>
  );
};

export default DailyShiftReportScreen;
