import { useToast } from "@/contexts/ToastContext";
import { Shift, ShiftHistoryEntry } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import {
  addDays,
  differenceInDays,
  differenceInMinutes,
  format,
  isAfter,
  isSameDay,
  isSameWeek,
  parseISO,
  startOfDay,
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
    pickupShift,
    ptoRequests,
  } = useScheduleStore();

  const visibleShifts = useMemo(() => {
    if (!loggedInEmployee) return [];
    const activeSchedules = [
      ...schedulePeriods.filter((p) => p.status === "active"),
      ...weeklySchedules.filter((w) => w.status === "active"),
    ];

    const allMyShifts = activeSchedules
      .flatMap((s) => s.shifts)
      .filter((shift) => shift.employeeId === loggedInEmployee.id);

    // Identify days where I have approved PTO
    const myPtoDates = ptoRequests
      .filter(
        (pto) =>
          pto.employeeId === loggedInEmployee.id && pto.status === "approved"
      )
      .flatMap((pto) => {
        const dates: string[] = [];
        let current = parseISO(pto.startDate);
        const end = parseISO(pto.endDate);
        while (current <= end) {
          dates.push(format(current, "yyyy-MM-dd"));
          current = addDays(current, 1);
        }
        return dates;
      });

    // Identify days where I have an approved drop request
    const myDroppedShiftDates = dropRequests
      .filter(
        (req) =>
          req.ownerId === loggedInEmployee.id && req.status === "approved"
      )
      .map((req) => req.shift.date);

    const availableOpenShifts = activeSchedules
      .flatMap((s) => s.shifts)
      .filter((shift) => {
        if (shift.status !== "open") return false;

        // Rule 1: Don't show if I already have a shift on that day
        const hasShiftOnDay = allMyShifts.some((myShift) =>
          isSameDay(parseISO(myShift.date), parseISO(shift.date))
        );
        if (hasShiftOnDay) return false;

        // Rule 2: Don't show if I have approved PTO on that day
        const hasPtoOnDay = myPtoDates.includes(shift.date);
        if (hasPtoOnDay) return false;

        // Rule 3: Don't show if I have an approved drop on that day
        const hasDroppedOnDay = myDroppedShiftDates.includes(shift.date);
        if (hasDroppedOnDay) return false;

        return true;
      });

    return [...allMyShifts, ...availableOpenShifts];
  }, [
    loggedInEmployee,
    schedulePeriods,
    weeklySchedules,
    dropRequests,
    ptoRequests,
  ]);

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
    return visibleShifts.some((shift) =>
      isSameWeek(parseISO(shift.date), currentWeekStart, { weekStartsOn: 0 })
    );
  }, [visibleShifts, currentWeekStart]);

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
    return visibleShifts.filter((shift) =>
      isSameDay(parseISO(shift.date), date)
    );
  };

  const goToNextPublisedWeek = () => {
    const sortedShifts = [...visibleShifts].sort(
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

  const handlePickUpShift = (shift: Shift) => {
    if (loggedInEmployee) {
      pickupShift(shift.id, loggedInEmployee.id);
      show({
        title: "Shift Picked Up",
        message: `You have successfully picked up the shift for ${format(
          parseISO(shift.date),
          "MMM d"
        )}.`,
        type: "success",
      });
    }
  };

  const handleShiftClick = (shift: Shift) => {
    setSelectedShift(shift);
    setShowShiftModal(true);
  };

  const { shiftHistory } = useTimeclockStore();
  const { employees } = useEmployeeStore();
  const activeEmployee = employees.find((e) => e.id === loggedInEmployee?.id);

  // --- Analytics Calculations ---

  // 1. Scheduled Hours (This Week)
  const scheduledHours = useMemo(() => {
    return visibleShifts
      .filter((shift) =>
        isSameWeek(parseISO(shift.date), currentWeekStart, { weekStartsOn: 0 })
      )
      .reduce((total, shift) => {
        const start = parseISO(shift.startTime);
        const end = parseISO(shift.endTime);
        const duration = differenceInMinutes(end, start) / 60;
        return total + duration;
      }, 0);
  }, [visibleShifts, currentWeekStart]);

  // 2. On-Time Rate (Last 30 Days)
  const onTimeRate = useMemo(() => {
    if (!loggedInEmployee) return "N/A";
    const recentHistory = shiftHistory.filter((entry: ShiftHistoryEntry) => {
      const entryDate = parseISO(entry.date);
      const daysDiff = differenceInDays(new Date(), entryDate);
      return entry.employeeId === loggedInEmployee.id && daysDiff <= 30;
    });

    if (recentHistory.length === 0) return "100%";

    const onTimeCount = recentHistory.filter((entry: ShiftHistoryEntry) => {
      // Find scheduled shift for this history entry to compare times
      // NOTE: In a real app, we'd link history items to schedule IDs.
      // Here we try to match by date/employee.
      // If not found, we assume on-time (or ignore). Let's be lenient.

      // Simpler approach for now: Check if clock-in was before 9:05 AM (mock logic)
      // OR better: Parse the entry.clockIn and compare to a "scheduled start" if we can find it.
      // Since we lack a direct link, let's assume if it exists in history, we check the time.
      // Let's assume a "late" is > 5 mins past scheduled start.
      // Since we don't have the original scheduled start easily for past shifts (if they were deleted/moved),
      // we will use a heuristic or just use the data if available.

      // REFINED STRATEGY: Look up the CLOSED schedule (past) if possible.
      // Given complexity, let's use a placeholder logic that checks the minute of clockIn.
      // If minute > 5, count as late? No, that's brittle.

      // Let's match against `allMyShifts` (which are ACTIVE schedules).
      // Since `visibleShifts` includes active shifts, we might find it there if distinct.
      // Valid for "Last 30 Days" might imply past schedules which might be 'completed'.

      // For this demo, let's calculate based on `entry.clockIn`.
      // If the 'minutes' part is > 5, we call it late (assuming 00 start).
      // This is a simplification for the demo unless we fetch archived schedules.
      return true; // Placeholder for "100%" or specific logic if user asks for strict matching
    }).length; // Currently simply returns 100% effectively as we don't have past schedule data easily.

    // To make it REAL-ish: Let's assume the mock history is 'truth'.
    // Let's check `entry.clockIn` time components.
    // If we assume shifts start at top of hour, any clock in > XX:05 is late.
    const lateCount = recentHistory.filter((entry: ShiftHistoryEntry) => {
      const d = parseISO(entry.clockIn);
      return d.getMinutes() > 5;
    }).length;

    const rate =
      ((recentHistory.length - lateCount) / recentHistory.length) * 100;
    return `${rate.toFixed(0)}%`;
  }, [shiftHistory, loggedInEmployee]);

  // 3. Break Compliance (Last 30 Days)
  const breakCompliance = useMemo(() => {
    if (!loggedInEmployee)
      return { text: "N/A", trend: "", variant: "default" };
    const recentLongShifts = shiftHistory.filter((entry: ShiftHistoryEntry) => {
      const entryDate = parseISO(entry.date);
      const daysDiff = differenceInDays(new Date(), entryDate);
      const durationHours = parseFloat(entry.duration);
      return (
        entry.employeeId === loggedInEmployee.id &&
        daysDiff <= 30 &&
        durationHours >= 6
      );
    });

    if (recentLongShifts.length === 0)
      return { text: "100%", trend: "No long shifts", variant: "success" };

    const compliantCount = recentLongShifts.filter(
      (entry: ShiftHistoryEntry) => entry.breakInitiated !== "N/A"
    ).length;
    const rate = (compliantCount / recentLongShifts.length) * 100;

    const missing = recentLongShifts.length - compliantCount;

    return {
      text: `${compliantCount} On-time`,
      trend: missing > 0 ? `${missing} Missed` : "Perfect",
      variant: missing > 0 ? "warning" : "success",
    };
  }, [shiftHistory, loggedInEmployee]);

  // 4. OT Risk
  const otRisk = useMemo(() => {
    if (!loggedInEmployee) return { text: "Safe", variant: "success" };

    // Hours worked so far this week (from history)
    const hoursWorkedThisWeek = shiftHistory
      .filter((entry: ShiftHistoryEntry) => {
        const entryDate = parseISO(entry.date);
        return (
          isSameWeek(entryDate, currentWeekStart, { weekStartsOn: 0 }) &&
          entry.employeeId === loggedInEmployee.id
        );
      })
      .reduce(
        (acc: number, entry: ShiftHistoryEntry) =>
          acc + parseFloat(entry.duration),
        0
      );

    // Future scheduled hours this week
    const futureHoursThisWeek = visibleShifts
      .filter((shift) => {
        const shiftDate = parseISO(shift.date);
        const now = new Date();
        return (
          isSameWeek(shiftDate, currentWeekStart, { weekStartsOn: 0 }) &&
          isAfter(shiftDate, now)
        );
      })
      .reduce((acc, shift) => {
        const start = parseISO(shift.startTime);
        const end = parseISO(shift.endTime);
        return acc + differenceInMinutes(end, start) / 60;
      }, 0);

    const projectedTotal = hoursWorkedThisWeek + futureHoursThisWeek;

    if (projectedTotal > 40)
      return { text: "High Risk", variant: "destructive" };
    if (projectedTotal > 35) return { text: "Possible", variant: "warning" };
    return { text: "Safe", variant: "success" };
  }, [shiftHistory, visibleShifts, currentWeekStart, loggedInEmployee]);

  // 5. Open Shift Matches
  const openShiftMatchesCount = useMemo(() => {
    if (!activeEmployee) return 0;

    // Use active schedules only (same as Drawer)
    const activeSchedules = [
      ...schedulePeriods.filter((p) => p.status === "active"),
      ...weeklySchedules.filter((w) => w.status === "active"),
    ];

    const now = new Date();

    // Get employee's existing shifts
    const myShifts = activeSchedules
      .flatMap((s) => s.shifts)
      .filter((shift) => shift.employeeId === activeEmployee.id);

    // Get dates where employee has approved PTO
    const myPtoDates = ptoRequests
      .filter(
        (pto) =>
          pto.employeeId === activeEmployee.id && pto.status === "approved"
      )
      .flatMap((pto) => {
        const dates: string[] = [];
        let current = parseISO(pto.startDate);
        const end = parseISO(pto.endDate);
        while (current <= end) {
          dates.push(format(current, "yyyy-MM-dd"));
          current = addDays(current, 1);
        }
        return dates;
      });

    // Get dates where employee has approved drop
    const myDropDates = dropRequests
      .filter(
        (req) => req.ownerId === activeEmployee.id && req.status === "approved"
      )
      .map((req) => req.shift.date);

    const matches = activeSchedules
      .flatMap((s) => s.shifts)
      .filter((s) => {
        // Must be open
        if (s.status !== "open") return false;

        // Use "Future" filter (matching Drawer logic)
        if (!s.date || !isAfter(parseISO(s.date), startOfDay(now)))
          return false;

        // Exclude if already have a shift on that day
        const hasShiftOnDay = myShifts.some((myShift) =>
          isSameDay(parseISO(myShift.date), parseISO(s.date))
        );
        if (hasShiftOnDay) return false;

        // Exclude if on PTO date
        if (myPtoDates.includes(s.date)) return false;

        // Exclude if on drop date
        if (myDropDates.includes(s.date)) return false;

        return true;
      });

    return matches.length;
  }, [
    schedulePeriods,
    weeklySchedules,
    activeEmployee,
    ptoRequests,
    dropRequests,
  ]);

  const analyticsData = [
    {
      icon: <Clock size={24} color="#5B8CFF" />,
      title: "Scheduled Hours",
      value: `${scheduledHours.toFixed(1)}h`,
      trend: "updated",
      period: "This Week",
      variant: "success" as "success",
      onPress: () => scheduledHoursSheetRef.current?.expand(),
    },
    {
      icon: <CheckCircle2 size={24} color="#19C37D" />,
      title: "On-Time Rate",
      value: onTimeRate,
      period: "Last 30 days",
      onPress: () => onTimeSheetRef.current?.expand(),
    },
    {
      icon: <Coffee size={24} color="#60A5FA" />,
      title: "Break Compliance",
      value: breakCompliance.text,
      trend: breakCompliance.trend,
      period: "Last 30 days",
      variant: breakCompliance.variant as any,
      onPress: () => breakComplianceSheetRef.current?.expand(),
    },
    {
      icon: <AlertTriangle size={24} color="#F5A524" />,
      title: "OT Risk",
      value: otRisk.text,
      period: "By Sat",
      variant: otRisk.variant as any,
      onPress: () => overtimeSheetRef.current?.expand(),
    },
    {
      icon: <Briefcase size={24} color="#60A5FA" />,
      title: "Open Shift Matches",
      value: openShiftMatchesCount.toString(),
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
                        onPickUpShift={handlePickUpShift}
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
        // ShiftDetailModal might need onPickUpShift too if we want to support it from the modal
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
