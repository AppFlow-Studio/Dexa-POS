import { MOCK_SHIFT_STATUS, MOCK_USER_PROFILE } from "@/lib/mockData";
import { Clock, Timer } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

type ClockStatus = "clockedOut" | "clockedIn" | "onBreak";

interface UserProfileCardProps {
  status: ClockStatus;
  onClockIn: () => void;
  onClockOut: () => void;
  onStartBreak: () => void;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({
  status,
  onClockIn,
  onClockOut,
  onStartBreak,
}) => {
  const user = MOCK_USER_PROFILE;
  const shift = MOCK_SHIFT_STATUS; // Using mock data for display

  const renderContent = () => {
    switch (status) {
      case "clockedIn":
        return (
          <View className="w-full mt-4 p-4 border border-background-400 bg-white rounded-lg">
            <View className="flex-row justify-between items-center">
              <Text className="font-bold text-accent-600">Shift Status</Text>
              <View className="px-2 py-1 bg-[#D5EFE3] rounded-md">
                <Text className="font-bold text-xs text-green-800">
                  • Clock In
                </Text>
              </View>
            </View>
            <View className="mt-3 gap-y-2">
              <View className="flex-row items-center">
                <Timer className="text-accent-600" size={16} />
                <Text className="ml-2 text-neutral-600">
                  Duration :{" "}
                  <Text className="text-accent-600 font-medium">
                    {shift.duration}
                  </Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock className="text-accent-600" size={16} />
                <Text className="ml-2 text-neutral-600">
                  Clock in at :{" "}
                  <Text className="text-accent-600 font-medium">
                    {shift.clockInTime}
                  </Text>
                </Text>
              </View>
            </View>
            <View className="flex flex-col gap-y-2 mt-4">
              <TouchableOpacity
                onPress={onStartBreak}
                className="py-2.5 border border-gray-300 rounded-xl items-center"
              >
                <Text className="font-bold text-gray-700">Start a Break</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClockOut}
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
                  • Not Counted
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClockIn}
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
          10:56 AM
        </Text>
      </View>
      <View>
        <View className="items-center">
          <Image
            source={require("@/assets/images/tom_hardy.jpg")}
            className="w-24 h-24 rounded-2xl"
          />
          <Text className="text-xl font-bold text-gray-800 mt-4">
            {user.fullName}
          </Text>
          <Text className="text-sm text-gray-500">{user.employeeId}</Text>
        </View>
        {renderContent()}
      </View>
    </View>
  );
};

export default UserProfileCard;
