import { MOCK_USER_PROFILE } from "@/lib/mockData";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock, Timer } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

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

// This component is now self-sufficient and doesn't require any props.
const UserProfileCard: React.FC = () => {
  // --- STATE FROM THE STORE ---
  // Get all necessary state and actions directly from our single source of truth.
  const { status, currentShift, clockIn, clockOut, startBreak } =
    useTimeclockStore();

  // --- LOCAL UI STATE ---
  const [currentTime, setCurrentTime] = useState(new Date());
  const [shiftDuration, setShiftDuration] = useState("0 h 00 m");

  // Effect to manage all live timers (current time and shift duration)
  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
      // Only calculate duration if a shift is active
      if (currentShift?.clockInTime) {
        const durationMs =
          new Date().getTime() - currentShift.clockInTime.getTime();
        setShiftDuration(formatDuration(durationMs));
      }
    }, 1000);
    return () => clearInterval(timerId);
  }, [currentShift]);

  const renderContent = () => {
    switch (status) {
      case "clockedIn":
      case "onBreak":
        return (
          <View className="w-full p-4 bg-[#404040] rounded-xl border border-gray-600">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-white">
                Shift Status
              </Text>
              <View className="px-3 py-1 bg-green-600/20 border border-green-500/30 rounded-lg">
                <Text className="font-semibold text-sm text-green-400">
                  • {status === "onBreak" ? "On Break" : "Clocked In"}
                </Text>
              </View>
            </View>

            <View className="space-y-3 mb-4">
              <View className="flex-row items-center">
                <Timer color="#9CA3AF" size={16} />
                <Text className="text-sm ml-2 text-gray-300">
                  Duration: <Text className="text-blue-400 font-semibold">{shiftDuration}</Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock color="#9CA3AF" size={16} />
                <Text className="text-sm ml-2 text-gray-300">
                  Clock in at: <Text className="text-blue-400 font-semibold">
                    {currentShift?.clockInTime?.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }) || "..."}
                  </Text>
                </Text>
              </View>
            </View>

            <View className="space-y-3">
              <TouchableOpacity
                onPress={startBreak}
                disabled={status === "onBreak" || currentShift?.hasTakenBreak}
                className={`py-3 px-4 rounded-xl items-center ${status === "onBreak" || currentShift?.hasTakenBreak
                  ? "bg-gray-600/50 border border-gray-500"
                  : "bg-blue-600 border border-blue-500"
                  }`}
              >
                <Text
                  className={`font-semibold text-sm ${status === "onBreak" || currentShift?.hasTakenBreak
                    ? "text-gray-400"
                    : "text-white"
                    }`}
                >
                  {currentShift?.hasTakenBreak
                    ? "Break Taken"
                    : "Start a Break"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clockOut}
                className="py-3 px-4 bg-red-600 border border-red-500 rounded-xl items-center"
              >
                <Text className="font-semibold text-sm text-white">Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "clockedOut":
      default:
        return (
          <View className="w-full p-4 bg-[#404040] rounded-xl border border-gray-600">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-white">
                Shift Status
              </Text>
              <View className="px-3 py-1 bg-gray-600/50 border border-gray-500 rounded-lg">
                <Text className="font-semibold text-sm text-gray-300">
                  • Not Clocked In
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={clockIn}
              className="w-full py-3 px-4 bg-blue-600 border border-blue-500 rounded-xl items-center"
            >
              <Text className="font-semibold text-sm text-white">Clock In</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View className="w-full p-6 bg-[#303030] rounded-2xl border border-gray-600">
      <View className="mb-6">
        <Text className="text-sm text-gray-400 text-center mb-2">Current Time</Text>
        <Text className="text-4xl font-bold text-white text-center">
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      <View className="items-center mb-6">
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          className="w-24 h-24 rounded-xl mb-4"
        />
        <Text className="text-xl font-bold text-white text-center">
          {MOCK_USER_PROFILE.fullName}
        </Text>
        <Text className="text-sm text-gray-400 text-center">
          {MOCK_USER_PROFILE.employeeId}
        </Text>
      </View>

      {renderContent()}
    </View>
  );
};

export default UserProfileCard;
