import { MOCK_SHIFT_STATUS, MOCK_USER_PROFILE } from "@/lib/mockData";
import { Clock, Timer } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const ProfileCard = () => {
  const user = MOCK_USER_PROFILE;
  const shift = MOCK_SHIFT_STATUS;

  return (
    <View className="w-80 p-4 rounded-2xl items-center">
      <Image
        source={require("@/assets/images/tom_hardy.jpg")}
        className="w-24 h-24 rounded-2xl"
      />
      <Text className="text-xl font-bold text-gray-800 mt-4">
        {user.fullName}
      </Text>
      <Text className="text-sm text-gray-500">{user.employeeId}</Text>

      <View className="w-full mt-4 p-4 border border-gray-200 rounded-lg">
        <View className="flex-row justify-between items-center">
          <Text className="font-bold text-gray-700">Shift Status</Text>
          <View className="px-2 py-1 bg-green-100 rounded-md">
            <Text className="font-bold text-xs text-green-800">• Clock In</Text>
          </View>
        </View>
        <View className="flex-row items-center mt-3">
          <Timer color="#6b7280" size={16} />
          <Text className="ml-2 text-gray-600">
            Duration : {shift.duration}
          </Text>
        </View>
        <View className="flex-row items-center mt-2">
          <Clock color="#6b7280" size={16} />
          <Text className="ml-2 text-gray-600">
            Clock in at : {shift.clockInTime}
          </Text>
        </View>
        <TouchableOpacity className="w-full mt-4 py-2.5 bg-red-500 rounded-lg items-center">
          <Text className="font-bold text-white">Clock Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ProfileCard;
