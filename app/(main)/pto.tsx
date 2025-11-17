import PTOHistoryCard from "@/components/profile/PTOHistoryCard";
import PTORequestForm from "@/components/profile/PTORequestForm";
import PtoMetrics from "@/components/pto/PtoMetrics";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  differenceInHours,
  isFuture,
  isToday,
  parse,
  parseISO,
} from "date-fns";
import { Calendar } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

const PTOPage = () => {
  const ptoRequests = useScheduleStore((state) => state.ptoRequests);
  const addPTORequest = useScheduleStore((state) => state.addPTORequest);
  const cancelPTORequest = useScheduleStore((state) => state.cancelPTORequest);
  const activeEmployeeId = useEmployeeStore((state) => state.activeEmployeeId);
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const { schedulePeriods, weeklySchedules } = useScheduleStore();
  const { ptoAccrualRate } = useStoreSettingsStore();
  const [showRequestForm, setShowRequestForm] = useState(false);

  const nextAccrualInfo = useMemo(() => {
    if (!loggedInEmployee) return "No upcoming shifts";

    const futureShifts = [...schedulePeriods, ...weeklySchedules]
      .filter((p) => p.status === "active")
      .flatMap((s) => s.shifts)
      .filter((shift) => {
        if (shift.employeeId !== loggedInEmployee.id) return false;
        const shiftDate = parseISO(shift.date);
        return isToday(shiftDate) || isFuture(shiftDate);
      })
      .sort((a, b) => {
        const dateA = parseISO(a.date).getTime();
        const dateB = parseISO(b.date).getTime();
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        return (
          parse(a.startTime, "HH:mm", new Date()).getTime() -
          parse(b.startTime, "HH:mm", new Date()).getTime()
        );
      });

    if (futureShifts.length === 0) {
      return "No upcoming shifts";
    }

    const nextShift = futureShifts[0];
    const startTime = parseISO(nextShift.startTime);
    const endTime = parseISO(nextShift.endTime);
    const duration = differenceInHours(endTime, startTime);
    const ptoFromNextShift = duration * ptoAccrualRate;

    return `~${ptoFromNextShift.toFixed(2)}h after next shift`;
  }, [loggedInEmployee, schedulePeriods, weeklySchedules, ptoAccrualRate]);

  if (!activeEmployeeId) {
    return (
      <View className="flex-1 bg-[#212121] p-4 items-center justify-center">
        <Text className="text-white text-lg">
          Please clock in to view your PTO information.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row items-center justify-between mb-6">
        <View></View>
        {!showRequestForm && (
          <TouchableOpacity
            onPress={() => setShowRequestForm(true)}
            className="flex-row items-center gap-2 bg-blue-600 px-4 py-2 rounded-lg"
          >
            <Calendar color="white" size={16} />
            <Text className="text-white font-semibold">Request PTO</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {showRequestForm && (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <PTORequestForm
              onClose={() => setShowRequestForm(false)}
              onAddRequest={addPTORequest}
            />
          </Animated.View>
        )}
        <PtoMetrics employeeId={activeEmployeeId} />

        <View className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl mb-6">
          <Text className="text-lg font-semibold text-white mb-2">
            Accrual Information
          </Text>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-sm text-gray-400 mb-1">Accrual Rate</Text>
              <Text className="text-xl font-bold text-white">
                {ptoAccrualRate} hours per hour worked
              </Text>
            </View>
            <View>
              <Text className="text-sm text-gray-400 mb-1">Next Accrual</Text>
              <Text className="text-xl font-bold text-white">
                {nextAccrualInfo}
              </Text>
            </View>
          </View>
        </View>

        <View>
          <Text className="text-xl font-semibold text-white mb-4">
            Request History
          </Text>
          <View className="gap-y-3">
            {ptoRequests
              .filter((req) => req.employeeId === activeEmployeeId)
              .map((request) => (
                <PTOHistoryCard
                  key={request.id}
                  request={request}
                  onCancelRequest={cancelPTORequest}
                />
              ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default PTOPage;
