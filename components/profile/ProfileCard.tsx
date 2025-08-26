import { MOCK_USER_PROFILE } from "@/lib/mockData";
import { useTimeclockStore } from "@/stores/useTimeclockStore"; // 1. Import the timeclock store
import { Clock, Timer } from "lucide-react-native";
import React, { useEffect, useState } from "react"; // Import hooks
import { Image, Text, TouchableOpacity, View } from "react-native";

// Helper function to format the duration from milliseconds (can be moved to a utils file)
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

const ProfileCard = () => {
  const user = MOCK_USER_PROFILE;

  // 2. Get the live timeclock state and actions from the store
  const { status, clockInTime, clockIn, clockOut } = useTimeclockStore();
  const [shiftDuration, setShiftDuration] = useState("0 h 00 m");

  // 3. Effect to update the duration timer every second, but only if clocked in
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === "clockedIn" && clockInTime) {
      interval = setInterval(() => {
        const durationMs = new Date().getTime() - clockInTime.getTime();
        setShiftDuration(formatDuration(durationMs));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, clockInTime]);

  const renderShiftStatus = () => {
    if (status === "clockedIn" || status === "onBreak") {
      return (
        <View className="w-full mt-4 p-4 border border-gray-200 rounded-lg">
          <View className="flex-row justify-between items-center">
            <Text className="font-bold text-gray-700">Shift Status</Text>
            <View className="px-2 py-1 bg-green-100 rounded-md">
              <Text className="font-bold text-xs text-green-800">
                • Clock In
              </Text>
            </View>
          </View>
          <View className="mt-3 space-y-2">
            <View className="flex-row items-center">
              <Timer color="#6b7280" size={16} />
              <Text className="ml-2 text-gray-600">
                Duration : {shiftDuration}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Clock color="#6b7280" size={16} />
              <Text className="ml-2 text-gray-600">
                Clock in at :{" "}
                {clockInTime?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) || "..."}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={clockOut}
            className="w-full mt-4 py-2.5 bg-red-500 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Clock Out</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // If clockedOut, show a simple Clock In button or nothing, depending on design
    return (
      <View className="w-full mt-4 p-4 items-center">
        <TouchableOpacity
          onPress={clockIn}
          className="w-full py-3 bg-primary-400 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-lg">Clock In</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="w-80 p-4 rounded-2xl items-center bg-white border border-gray-200">
      <Image
        source={require("@/assets/images/tom_hardy.jpg")}
        className="w-24 h-24 rounded-2xl"
      />
      <Text className="text-xl font-bold text-gray-800 mt-4">
        {user.fullName}
      </Text>
      <Text className="text-sm text-gray-500">{user.employeeId}</Text>
      {renderShiftStatus()}
    </View>
  );
};

export default ProfileCard;
