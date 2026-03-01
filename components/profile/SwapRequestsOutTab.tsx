import { Shift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { format, parseISO } from "date-fns";
import { colors } from "@/lib/theme";
import {
  AlertCircle,
  ArrowRightLeft,
  Clock,
  MapPin,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  // Create a dummy date to parse the time correctly with parseISO
  return format(parseISO(time), "h:mm a");
};

const ShiftInfoCard = ({ shift }: { shift?: Shift }) => {
  // Add a guard clause to handle cases where the shift might be undefined.
  if (!shift) {
    return null;
  }

  return (
    <View className="p-4 bg-panel rounded-xl border border-gray-700">
      <Text className="text-base font-semibold text-white mb-1">
        {shift.role}
      </Text>
      <Text className="text-sm text-gray-400 mb-2">
        {format(parseISO(shift.date), "EEEE, MMM d")}
      </Text>
      <View className="flex-row gap-4">
        <View className="flex-row items-center gap-2">
          <Clock size={16} color={colors.label} />
          <Text className="text-sm text-gray-400">
            {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <MapPin size={16} color={colors.label} />
          <Text className="text-sm text-gray-400">{shift.location}</Text>
        </View>
      </View>
    </View>
  );
};

const SwapRequestsOutTab = () => {
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const swapRequests = useScheduleStore((state) => state.swapRequests);
  const schedulePeriods = useScheduleStore((state) => state.schedulePeriods);
  const weeklySchedules = useScheduleStore((state) => state.weeklySchedules);
  const cancelSwap = useScheduleStore((state) => state.cancelSwap);

  const findShiftById = (shiftId: string | undefined) => {
    if (!shiftId) return undefined;
    const allSchedules = [...schedulePeriods, ...weeklySchedules];
    for (const schedule of allSchedules) {
      const foundShift = schedule.shifts.find((s) => s.id === shiftId);
      if (foundShift) return foundShift;
    }
    return undefined;
  };

  const outgoingSwapRequests = useMemo(() => {
    if (!loggedInEmployee) return [];
    return swapRequests.filter(
      (request) => request.ownerId === loggedInEmployee.id
    );
  }, [swapRequests, loggedInEmployee]);

  return (
    <View className="gap-y-4">
      {outgoingSwapRequests.length === 0 ? (
        <Text className="text-gray-400 text-center mt-4">
          No outgoing swap requests.
        </Text>
      ) : (
        outgoingSwapRequests.map((request) => {
          const myShift = findShiftById(request.myShiftId);
          const peerShift = findShiftById(request.peerShiftId);

          return (
            <View
              key={request.id}
              className="p-4 bg-surface rounded-2xl border border-yellow-500/20"
            >
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-row items-start gap-3">
                  <AlertCircle size={20} color={colors.warning} />

                  <View className="flex-1">
                    <View className="flex-row justify-between mb-4">
                      <Text className="text-sm text-gray-400 mb-2">
                        You're offering
                      </Text>
                      <View className="items-end">
                        <Text className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                          {request.status}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-1">
                          Submitted{" "}
                          {format(parseISO(request.submittedAt), "MMM d")}
                        </Text>
                      </View>
                    </View>
                    <ShiftInfoCard shift={myShift} />
                    <View className="items-center my-4">
                      <ArrowRightLeft size={20} color={colors.info} />
                    </View>
                    <Text className="text-sm text-gray-400 mb-2">
                      In exchange for
                    </Text>
                    <ShiftInfoCard shift={peerShift} />
                  </View>
                </View>
              </View>
              {(request.status === "pending-peer" ||
                request.status === "pending-manager") && (
                <TouchableOpacity
                  className="py-2 border border-gray-600 rounded-lg items-center mt-2"
                  onPress={() =>
                    loggedInEmployee &&
                    cancelSwap(request.id, loggedInEmployee.id)
                  }
                >
                  <Text className="text-white font-semibold">
                    Cancel Request
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </View>
  );
};

export default SwapRequestsOutTab;
