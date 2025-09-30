import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import BreakEndedModal from "@/components/timeclock/BreakEndedModal";
import BreakModal from "@/components/timeclock/BreakModal";
import UserProfileCard from "@/components/timeclock/UserProfileCard";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
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
  const {
    status,
    shiftHistory,
    endBreak,
    clockIn: tcClockIn,
    clockOut: tcClockOut,
  } = useTimeclockStore();
  const { employees, loadMockEmployees, clockIn, clockOut, activeEmployeeId } =
    useEmployeeStore();

  // --- LOCAL UI STATE ---
  // This state is ONLY for controlling which modal is visible.
  const [activeModal, setActiveModal] = useState<"break" | "breakEnded" | null>(
    null
  );
  // This state holds the data for the break that just ended, to pass to the modal.
  const [lastBreakSession, setLastBreakSession] = useState<Shift | null>(null);
  // PIN modal for employee clock in/out
  const [pinModal, setPinModal] = useState<{
    visible: boolean;
    employeeId: string | null;
    pin: string;
    mode: "in" | "out";
    error?: string;
  }>({ visible: false, employeeId: null, pin: "", mode: "in" });
  const MAX_PIN_LENGTH = 4;
  const handlePinKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pinModal.pin.length < MAX_PIN_LENGTH) {
        setPinModal((p) => ({
          ...p,
          pin: p.pin + String(input),
          error: undefined,
        }));
      }
    } else if (input === "backspace") {
      setPinModal((p) => ({ ...p, pin: p.pin.slice(0, -1), error: undefined }));
    } else if (input === "clear") {
      setPinModal((p) => ({ ...p, pin: "", error: undefined }));
    }
  };
  // Collapsible employees list
  const [employeesCollapsed, setEmployeesCollapsed] = useState(false);

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

  // Load employees once
  useEffect(() => {
    loadMockEmployees(8);
  }, []);

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
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2">
            <ArrowLeft color="#9CA3AF" size={22} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-white">Time Clock</Text>
            <Text className="text-sm text-gray-400">
              Track your work hours and breaks
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-1 p-4">
        <View className="flex-row gap-4 h-full">
          {activeEmployeeId && (
            <View className="w-80">
              <UserProfileCard />
            </View>
          )}

          <View className="flex-1">
            <View className="bg-[#303030] rounded-xl border border-gray-600 mb-4">
              <TouchableOpacity
                onPress={() => setEmployeesCollapsed((v) => !v)}
                className="flex-row items-center justify-between p-3 border-b border-gray-600"
              >
                <Text className="text-white text-lg font-bold">
                  Employees {employeesCollapsed ? "▸" : "▾"}
                </Text>
                <Text className="text-gray-400 text-sm">
                  {employees.length} total
                </Text>
              </TouchableOpacity>
              {!employeesCollapsed && (
                <View>
                  {employees.map((emp) => (
                    <View
                      key={emp.id}
                      className="flex-row items-center justify-between p-3 border-b border-gray-600 last:border-b-0"
                    >
                      <View className="flex-row items-center gap-2">
                        <View className="w-8 h-8 rounded-full bg-gray-700 items-center justify-center">
                          <Text className="text-white text-xs">
                            {emp.fullName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </Text>
                        </View>
                        <View>
                          <Text className="text-white text-base font-semibold">
                            {emp.fullName}
                          </Text>
                          <Text
                            className={`text-xs ${emp.shiftStatus === "clocked_in" ? "text-green-400" : "text-gray-400"}`}
                          >
                            {emp.shiftStatus === "clocked_in"
                              ? `Clocked In • ${emp.clockInAt ? new Date(emp.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`
                              : "Clocked Out"}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row gap-2">
                        {emp.shiftStatus === "clocked_in" ? (
                          <TouchableOpacity
                            onPress={() =>
                              setPinModal({
                                visible: true,
                                employeeId: emp.id,
                                pin: "",
                                mode: "out",
                              })
                            }
                            className="px-3 py-2 bg-red-600 rounded-lg border border-red-500"
                          >
                            <Text className="text-white text-sm font-semibold">
                              Clock Out
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() =>
                              setPinModal({
                                visible: true,
                                employeeId: emp.id,
                                pin: "",
                                mode: "in",
                              })
                            }
                            className="px-3 py-2 bg-blue-600 rounded-lg border border-blue-500"
                          >
                            <Text className="text-white text-sm font-semibold">
                              Clock In
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                  {employees.length === 0 && (
                    <View className="p-3">
                      <Text className="text-gray-400 text-sm">
                        No employees loaded.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View className="flex-1 bg-[#303030] rounded-xl border border-gray-600 overflow-hidden">
              <View className="flex-row p-3 bg-[#404040] border-b border-gray-600">
                {TABLE_HEADERS.map((header) => (
                  <Text
                    key={header}
                    className="flex-1 font-semibold text-xs text-gray-300"
                  >
                    {header}
                  </Text>
                ))}
              </View>
              <FlatList
                data={shiftHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View className="flex-row p-3 border-b border-gray-700 last:border-b-0">
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

      <Dialog
        open={pinModal.visible}
        onOpenChange={(v) => setPinModal((prev) => ({ ...prev, visible: v }))}
      >
        <DialogContent>
          <View className="w-96 rounded-2xl p-6 bg-[#2b2b2b] border border-gray-600">
            <Text className="text-white text-xl font-bold mb-4">Enter PIN</Text>
            <Text className="text-gray-300 mb-2">
              Employee:{" "}
              {employees.find((e) => e.id === pinModal.employeeId)?.fullName ||
                "—"}
            </Text>
            <PinDisplay
              pinLength={pinModal.pin.length}
              maxLength={MAX_PIN_LENGTH}
            />
            <PinNumpad onKeyPress={handlePinKeyPress} />
            {pinModal.error && (
              <Text className="text-red-400 mt-2 text-center">
                {pinModal.error}
              </Text>
            )}
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity
                onPress={() =>
                  setPinModal({
                    visible: false,
                    employeeId: null,
                    pin: "",
                    mode: "in",
                  })
                }
                className="flex-1 py-3 rounded-lg border border-gray-600 items-center"
              >
                <Text className="text-gray-300 text-base font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const emp = employees.find(
                    (e) => e.id === pinModal.employeeId
                  );
                  if (!emp) return;
                  if (pinModal.pin === emp.pin) {
                    if (pinModal.mode === "in") {
                      clockIn(emp.id);
                      tcClockIn();
                    } else {
                      clockOut(emp.id);
                      tcClockOut();
                    }
                    setPinModal({
                      visible: false,
                      employeeId: null,
                      pin: "",
                      mode: "in",
                    });
                  } else {
                    setPinModal((p) => ({
                      ...p,
                      error: "Incorrect PIN. Please try again.",
                    }));
                  }
                }}
                className="flex-1 py-3 rounded-lg bg-blue-600 border border-blue-500 items-center"
              >
                <Text className="text-white text-base font-semibold">
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default TimeclockScreen;
