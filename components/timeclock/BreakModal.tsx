import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeClockStore } from "@/stores/useTimeClock";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useRouter } from "expo-router";
import { Clock, LogOut } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakModalProps {
  isOpen: boolean;
  onEndBreak: () => void;
}

const BreakModal: React.FC<BreakModalProps> = ({ isOpen, onEndBreak }) => {
  const router = useRouter();
  const breakDurationMinutes = useStoreSettingsStore((s) => s.breakDurationMinutes);
  const isBreakAndSwitchEnabled = useStoreSettingsStore((s) => s.isBreakAndSwitchEnabled);
  const BREAK_DURATION_MS = breakDurationMinutes * 60 * 1000;
  const [timeLeft, setTimeLeft] = useState(BREAK_DURATION_MS);

  // Get the functions and state needed from the timeclock store
  const { startBreak, activeEmployeeId, getSession } = useTimeclockStore();
  // Also check the new store for break start time
  const newBreakStartTime = useTimeClockStore((state) => state.breakStartTime);

  // Get the specific session for the currently active employee
  const activeSession = useMemo(() => {
    if (!activeEmployeeId) return null;
    return getSession(activeEmployeeId);
  }, [activeEmployeeId, getSession, isOpen]); // Rerun when isOpen changes

  // Use break start time from new store if available, otherwise from old store
  const breakStartTime = newBreakStartTime
    ? new Date(newBreakStartTime)
    : activeSession?.breakStartTime;
  // --- END OF CORRECTION ---

  // This handler is now correct. It calls the store action which handles the logic.
  const handleSwitchAccount = () => {
    startBreak();
    router.replace("/pin-login");
  };

  useEffect(() => {
    if (isOpen && breakStartTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - new Date(breakStartTime).getTime();
        const remaining = BREAK_DURATION_MS - elapsed;
        setTimeLeft(Math.max(0, remaining));
        if (remaining <= 0) {
          clearInterval(interval);
          onEndBreak();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, breakStartTime, onEndBreak, BREAK_DURATION_MS]);

  const formatTime = (ms: number) => {
    const minutes = String(Math.floor((ms / 1000 / 60) % 60)).padStart(2, "0");
    const seconds = String(Math.floor((ms / 1000) % 60)).padStart(2, "0");
    return `${minutes}m : ${seconds}s`;
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-6 rounded-2xl items-center text-center bg-[#303030] border-gray-700 w-[550px]">
        <View className="w-16 h-16 items-center justify-center bg-blue-900/30 rounded-full border-4 border-blue-500/30">
          <Clock color="#60A5FA" size={32} />
        </View>
        <Text className="text-3xl font-bold text-white mt-4">On Break</Text>
        <Text className="text-4xl font-bold text-white my-2">
          {formatTime(timeLeft)}
        </Text>
        <Text className="text-xl text-gray-400">
          Started break:{" "}
          {breakStartTime
            ? new Date(breakStartTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "..."}
        </Text>
        <TouchableOpacity
          onPress={onEndBreak}
          className="w-full mt-6 py-4 bg-blue-600 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-xl">End Break</Text>
        </TouchableOpacity>
        {isBreakAndSwitchEnabled && (
          <TouchableOpacity
            onPress={handleSwitchAccount}
            className="w-full mt-3 py-4 bg-gray-600 rounded-lg flex-row items-center justify-center gap-2"
          >
            <LogOut size={20} color="white" />
            <Text className="font-bold text-white text-xl">Switch Account</Text>
          </TouchableOpacity>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BreakModal;
