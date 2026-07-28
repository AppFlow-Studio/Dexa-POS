import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@/components/ui/bottomSheet";
import { Briefcase } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

import { useToast } from "@/contexts/ToastContext";
import { Shift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import {
  addDays,
  differenceInMinutes,
  format,
  isAfter,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const MetricCard = ({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "success" | "default";
}) => (
  <View className="flex-1 bg-panel p-4 rounded-xl border border-gray-700">
    <Text className="text-sm text-gray-400 mb-1">{label}</Text>
    <Text
      className={`text-3xl font-bold ${variant === "success" ? "text-green-400" : "text-white"}`}
    >
      {value}
    </Text>
  </View>
);

const OpenShiftsDrawer = forwardRef<BottomSheet>((props, ref) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const {
    schedulePeriods,
    weeklySchedules,
    pickupShift,
    dropRequests,
    ptoRequests,
  } = useScheduleStore();
  const { loggedInEmployee } = useEmployeeStore();
  const { show } = useToast();

  const openShifts = useMemo(() => {
    if (!loggedInEmployee) return [];

    // Filter for active schedules only
    const activePeriodShifts = schedulePeriods
      .filter((p) => p.status === "active")
      .flatMap((s) => s.shifts);
    const activeWeeklyShifts = weeklySchedules
      .filter((w) => w.status === "active")
      .flatMap((s) => s.shifts);

    const allShifts = [...activePeriodShifts, ...activeWeeklyShifts];
    const now = new Date();

    // Get employee's existing shifts
    const myShifts = allShifts.filter(
      (shift) => shift.employeeId === loggedInEmployee.id
    );

    // Get dates where logged-in employee has approved PTO
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

    // Get dates where logged-in employee has approved drop
    const myDropDates = dropRequests
      .filter(
        (req) =>
          req.ownerId === loggedInEmployee.id && req.status === "approved"
      )
      .map((req) => req.shift.date);

    // Filter for open shifts in the future, excluding PTO/Drop/existing shift dates
    return allShifts
      .filter((s) => {
        if (s.status !== "open") return false;
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
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [
    schedulePeriods,
    weeklySchedules,
    loggedInEmployee,
    ptoRequests,
    dropRequests,
  ]);

  // Calculate Metrics
  const availableCount = openShifts.length;

  const bestMatch = useMemo(() => {
    if (openShifts.length === 0 || !loggedInEmployee) return 0;
    // Simple logic: if any shift matches role, 100%, else 80%
    const hasRoleMatch = openShifts.some(
      (s) => s.role === loggedInEmployee.role
    );
    return hasRoleMatch ? 100 : 80;
  }, [openShifts, loggedInEmployee]);

  const totalHours = useMemo(() => {
    const minutes = openShifts.reduce((acc, shift) => {
      if (!shift.startTime || !shift.endTime) return acc;
      const start = parseISO(shift.startTime);
      const end = parseISO(shift.endTime);
      return acc + differenceInMinutes(end, start);
    }, 0);
    return Math.round(minutes / 60);
  }, [openShifts]);

  const handlePickup = (shift: Shift) => {
    if (!loggedInEmployee) return;
    pickupShift(shift.id, loggedInEmployee.id);
    show({
      title: "Shift Picked Up",
      message: "You have successfully picked up the shift.",
      type: "success",
    });
  };

  const calculateMatchScore = (shift: Shift) => {
    if (!loggedInEmployee) return 0;
    return shift.role === loggedInEmployee.role ? 100 : 80;
  };

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-2xl font-bold text-white">Open Shifts</Text>
        <View className="flex-row gap-4">
          <MetricCard label="Available" value={availableCount.toString()} />
          <MetricCard
            label="Best Match"
            value={`${bestMatch}%`}
            variant="success"
          />
          <MetricCard label="Total Hours" value={`${totalHours}h`} />
        </View>
        <View className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex-row items-start gap-3">
          <Briefcase size={16} color={colors.info} className="mt-1" />
          <View>
            <Text className="text-sm font-semibold text-white mb-1">
              How Matching Works
            </Text>
            <Text className="text-sm text-gray-400">
              Shifts are matched based on your role, availability, and location
              history.
            </Text>
          </View>
        </View>
        <View className="gap-y-3">
          {openShifts.length === 0 ? (
            <View className="p-8 items-center justify-center">
              <Text className="text-gray-400">
                No open shifts available right now.
              </Text>
            </View>
          ) : (
            openShifts.map((shift) => (
              <View
                key={shift.id}
                className="p-4 bg-surface rounded-xl border border-gray-700"
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View>
                    <Text className="text-lg font-semibold text-white mb-1">
                      {shift.role}
                    </Text>
                    <Text className="text-sm text-gray-400">
                      {format(parseISO(shift.date), "EEE, MMM d")}
                    </Text>
                    <Text className="text-sm text-gray-400">
                      {formatInTimeZone(shift.startTime, "UTC", "h:mm a")} -{" "}
                      {formatInTimeZone(shift.endTime, "UTC", "h:mm a")}
                    </Text>
                  </View>
                  <Text className="text-2xl font-bold text-blue-400">
                    {calculateMatchScore(shift)}% match
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handlePickup(shift)}
                  className="py-2 bg-blue-600 rounded-lg items-center"
                >
                  <Text className="font-bold text-white">Pick Up Shift</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
        <View className="p-4 bg-surface rounded-xl border border-gray-700">
          <Text className="text-lg font-semibold text-white mb-2">
            Insights
          </Text>
          <Text className="text-sm text-gray-400">
            • {openShifts.filter((s) => calculateMatchScore(s) > 90).length}{" "}
            high-match shifts available in your preferred role
            {"\n"}• Picking up all shifts would add {totalHours} hours this week
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default OpenShiftsDrawer;
