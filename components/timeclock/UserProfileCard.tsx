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
          <View className="w-full mt-4 p-4 border border-background-400 bg-white rounded-lg">
            <View className="flex-row justify-between items-center">
              <Text className="font-bold text-accent-600">Shift Status</Text>
              <View className="px-2 py-1 bg-[#D5EFE3] rounded-md">
                <Text className="font-bold text-xs text-green-800">
                  • {status === "onBreak" ? "On Break" : "Clocked In"}
                </Text>
              </View>
            </View>
            <View className="mt-3 gap-y-2">
              <View className="flex-row items-center">
                <Timer className="text-accent-600" size={16} />
                <Text className="ml-2 text-neutral-600">
                  Duration :
                  <Text className="text-accent-600 font-medium">
                    {" "}
                    {shiftDuration}
                  </Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock className="text-accent-600" size={16} />
                <Text className="ml-2 text-neutral-600">
                  Clock in at :{" "}
                  <Text className="text-accent-600 font-medium">
                    {currentShift?.clockInTime?.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }) || "..."}
                  </Text>
                </Text>
              </View>
            </View>
            <View className="flex flex-col gap-y-2 mt-4">
              <TouchableOpacity
                onPress={startBreak}
                // Disable the button if a break has been taken or the user is currently on break
                disabled={status === "onBreak" || currentShift?.hasTakenBreak}
                className={`py-2.5 border rounded-xl items-center ${
                  status === "onBreak" || currentShift?.hasTakenBreak
                    ? "bg-gray-100 border-gray-200"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-bold ${
                    status === "onBreak" || currentShift?.hasTakenBreak
                      ? "text-gray-400"
                      : "text-gray-700"
                  }`}
                >
                  {currentShift?.hasTakenBreak
                    ? "Break Taken"
                    : "Start a Break"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clockOut}
                className="py-2.5 bg-red-500 rounded-xl items-center"
              >
                <Text className="font-bold text-white">Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "clockedOut":
      default:
        return (
          <View className="w-full mt-4 p-4 items-center bg-white rounded-lg">
            <View className="flex-row justify-between items-center w-full mb-4">
              <Text className="font-bold text-accent-600">Shift Status</Text>
              <View className="px-2 py-1 rounded-md bg-background-300">
                <Text className="font-bold text-xs text-background-600">
                  • Not Clocked In
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={clockIn}
              className="w-full py-3 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white text-lg">Clock In</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View className="w-80 p-6 bg-background-200 rounded-3xl justify-between">
      <View className="mb-4">
        <Text className="text-gray-500 text-center">Current Time</Text>
        <Text className="text-3xl font-bold text-gray-800 text-center">
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <View>
        <View className="items-center">
          <Image
            source={require("@/assets/images/tom_hardy.jpg")}
            className="w-24 h-24 rounded-2xl"
          />
          <Text className="text-xl font-bold text-gray-800 mt-4">
            {MOCK_USER_PROFILE.fullName}
          </Text>
          <Text className="text-sm text-gray-500">
            {MOCK_USER_PROFILE.employeeId}
          </Text>
        </View>
        {renderContent()}
      </View>
    </View>
  );
};

export default UserProfileCard;
