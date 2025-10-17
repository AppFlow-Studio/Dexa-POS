import { MOCK_SHIFTS } from "@/lib/mockData";
import { Shift } from "@/lib/types";
import { addDays, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AnalyticsCard from "./AnalyticsCard";
import DayScheduleCard from "./DayScheduleCard";
import ScheduleCalendarView from "./ScheduleCalendarView";
import { ShiftDetailModal } from "./ShiftDetailModal";

const MyScheduleScreen = () => {
  const [scheduleView, setScheduleView] = useState<"List" | "Calendar">("List");
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date("2025-10-15"), { weekStartsOn: 0 }) // Sunday start
  );
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const goToPreviousWeek = () =>
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goToNextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const goToCurrentWeek = () =>
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));

  const getShiftsForDate = (date: Date) => {
    return MOCK_SHIFTS.filter((shift) => isSameDay(parseISO(shift.date), date));
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShowShiftModal(true);
  };

  const analyticsData = [
    {
      icon: <Clock size={24} color="#9CA3AF" />,
      title: "Scheduled Hours",
      value: "28h",
      trend: "+2h",
      period: "vs last week",
      variant: "success" as "success",
      onPress: () => console.log("Open Scheduled Hours"),
    },
    {
      icon: <CheckCircle2 size={24} color="#9CA3AF" />,
      title: "On-Time Rate",
      value: "92%",
      period: "Last 30 days",
      onPress: () => console.log("Open On-Time Rate"),
    },
    {
      icon: <Coffee size={24} color="#9CA3AF" />,
      title: "Break Compliance",
      value: "7 On-time",
      trend: "1 Short",
      period: "Last 30 days",
      variant: "warning" as "warning",
      onPress: () => console.log("Open Break Compliance"),
    },
    {
      icon: <AlertTriangle size={24} color="#9CA3AF" />,
      title: "Rest Window",
      value: "Risk: 8h rest",
      period: "Before Thu opening",
      variant: "warning" as "warning",
      onPress: () => console.log("Open Rest Window"),
    },
    {
      icon: <AlertTriangle size={24} color="#9CA3AF" />,
      title: "OT Risk",
      value: "Possible",
      period: "By Fri",
      variant: "warning" as "warning",
      onPress: () => console.log("Open OT Risk"),
    },
    {
      icon: <Briefcase size={24} color="#9CA3AF" />,
      title: "Open Shift Matches",
      value: "3",
      period: "Claimable this week",
      onPress: () => console.log("Open Shift Matches"),
    },
  ];

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View className="space-y-4">
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-white">
              My Schedule - Dexa – 5th Ave
            </Text>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={goToPreviousWeek}
                className="p-2 bg-[#303030] rounded-md border border-gray-700"
              >
                <ChevronLeft size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <Text className="text-base font-medium text-gray-300">
                {format(weekDays[0], "MMM d")} - {format(weekDays[6], "MMM d")}
              </Text>
              <TouchableOpacity
                onPress={goToNextWeek}
                className="p-2 bg-[#303030] rounded-md border border-gray-700"
              >
                <ChevronRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={goToCurrentWeek}
                className="px-4 py-2 bg-blue-600 rounded-lg"
              >
                <Text className="text-base font-semibold text-white">
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity className="ml-2 p-2 bg-[#303030] rounded-full border border-gray-700">
                <Bell size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Analytics Grid */}
          <View>
            <Text className="text-lg font-bold text-white mb-3">
              My Week Analytics
            </Text>
            <View className="flex-row flex-wrap gap-4">
              {analyticsData.map((card, index) => (
                <View key={index} className="w-[32%]">
                  <AnalyticsCard {...card} />
                </View>
              ))}
            </View>
          </View>

          {/* Schedule View */}
          <View className="mt-4">
            <View className="flex-row p-1 bg-[#212121] rounded-lg border border-gray-600 self-start mb-3">
              <TouchableOpacity
                onPress={() => setScheduleView("List")}
                className={`px-3 py-1 rounded-md flex-row items-center gap-2 ${scheduleView === "List" ? "bg-blue-600" : ""}`}
              >
                <Text
                  className={`font-semibold ${scheduleView === "List" ? "text-white" : "text-gray-400"}`}
                >
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScheduleView("Calendar")}
                className={`px-3 py-1 rounded-md flex-row items-center gap-2 ${scheduleView === "Calendar" ? "bg-blue-600" : ""}`}
              >
                <CalendarIcon
                  size={16}
                  color={scheduleView === "Calendar" ? "white" : "#9CA3AF"}
                />
                <Text
                  className={`font-semibold ${scheduleView === "Calendar" ? "text-white" : "text-gray-400"}`}
                >
                  Calendar
                </Text>
              </TouchableOpacity>
            </View>

            {scheduleView === "List" ? (
              <FlatList
                data={weekDays}
                scrollEnabled={false}
                keyExtractor={(item) => item.toISOString()}
                renderItem={({ item }) => (
                  <DayScheduleCard
                    date={item}
                    shifts={getShiftsForDate(item)}
                    onShiftPress={handleShiftClick}
                  />
                )}
              />
            ) : (
              <ScheduleCalendarView
                weekDays={weekDays}
                getShiftsForDate={getShiftsForDate}
                onShiftPress={handleShiftClick}
              />
            )}
          </View>
        </View>
      </ScrollView>
      <ShiftDetailModal
        shift={selectedShift}
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
      />
    </>
  );
};

export default MyScheduleScreen;
