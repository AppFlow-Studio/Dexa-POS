import { useTimeClock } from "@/hooks/useTimeclock";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { colors } from "@/lib/theme";
import * as Application from "expo-application";
import { router } from "expo-router";
import { Clock, Timer, User } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, Text, TouchableOpacity, View } from "react-native";
import PinInputModal from "./PinInputModal";

// Helper function to format duration from milliseconds
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0 h 00 m";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0"
  );
  return `${hours} h ${minutes} m`;
};

// Get device ID
const getDeviceId = async (): Promise<string> => {
  if (Platform.OS === "android") {
    return Application.getAndroidId() || "unknown-android";
  } else if (Platform.OS === "ios") {
    return (await Application.getIosIdForVendorAsync()) || "unknown-ios";
  }
  return "unknown-device";
};

// This component is now self-sufficient and doesn't require any props.
const UserProfileCard: React.FC<{ employeeId: string | null }> = ({
  employeeId,
}) => {
  // --- HOOKS ---
  // Use NEW backend hook for actions
  const timeClock = useTimeClock();
  // Use OLD store for session/status display (to match Header/SessionDock)
  const {
    getSession,
    startBreak: oldStartBreak,
    endBreak: oldEndBreak,
    clockOut: oldClockOut,
  } = useTimeclockStore();
  const { employees } = useEmployeeStore();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

  // --- LOCAL UI STATE ---
  const [currentTime, setCurrentTime] = useState(new Date());
  const [shiftDuration, setShiftDuration] = useState("0 h 00 m");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<
    "break_start" | "break_end" | "clock_out" | null
  >(null);
  const [deviceId, setDeviceId] = useState<string>("unknown");

  // Get device ID on mount
  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const user = useMemo(() => {
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  // Get session from OLD store (matches Header/SessionDock)
  const session = useMemo(() => {
    if (!employeeId) return null;
    return getSession(employeeId);
  }, [employeeId, getSession]);

  // Effect to manage all live timers
  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
      if (session?.clockInTime) {
        const durationMs =
          new Date().getTime() - new Date(session.clockInTime).getTime();
        setShiftDuration(formatDuration(durationMs));
      } else {
        setShiftDuration("0 h 00 m");
      }
    }, 1000);
    return () => clearInterval(timerId);
  }, [session]);

  const handlePinConfirm = async (pin: string) => {
    const locationId = selectedStore?.id;
    console.log("[UserProfileCard] handlePinConfirm called", {
      pinAction,
      locationId,
      deviceId,
      pin: pin.substring(0, 2) + "**",
    });

    if (!locationId) {
      console.error("[UserProfileCard] No location selected");
      setPinModalOpen(false);
      return;
    }

    setPinModalOpen(false);

    if (pinAction === "break_start") {
      console.log("[UserProfileCard] Calling timeClock.startBreak...");
      // Call backend
      await timeClock.startBreak(pin, locationId, deviceId);
      console.log("[UserProfileCard] timeClock.startBreak completed");
      // Also update old store for local UI sync
      oldStartBreak();
      router.replace("/pin-login"); // Redirect for break & switch
    } else if (pinAction === "break_end") {
      console.log("[UserProfileCard] Calling timeClock.endBreak...");
      // Call backend
      await timeClock.endBreak(pin, locationId, deviceId);
      console.log("[UserProfileCard] timeClock.endBreak completed");
      // Also update old store for local UI sync
      if (employeeId) oldEndBreak(employeeId);
      router.replace("/home");
    } else if (pinAction === "clock_out") {
      console.log("[UserProfileCard] Calling timeClock.clockOut...");
      // Call backend
      await timeClock.clockOut(pin, locationId, deviceId);
      // Also update old store for local UI sync
      if (employeeId) oldClockOut(employeeId);
    }

    setPinAction(null);
  };

  const handleStartBreak = () => {
    setPinAction("break_start");
    setPinModalOpen(true);
  };

  const handleEndBreak = () => {
    setPinAction("break_end");
    setPinModalOpen(true);
  };

  const handleClockOut = () => {
    setPinAction("clock_out");
    setPinModalOpen(true);
  };

  const isBreak = session?.status === "onBreak";

  if (!user) {
    return (
      <View className="w-full p-6 bg-panel rounded-2xl border border-border items-center justify-center">
        <Text className="text-label">No active employee.</Text>
      </View>
    );
  }

  const initials = user.fullName.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 2);

  return (
    <>
      <View className="w-full bg-panel rounded-2xl border border-border overflow-hidden">
        {/* Hero section */}
        <View style={{ backgroundColor: '#0C0F1A' }} className="items-center px-8 pt-10 pb-8">
          {/* Clock */}
          <Text className="text-label text-xs font-medium mb-2 tracking-widest uppercase">Current Time</Text>
          <Text className="text-5xl font-bold text-heading mb-8">
            {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>

          {/* Avatar */}
          {user.profilePictureUrl ? (
            <Image source={{ uri: user.profilePictureUrl }} style={{ width: 88, height: 88, borderRadius: 44, marginBottom: 16 }} />
          ) : (
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#2DD4BF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ color: '#0C0F1A', fontSize: 30, fontWeight: 'bold' }}>{initials}</Text>
            </View>
          )}

          <Text className="text-heading text-xl font-bold text-center mb-3">{user.fullName}</Text>

          {/* Status badge */}
          <View className={`px-4 py-1.5 rounded-full ${session ? (isBreak ? "bg-amber-500/20" : "bg-teal-500/20") : "bg-white/5"}`}>
            <Text className={`text-xs font-semibold ${session ? (isBreak ? "text-amber-400" : "text-teal-400") : "text-label"}`}>
              {session ? (isBreak ? "⏸  On Break" : "●  Clocked In") : "○  Not Clocked In"}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-border" />

        {/* Shift stats */}
        {session && (
          <View className="px-6 py-5 gap-y-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <Timer color={colors.muted} size={15} />
                <Text className="text-label text-sm">Duration</Text>
              </View>
              <Text className="text-teal-400 text-sm font-semibold">{shiftDuration}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <Clock color={colors.muted} size={15} />
                <Text className="text-label text-sm">Clocked in at</Text>
              </View>
              <Text className="text-teal-400 text-sm font-semibold">
                {new Date(session.clockInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>
        )}

        {/* Divider */}
        {session && <View className="h-px bg-border mx-6" />}

        {/* Actions */}
        <View className="px-6 py-5 gap-y-3">
          {session ? (
            <>
              {isBreak ? (
                <TouchableOpacity
                  onPress={handleEndBreak}
                  className="py-3.5 rounded-xl items-center"
                  style={{ backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning + '50' }}
                >
                  <Text style={{ color: colors.warning }} className="font-semibold text-sm">End Break</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleStartBreak}
                  className="py-3.5 rounded-xl items-center"
                  style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
                >
                  <Text style={{ color: colors.teal }} className="font-semibold text-sm">Start Break</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleClockOut}
                className="py-3.5 rounded-xl items-center"
                style={{ backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
              >
                <Text style={{ color: colors.danger }} className="font-semibold text-sm">Clock Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View className="py-3 rounded-xl items-center bg-white/5">
              <Text className="text-label text-sm">Clock in from Employee List</Text>
            </View>
          )}
        </View>
      </View>

      <PinInputModal
        isOpen={pinModalOpen}
        title={pinAction === "break_start" ? "Start Break" : pinAction === "break_end" ? "End Break" : "Clock Out"}
        subtitle="Enter your PIN to confirm"
        onConfirm={handlePinConfirm}
        onCancel={() => { setPinModalOpen(false); setPinAction(null); }}
      />
    </>
  );
};
export default UserProfileCard;
