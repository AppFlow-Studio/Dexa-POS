import { useTimeClock } from "@/hooks/useTimeclock";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
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

  const renderContent = () => {
    if (session) {
      // If a session exists, the user is either Clocked In or On Break
      const isBreak = session.status === "onBreak";
      return (
        <View className="w-full p-4 bg-[#404040] rounded-xl border border-gray-600">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-bold text-white">Shift Status</Text>
            <View
              className={`px-3 py-1 rounded-lg ${
                isBreak
                  ? "bg-yellow-600/30 border border-yellow-500"
                  : "bg-green-600/20 border border-green-500/30"
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  isBreak ? "text-yellow-400" : "text-green-400"
                }`}
              >
                ● {isBreak ? "On Break" : "Clocked In"}
              </Text>
            </View>
          </View>
          <View className="gap-y-3 mb-4">
            <View className="flex-row items-center">
              <Timer color="#9CA3AF" size={16} />
              <Text className="text-sm ml-2 text-gray-300">
                Duration:{" "}
                <Text className="text-blue-400 font-semibold">
                  {shiftDuration}
                </Text>
              </Text>
            </View>
            <View className="flex-row items-center">
              <Clock color="#9CA3AF" size={16} />
              <Text className="text-sm ml-2 text-gray-300">
                Clock in at:{" "}
                <Text className="text-blue-400 font-semibold">
                  {new Date(session.clockInTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </Text>
            </View>
          </View>
          <View className="gap-y-3">
            {isBreak ? (
              // If on break, show "End Break" button
              <TouchableOpacity
                onPress={handleEndBreak}
                className="py-3 px-4 rounded-xl items-center bg-yellow-500 border border-yellow-400"
              >
                <Text className="font-semibold text-sm text-white">
                  End Break
                </Text>
              </TouchableOpacity>
            ) : (
              // If clocked in, show "Start a Break" button
              <TouchableOpacity
                onPress={handleStartBreak}
                className="py-3 px-4 rounded-xl items-center bg-blue-600 border border-blue-500"
              >
                <Text className="font-semibold text-sm text-white">
                  Start a Break
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleClockOut}
              className="py-3 px-4 bg-red-600 border border-red-500 rounded-xl items-center"
            >
              <Text className="font-semibold text-sm text-white">
                Clock Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Default: Not Clocked In
    return (
      <View className="w-full p-4 bg-[#404040] rounded-xl border border-gray-600">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-bold text-white">Shift Status</Text>
          <View className="px-3 py-1 bg-gray-600/50 border border-gray-500 rounded-lg">
            <Text className="font-semibold text-sm text-gray-300">
              ● Not Clocked In
            </Text>
          </View>
        </View>
        <TouchableOpacity
          disabled={true}
          className="w-full py-3 px-4 bg-gray-600/50 border border-gray-500 rounded-xl items-center"
        >
          <Text className="font-semibold text-sm text-gray-400">
            Clock In from Employee List
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (!user) {
    return (
      <View className="w-full p-6 bg-[#303030] rounded-2xl border border-gray-600 items-center justify-center">
        <Text className="text-white">No active employee.</Text>
      </View>
    );
  }

  return (
    <>
      <View className="w-full p-6 bg-[#303030] rounded-2xl border border-gray-600">
        <View className="mb-6">
          <Text className="text-sm text-gray-400 text-center mb-2">
            Current Time
          </Text>
          <Text className="text-4xl font-bold text-white text-center">
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <View className="items-center mb-6">
          {user.profilePictureUrl ? (
            <Image
              source={{ uri: user.profilePictureUrl }}
              className="w-24 h-24 rounded-xl mb-4"
            />
          ) : (
            <View className="w-24 h-24 rounded-xl mb-4 bg-blue-600 items-center justify-center">
              <User color="white" size={32} />
            </View>
          )}
          <Text className="text-xl font-bold text-white text-center">
            {user.fullName}
          </Text>
          <Text className="text-sm text-gray-400 text-center">{user.id}</Text>
        </View>
        {renderContent()}
      </View>

      <PinInputModal
        isOpen={pinModalOpen}
        title={
          pinAction === "break_start"
            ? "Start Break"
            : pinAction === "break_end"
            ? "End Break"
            : "Clock Out"
        }
        subtitle="Enter your PIN to confirm"
        onConfirm={handlePinConfirm}
        onCancel={() => {
          setPinModalOpen(false);
          setPinAction(null);
        }}
      />
    </>
  );
};
export default UserProfileCard;
