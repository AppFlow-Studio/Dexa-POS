import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakModalProps {
  isOpen: boolean;
  onEndBreak: () => void;
}
const BREAK_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

const BreakModal: React.FC<BreakModalProps> = ({ isOpen, onEndBreak }) => {
  const [timeLeft, setTimeLeft] = useState(BREAK_DURATION_MS);
  const breakStartTime = useTimeclockStore(
    (state) => state.currentShift?.breakStartTime
  );

  useEffect(() => {
    if (isOpen && breakStartTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - breakStartTime.getTime();
        const remaining = BREAK_DURATION_MS - elapsed;
        setTimeLeft(Math.max(0, remaining));
        if (remaining <= 0) {
          clearInterval(interval);
          onEndBreak(); // Automatically end break when timer finishes
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, breakStartTime, onEndBreak]);

  const formatTime = (ms: number) => {
    const minutes = String(Math.floor((ms / 1000 / 60) % 60)).padStart(2, "0");
    const seconds = String(Math.floor((ms / 1000) % 60)).padStart(2, "0");
    return `${minutes}m : ${seconds}s`;
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-8 rounded-2xl items-center text-center bg-white w-[550px]">
        <View className="w-20 h-20 items-center justify-center bg-blue-100 rounded-full border-4 border-blue-200">
          <Clock color="#3b82f6" size={40} />
        </View>
        <Text className="text-4xl font-bold text-gray-800 mt-4">
          Break Initiated
        </Text>
        <Text className="text-5xl font-bold text-gray-800 my-2">
          {formatTime(timeLeft)}
        </Text>
        <Text className="text-2xl text-gray-500">
          Started break:
          {breakStartTime
            ? breakStartTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "..."}
        </Text>
        <TouchableOpacity
          onPress={onEndBreak}
          className="w-full mt-6 py-3 bg-primary-400 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-2xl">End Break</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default BreakModal;
