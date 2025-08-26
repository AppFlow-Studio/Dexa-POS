import BreakEndedModal from "@/components/timeclock/BreakEndedModal"; // 1. Import the new modal
import BreakModal from "@/components/timeclock/BreakModal";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { MOCK_SHIFT_HISTORY } from "@/lib/mockData";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useEffect, useState } from "react";
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
  // Get all state and actions from the Zustand store
  const { status, clockIn, clockOut, startBreak, endBreak, breakStartTime } =
    useTimeclockStore();

  // The modal state is now simpler
  const [isBreakModalOpen, setBreakModalOpen] = useState(false);
  const [isBreakEndedModalOpen, setBreakEndedModalOpen] = useState(false);
  const [breakSessionStartTime, setBreakSessionStartTime] =
    useState<Date | null>(null);

  // This effect opens the break modal when the global status changes to 'onBreak'
  useEffect(() => {
    if (status === "onBreak") {
      setBreakModalOpen(true);
    } else {
      setBreakModalOpen(false);
    }
  }, [status]);

  const handleEndBreak = () => {
    // 2. Before clearing the store, capture the current `breakStartTime`.
    const startTimeForSession = useTimeclockStore.getState().breakStartTime;
    setBreakSessionStartTime(startTimeForSession);

    // 3. Now, call the action that clears the value in the store.
    endBreak();

    // 4. Proceed with the modal transition.
    setBreakModalOpen(false);
    setBreakEndedModalOpen(true);
  };

  const handleReturnToClockIn = () => {
    setBreakEndedModalOpen(false);
    // Reset our temporary state variable
    setBreakSessionStartTime(null);
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
          status={status}
          onClockIn={clockIn}
          onClockOut={clockOut}
          onStartBreak={startBreak}
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
      <BreakModal isOpen={isBreakModalOpen} onEndBreak={handleEndBreak} />
      <BreakEndedModal
        isOpen={isBreakEndedModalOpen}
        onClockIn={handleReturnToClockIn}
        // Pass the start time to the modal for display
        startTime={breakSessionStartTime}
      />
    </View>
  );
};

export default TimeclockScreen;
