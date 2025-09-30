import { Shift } from "@/stores/useTimeclockStore"; // Assuming this type is in types.ts
import { Clock } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakEndedModalProps {
  isOpen: boolean;
  onClockIn: () => void;
  shift: Shift | null;
}

// Helper function to format the duration from milliseconds (can be moved to a utils file)
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) {
    return "00h : 00m : 00s";
  }
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0"
  );
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}h : ${minutes}m : ${seconds}s`;
};

const BreakEndedModal: React.FC<BreakEndedModalProps> = ({
  isOpen,
  onClockIn,
  shift,
}) => {
  // All data now comes from the `shift` object that was captured when the break ended.
  const endTime = shift?.breakEndTime || new Date();
  const startTime = shift?.breakStartTime || null;

  const durationMs =
    startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;

  const breakDetails = {
    start: startTime
      ? startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "N/A",
    end: endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    duration: formatDuration(durationMs),
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-6 rounded-2xl items-center text-center bg-[#303030] border-gray-700 w-[550px]">
        <View className="w-16 h-16 items-center justify-center bg-blue-900/30 rounded-full border-4 border-blue-500/30">
          <Clock color="#60A5FA" size={32} />
        </View>
        <Text className="text-3xl font-bold text-white mt-4">Break Ended</Text>
        <Text className="text-xl text-gray-400 mt-2 text-center">
          Break started at {breakDetails.start} and ended at {breakDetails.end}{" "}
          ({breakDetails.duration})
        </Text>
        <TouchableOpacity
          onPress={onClockIn}
          className="w-full mt-6 py-4 bg-blue-600 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-xl">Clock In</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default BreakEndedModal;
