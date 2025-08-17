import BreakEndedModal from "@/components/timeclock/BreakEndedModal"; // 1. Import the new modal
import BreakModal from "@/components/timeclock/BreakModal";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { MOCK_SHIFT_HISTORY } from "@/lib/mockData";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const TABLE_HEADERS = [
  "Date",
  "Role",
  "Clock In",
  "Break In",
  "Break Out",
  "Clock Out",
  "Duration",
];

const TimeclockScreen = () => {
  const [clockStatus, setClockStatus] = useState<
    "clockedOut" | "clockedIn" | "onBreak"
  >("clockedOut");

  // 2. State to manage which modal is visible
  const [activeModal, setActiveModal] = useState<"break" | "breakEnded" | null>(
    null
  );

  const handleClockIn = () => setClockStatus("clockedIn");
  const handleClockOut = () => setClockStatus("clockedOut");

  const handleStartBreak = () => {
    setClockStatus("onBreak");
    setActiveModal("break"); // Open the "Break Initiated" modal
  };

  const handleEndBreak = () => {
    // When the break ends, close the first modal and open the second one
    setActiveModal("breakEnded");
  };

  const handleReturnToClockIn = () => {
    // This is called from the "Break Ended" modal
    setActiveModal(null); // Close all modals
    setClockStatus("clockedIn"); // Set the status back to clocked in
  };

  return (
    <View className="flex-1 bg-background-100 p-6">
      <View className="flex-row items-center my-4">
        <TouchableOpacity
          className="p-2 flex-row items-center gap-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} />
          <Text className="text-2xl font-semibold text-accent-500">
            Clock In/Out
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 flex-row gap-6">
        <UserProfileCard
          status={clockStatus}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          onStartBreak={handleStartBreak}
        />

        <View className="flex-1">
          <View className="flex-1 border border-gray-200 rounded-xl">
            {/* Table Header */}
            <View className="flex-row p-4 bg-gray-50 rounded-t-xl border-b border-gray-200">
              {TABLE_HEADERS.map((header) => (
                <Text
                  key={header}
                  className="flex-1 font-bold text-sm text-gray-500"
                >
                  {header}
                </Text>
              ))}
            </View>
            {/* Table Body */}
            <FlatList
              data={MOCK_SHIFT_HISTORY}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className="flex-row p-4 border-b border-gray-100">
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.date}
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    Chef
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.clockIn}
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.breakInitiated}
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.breakEnded}
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.clockOut}
                  </Text>
                  <Text className="flex-1 font-semibold text-gray-700">
                    {item.duration}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </View>

      {/* --- Modals --- */}
      <BreakModal
        isOpen={activeModal === "break"}
        onEndBreak={handleEndBreak}
      />
      <BreakEndedModal
        isOpen={activeModal === "breakEnded"}
        onClockIn={handleReturnToClockIn}
      />
    </View>
  );
};

export default TimeclockScreen;
