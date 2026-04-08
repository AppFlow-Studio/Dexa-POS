import { Shift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { format, parseISO } from "date-fns";
import { colors } from "@/lib/theme";
import { ArrowRightLeft, Clock, MapPin } from "lucide-react-native";
import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  return format(parseISO(time), "h:mm a");
};

const ShiftInfoCard = ({ shift }: { shift?: Shift }) => {
  if (!shift) return null;
  return (
    <View style={{ padding: 12, backgroundColor: colors.screen, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginBottom: 2 }}>{shift.role}</Text>
      <Text style={{ fontSize: 11, color: colors.label, marginBottom: 6 }}>{format(parseISO(shift.date), "EEE, MMM d")}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock size={11} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.label }}>{formatTime(shift.startTime)} – {formatTime(shift.endTime)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MapPin size={11} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.label }}>{shift.location}</Text>
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
    for (const schedule of [...schedulePeriods, ...weeklySchedules]) {
      const found = schedule.shifts.find((s) => s.id === shiftId);
      if (found) return found;
    }
    return undefined;
  };

  const incomingSwapRequests = useMemo(() => {
    if (!loggedInEmployee) return [];
    return swapRequests.filter((r) => r.peerId === loggedInEmployee.id);
  }, [swapRequests, loggedInEmployee]);

  if (incomingSwapRequests.length === 0) {
    return (
      <View style={{ padding: 40, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center' }}>
        <ArrowRightLeft size={36} color={colors.muted} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginTop: 12 }}>No Incoming Swap Requests</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>No one has requested to swap shifts with you yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {incomingSwapRequests.map((request) => {
        const myShift = findShiftById(request.myShiftId);
        const peerShift = findShiftById(request.peerShiftId);
        const owner = employees.find((emp) => emp.id === request.ownerId);

        return (
          <View key={request.id} style={{ padding: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.teal + '30' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowRightLeft size={15} color={colors.teal} />
                <Text style={{ fontSize: 12, color: colors.label }}>{owner?.fullName} is offering:</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.teal + '15' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>{request.status}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.muted }}>Submitted {format(parseISO(request.submittedAt), "MMM d")}</Text>
              </View>
            </View>

            <ShiftInfoCard shift={myShift} />
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <ArrowRightLeft size={16} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 11, color: colors.label, marginBottom: 6 }}>In exchange for your:</Text>
            <ShiftInfoCard shift={peerShift} />

            {request.status === "pending-peer" && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '40' }}
                  onPress={() => loggedInEmployee && acceptSwap(request.id, loggedInEmployee.id)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
                  onPress={() => denySwap(request.id)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Deny</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default SwapRequestsInTab;
