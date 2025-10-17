import { MOCK_SHIFTS } from "@/lib/mockData";
import { Shift } from "@/lib/types";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const OpenShiftCard = ({ shift }: { shift: Shift }) => (
  <View className="p-4 bg-[#303030] rounded-2xl border border-gray-700">
    <View className="flex-row justify-between items-start">
      <View>
        <Text className="text-lg font-semibold text-white mb-1">
          {shift.role}
        </Text>
        <Text className="text-sm text-gray-400">
          {shift.startTime} - {shift.endTime}
        </Text>
      </View>
      <Text className="text-lg font-bold text-blue-400">95% Match</Text>
    </View>
    <TouchableOpacity className="mt-4 py-2 bg-blue-600 rounded-lg items-center">
      <Text className="font-bold text-white">Pick Up Shift</Text>
    </TouchableOpacity>
  </View>
);

const OpenShiftsScreen = () => {
  // Filter for shifts that are available to be picked up
  const openShifts = MOCK_SHIFTS.filter((shift) => shift.status === "dropped");

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
      >
        {openShifts.map((shift) => (
          <OpenShiftCard key={shift.id} shift={shift} />
        ))}
      </ScrollView>
    </View>
  );
};

export default OpenShiftsScreen;
