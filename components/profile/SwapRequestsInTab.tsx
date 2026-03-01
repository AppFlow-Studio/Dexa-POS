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

const SwapRequestsInTab = () => {
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const swapRequests = useScheduleStore((state) => state.swapRequests);
  const schedulePeriods = useScheduleStore((state) => state.schedulePeriods);
  const weeklySchedules = useScheduleStore((state) => state.weeklySchedules);
  const acceptSwap = useScheduleStore((state) => state.acceptSwap);
  const denySwap = useScheduleStore((state) => state.denySwap);
  const employees = useEmployeeStore((state) => state.employees);

  const findShiftById = (shiftId: string | undefined) => {
    if (!shiftId) return undefined;
    const allSchedules = [...schedulePeriods, ...weeklySchedules];
    for (const schedule of allSchedules) {
      const foundShift = schedule.shifts.find((s) => s.id === shiftId);
      if (foundShift) return foundShift;
    }
    return undefined;
  };

  const incomingSwapRequests = useMemo(() => {
    if (!loggedInEmployee) return [];
    return swapRequests.filter(
      (request) => request.peerId === loggedInEmployee.id
    );
  }, [swapRequests, loggedInEmployee]);

  return (
    <View className="gap-y-4">
      {incomingSwapRequests.length === 0 ? (
        <View className="p-12 bg-surface border border-gray-700 rounded-2xl items-center justify-center">
          <ArrowRightLeft size={48} color={colors.muted} />
          <Text className="text-lg font-semibold text-white mt-4">
            No Incoming Swap Requests
          </Text>
          <Text className="text-sm text-gray-500 mt-2">
            No one has requested to swap shifts with you yet.
          </Text>
        </View>
      ) : (
        incomingSwapRequests.map((request) => {
          const myShift = findShiftById(request.myShiftId);
          const peerShift = findShiftById(request.peerShiftId);
          const owner = employees.find((emp) => emp.id === request.ownerId);

          return (
            <View
              key={request.id}
              className="p-4 bg-surface rounded-2xl border border-blue-500/20"
            >
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-row items-start gap-3">
                  <AlertCircle size={20} color={colors.info} />
                  <View className="flex-1">
                    <View className="flex-row justify-between mb-4">
                      <Text className="text-sm text-gray-400 mb-2">
                        {owner?.fullName} is offering:
                      </Text>
                      <View className="items-end flex-shrink-0 min-w-[80px]">
                        <Text className="text-xs font-medium px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
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
                      In exchange for your:
                    </Text>
                    <ShiftInfoCard shift={peerShift} />
                  </View>
                </View>
              </View>
              {request.status === "pending-peer" && (
                <View className="flex-row justify-around mt-2">
                  <TouchableOpacity
                    className="py-2 px-4 bg-green-600 rounded-lg items-center flex-1 mr-2"
                    onPress={() =>
                      loggedInEmployee &&
                      acceptSwap(request.id, loggedInEmployee.id)
                    }
                  >
                    <Text className="text-white font-semibold">Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="py-2 px-4 bg-red-600 rounded-lg items-center flex-1 ml-2"
                    onPress={() => denySwap(request.id)}
                  >
                    <Text className="text-white font-semibold">Deny</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
};

export default SwapRequestsInTab;
