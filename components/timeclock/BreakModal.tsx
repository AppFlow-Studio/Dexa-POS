import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakModalProps {
  isOpen: boolean;
  onEndBreak: () => void;
}

const BreakModal: React.FC<BreakModalProps> = ({ isOpen, onEndBreak }) => {
  const [timer, setTimer] = useState("00m : 00s");

  const breakStartTime = useTimeclockStore((state) => state.breakStartTime);

  // Logic for a running timer would be implemented here with an interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isOpen && breakStartTime) {
      // This variable is correctly assigned here.
      interval = setInterval(() => {
        const elapsed = Date.now() - breakStartTime.getTime();
        const minutes = String(Math.floor((elapsed / 1000 / 60) % 60)).padStart(
          2,
          "0"
        );
        const seconds = String(Math.floor((elapsed / 1000) % 60)).padStart(
          2,
          "0"
        );
        setTimer(`${minutes}m : ${seconds}s`);
      }, 1000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isOpen]);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-8 rounded-2xl items-center text-center bg-white w-[550px]">
        <View className="w-20 h-20 items-center justify-center bg-blue-100 rounded-full border-4 border-blue-200">
          <Clock color="#3b82f6" size={40} />
        </View>
        <Text className="text-3xl font-bold text-gray-800 mt-4">
          Break Initiated
        </Text>
        <Text className="text-5xl font-bold text-gray-800 my-2">{timer}</Text>
        <Text className="text-gray-500">
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
          <Text className="font-bold text-white text-lg">End Break</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default BreakModal;
