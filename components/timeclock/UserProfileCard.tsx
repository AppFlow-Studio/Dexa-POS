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
          <View className="w-full mt-4 p-6 border border-gray-700 rounded-lg">
            <View className="flex-row justify-between items-center">
              <Text className="text-2xl font-bold text-white">
                Shift Status
              </Text>
              <View className="px-3 py-2 bg-[#D5EFE3] rounded-md">
                <Text className="font-bold text-xl text-green-800">
                  • {status === "onBreak" ? "On Break" : "Clocked In"}
                </Text>
              </View>
            </View>
            <View className="mt-3 space-y-2">
              <View className="flex-row items-center">
                <Timer className="text-gray-300" size={20} />
                <Text className="text-xl ml-2 text-gray-300">
                  Duration :
                  <Text className="text-accent-600 font-medium text-2xl">
                    {shiftDuration}
                  </Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock className="text-gray-300" size={20} />
                <Text className="text-xl ml-2 text-neutral-600">
                  Clock in at :
                  <Text className="text-accent-600 font-medium text-2xl">
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
                className={`py-3 border rounded-xl items-center ${
                  status === "onBreak" || currentShift?.hasTakenBreak
                    ? "bg-gray-700 border-gray-600"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-bold text-2xl ${
                    status === "onBreak" || currentShift?.hasTakenBreak
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
                className="py-3 bg-red-500 rounded-lg items-center"
              >
                <Text className="font-bold text-white text-2xl">Clock Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "clockedOut":
      default:
        return (
          <View className="w-full mt-4 p-6 items-center bg-[#303030] rounded-lg border border-gray-700">
            <View className="flex-row justify-between items-center w-full mb-4">
              <Text className="text-2xl font-bold text-white">
                Shift Status
              </Text>
              <View className="px-3 py-2 rounded-md bg-gray-700">
                <Text className="font-bold text-xl text-gray-200">
                  • Not Clocked In
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={clockIn}
              className="w-full py-4 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white text-2xl">Clock In</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View className="w-80 p-6 bg-[#212121] rounded-3xl justify-between">
      <View className="mb-4">
        <Text className="text-xl text-gray-300 text-center">Current Time</Text>{" "}
        {/* Changed color */}
        <Text className="text-5xl font-bold text-white text-center">
          {" "}
          {/* Changed color */}
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
            className="w-32 h-32 rounded-2xl"
          />
          <Text className="text-3xl font-bold text-white mt-4">
            {" "}
            {/* Changed color */}
            {MOCK_USER_PROFILE.fullName}
          </Text>
          <Text className="text-xl text-gray-300">
            {" "}
            {/* Changed color */}
            {MOCK_USER_PROFILE.employeeId}
          </Text>
        </View>
        {renderContent()}
      </View>
    </View>
  );
};

export default UserProfileCard;
