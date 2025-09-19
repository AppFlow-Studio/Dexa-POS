import BreakEndedModal from "@/components/timeclock/BreakEndedModal";
import BreakModal from "@/components/timeclock/BreakModal";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { Shift, useTimeclockStore } from "@/stores/useTimeclockStore"; // 1. Import the Shift type
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
  // --- STATE FROM THE STORE ---
  // Get all necessary state and actions from the store.
  const { status, shiftHistory, endBreak } = useTimeclockStore();

  // --- LOCAL UI STATE ---
  // This state is ONLY for controlling which modal is visible.
  const [activeModal, setActiveModal] = useState<"break" | "breakEnded" | null>(
    null
  );
  // This state holds the data for the break that just ended, to pass to the modal.
  const [lastBreakSession, setLastBreakSession] = useState<Shift | null>(null);

  // --- LIFECYCLE EFFECT ---
  // This effect opens the "Break Initiated" modal when the global status changes to 'onBreak'.
  useEffect(() => {
    if (status === "onBreak") {
      setActiveModal("break");
    } else {
      // If the status is no longer 'onBreak' (e.g., clocked out), ensure the modal is closed.
      if (activeModal === "break") {
        setActiveModal(null);
      }
    }
  }, [status]);

  // --- HANDLERS ---
  const handleEndBreak = () => {
    // 1. Capture the current shift data *before* it's modified.
    const shiftForSession = useTimeclockStore.getState().currentShift;
    setLastBreakSession(shiftForSession);

    // 2. Call the store action to end the break.
    endBreak();

    // 3. Transition from the 'break' modal to the 'breakEnded' modal.
    setActiveModal("breakEnded");
  };

  const handleReturnToClockIn = () => {
    // This is called from the "Break Ended" modal. We just need to close it.
    setActiveModal(null);
    setLastBreakSession(null); // Clear the temporary session data
  };

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 p-2"
          >
            <ArrowLeft color="#9CA3AF" size={24} />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-white">Time Clock</Text>
            <Text className="text-sm text-gray-400">Track your work hours and breaks</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 p-6">
        <View className="flex-row gap-6 h-full">
          {/* User Profile Card */}
          <View className="w-80">
            <UserProfileCard />
          </View>

          {/* Shift History Table */}
          <View className="flex-1">
            <View className="bg-[#303030] rounded-2xl border border-gray-600 overflow-hidden">
              {/* Table Header */}
              <View className="flex-row p-4 bg-[#404040] border-b border-gray-600">
                {TABLE_HEADERS.map((header) => (
                  <Text
                    key={header}
                    className="flex-1 font-semibold text-sm text-gray-300"
                  >
                    {header}
                  </Text>
                ))}
              </View>

              {/* Table Body */}
              <FlatList
                data={shiftHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View className="flex-row p-4 border-b border-gray-600 last:border-b-0">
                    <Text className="flex-1 text-sm text-white">
                      {item.date}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.role}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.clockIn}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.breakInitiated}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.breakEnded}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.clockOut}
                    </Text>
                    <Text className="flex-1 text-sm text-white">
                      {item.duration}
                    </Text>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
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
        // Pass the captured shift data to the modal
        shift={lastBreakSession}
      />
    </View>
  );
};

export default TimeclockScreen;
