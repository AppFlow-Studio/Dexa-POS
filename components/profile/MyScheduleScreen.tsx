import { useToast } from "@/contexts/ToastContext";
import { Shift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import {
  addDays,
  format,
  isAfter,
  isSameDay,
  isSameWeek,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  AlertTriangle,
  Briefcase,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import NotificationBell from "../notifications/NotificationBell";
import SwapProposalWizard from "../scheduling/SwapProposalWizard";
import AnalyticsCard from "./AnalyticsCard";
import DayScheduleCard from "./DayScheduleCard";
import DropShiftBottomSheet from "./DropShiftBottomSheet";
import ScheduleCalendarView from "./ScheduleCalendarView";
import ScheduleNotLive from "./ScheduleNotLive";
import { ShiftDetailModal } from "./ShiftDetailModal";
import BreakComplianceDrawer from "./drawers/BreakComplianceDrawer";
import OnTimeDrawer from "./drawers/OnTimeDrawer";
import OpenShiftsDrawer from "./drawers/OpenShiftsDrawer";
import OvertimeDrawer from "./drawers/OvertimeDrawer";
import ScheduledHoursDrawer from "./drawers/ScheduledHoursDrawer";

const MyScheduleScreen = ({ initialDate }: { initialDate?: string }) => {
  const [scheduleView, setScheduleView] = useState<"List" | "Calendar">("List");
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(initialDate ? parseISO(initialDate) : new Date(), {
      weekStartsOn: 0,
    }) // Sunday start
  );
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const { show } = useToast();

  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);

  const {
    dropRequests,
    swapRequests,
    cancelDropRequest,
    cancelSwap,
    schedulePeriods,
    weeklySchedules,
  } = useScheduleStore();

  const employeeShifts = useMemo(() => {
    if (!loggedInEmployee) return [];
    const activeSchedules = [
      ...schedulePeriods.filter((p) => p.status === "active"),
      ...weeklySchedules.filter((w) => w.status === "active"),
    ];
    return activeSchedules
      .flatMap((s) => s.shifts)
      .filter((shift) => shift.employeeId === loggedInEmployee.id);
  }, [loggedInEmployee, schedulePeriods, weeklySchedules]);

  const dropSheetRef = useRef<BottomSheetMethods>(null);
  const swapWizardRef = useRef<BottomSheet>(null);
  const [shiftForAction, setShiftForAction] = useState<Shift | null>(null);
  const [shiftToSwap, setShiftToSwap] = useState<Shift | null>(null);

  const scheduledHoursSheetRef = useRef<BottomSheet>(null);
  const onTimeSheetRef = useRef<BottomSheet>(null);
  const breakComplianceSheetRef = useRef<BottomSheet>(null);
  const overtimeSheetRef = useRef<BottomSheet>(null);
  const openShiftsSheetRef = useRef<BottomSheet>(null);

  const isSchedulePublished = useMemo(() => {
    return employeeShifts.some((shift) =>
      isSameWeek(parseISO(shift.date), currentWeekStart, { weekStartsOn: 0 })
    );
  }, [employeeShifts, currentWeekStart]);

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  const goToPreviousWeek = () =>
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goToNextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const goToCurrentWeek = () =>
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));

  const getShiftsForDate = (date: Date) => {
    if (!isSchedulePublished) return [];
    return employeeShifts.filter((shift) =>
      isSameDay(parseISO(shift.date), date)
    );
  };

  const goToNextPublisedWeek = () => {
    const sortedShifts = [...employeeShifts].sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
    );

    const nextShift = sortedShifts.find((shift) =>
      isAfter(parseISO(shift.date), addDays(currentWeekStart, 6))
    );

    if (nextShift) {
      setCurrentWeekStart(
        startOfWeek(parseISO(nextShift.date), { weekStartsOn: 0 })
      );
    } else {
      show({
        title: "No Schedules Found",
        message: "There are no future published schedules available to view.",
        type: "warning",
      });
    }
  };

  const handleRequestDrop = (shift: Shift) => {
    setShiftForAction(shift);
    dropSheetRef.current?.expand();
  };

  const handleRequestSwap = (shift: Shift) => {
    setShiftToSwap(shift);
    swapWizardRef.current?.expand();
  };

  const handleCancelDropRequest = (shiftToCancel: Shift) => {
    const requestToCancel = dropRequests.find(
      (req) => req.shift.id === shiftToCancel.id && req.status === "pending"
    );
    if (requestToCancel) {
      cancelDropRequest(requestToCancel.id);
    }
  };

  const handleCancelSwapRequest = (shiftToCancel: Shift) => {
    const requestToCancel = swapRequests.find(
      (req) =>
        (req.myShiftId === shiftToCancel.id ||
          req.peerShiftId === shiftToCancel.id) &&
        (req.status === "pending-peer" || req.status === "pending-manager")
    );

    if (requestToCancel && loggedInEmployee) {
      cancelSwap(requestToCancel.id, loggedInEmployee.id);
      show({
        title: "Swap Cancelled",
        message:
          "Your request to swap this shift has been successfully cancelled.",
        type: "success",
      });
    } else {
      show({
        title: "Cancellation Failed",
        message: "Could not find a pending swap request for this shift.",
        type: "error",
      });
    }
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShowShiftModal(true);
  };

  const analyticsData = [
    {
      icon: <Clock size={24} color="#5B8CFF" />,
      title: "Scheduled Hours",
      value: "28h",
      trend: "+2h",
      period: "vs last week",
      variant: "success" as "success",
      onPress: () => scheduledHoursSheetRef.current?.expand(),
    },
    {
      icon: <CheckCircle2 size={24} color="#19C37D" />,
      title: "On-Time Rate",
      value: "92%",
      period: "Last 30 days",
      onPress: () => onTimeSheetRef.current?.expand(),
    },
    {
      icon: <Coffee size={24} color="#60A5FA" />,
      title: "Break Compliance",
      value: "7 On-time",
      trend: "1 Short",
      period: "Last 30 days",
      variant: "warning" as "warning",
      onPress: () => breakComplianceSheetRef.current?.expand(),
    },
    {
      icon: <AlertTriangle size={24} color="#F5A524" />,
      title: "OT Risk",
      value: "Possible",
      period: "By Sat",
      variant: "warning" as "warning",
      onPress: () => overtimeSheetRef.current?.expand(),
    },
    {
      icon: <Briefcase size={24} color="#60A5FA" />,
      title: "Open Shift Matches",
      value: "3",
      period: "Claimable this week",
      onPress: () => openShiftsSheetRef.current?.expand(),
    },
  ];

  return (
    <>
      <View className="flex-1 bg-[#303030] rounded-2xl">
        <View className="p-4 gap-y-4">
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-white">
              My Schedule - Dexa – 5th Ave
            </Text>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={goToPreviousWeek}
                className="p-2 bg-[#212121] rounded-md border border-gray-700"
              >
                <ChevronLeft size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <Text className="text-base font-medium text-gray-300">
                {format(weekDays[0], "MMM d")} -{" "}
                {format(weekDays[6], "MMM d, yyyy")}
              </Text>
              <TouchableOpacity
                onPress={goToNextWeek}
                className="p-2 bg-[#212121] rounded-md border border-gray-700"
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
              <NotificationBell />
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          className="px-4"
        >
          <View className="gap-y-4">
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

            {isSchedulePublished ? (
              // Schedule View
              <View className="mt-4">
                <View className="flex-row p-1 bg-[#212121] rounded-lg border border-gray-600 self-start mb-3">
                  <TouchableOpacity
                    onPress={() => setScheduleView("List")}
                    className={`px-4 py-2 rounded-md flex-row items-center gap-2 ${
                      scheduleView === "List" ? "bg-blue-600" : ""
                    }`}
                  >
                    <Text
                      className={`text-base font-semibold ${
                        scheduleView === "List" ? "text-white" : "text-gray-400"
                      }`}
                    >
                      List
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setScheduleView("Calendar")}
                    className={`px-4 py-2 rounded-md flex-row items-center gap-2 ${
                      scheduleView === "Calendar" ? "bg-blue-600" : ""
                    }`}
                  >
                    <CalendarIcon
                      size={20}
                      color={scheduleView === "Calendar" ? "white" : "#9CA3AF"}
                    />
                    <Text
                      className={`text-base font-semibold ${
                        scheduleView === "Calendar"
                          ? "text-white"
                          : "text-gray-400"
                      }`}
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
                        onRequestDrop={handleRequestDrop}
                        onRequestSwap={handleRequestSwap}
                        onCancelDropRequest={handleCancelDropRequest}
                        onCancelSwapRequest={handleCancelSwapRequest}
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
            ) : (
              <ScheduleNotLive
                weekStartDate={currentWeekStart}
                onViewLastWeek={goToPreviousWeek}
                onViewNextPublishedWeek={goToNextPublisedWeek}
              />
            )}
          </View>
        </ScrollView>
      </View>
      <ShiftDetailModal
        shift={selectedShift}
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        onRequestDrop={handleRequestDrop}
        onRequestSwap={handleRequestSwap}
        onCancelDropRequest={handleCancelDropRequest}
        onCancelSwapRequest={handleCancelSwapRequest}
      />
      <DropShiftBottomSheet
        shift={shiftForAction}
        bottomSheetRef={dropSheetRef as React.RefObject<BottomSheet>}
        onClose={() => dropSheetRef.current?.close()}
      />
      <SwapProposalWizard
        shiftToOffer={shiftToSwap}
        bottomSheetRef={swapWizardRef as React.RefObject<BottomSheet>}
        onClose={() => swapWizardRef.current?.close()}
      />
      <ScheduledHoursDrawer ref={scheduledHoursSheetRef} />
      <OnTimeDrawer ref={onTimeSheetRef} />
      <BreakComplianceDrawer ref={breakComplianceSheetRef} />
      <OvertimeDrawer ref={overtimeSheetRef} />
      <OpenShiftsDrawer ref={openShiftsSheetRef} />
    </>
  );
};

export default MyScheduleScreen;
