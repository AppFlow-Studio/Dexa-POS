import { Clock } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakEndedModalProps {
  isOpen: boolean;
  onClockIn: () => void; // This will close the modal and set the status
  startTime: Date | null;
}

// Helper function to format the duration from milliseconds
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
  startTime,
}) => {
  const endTime = new Date(); // Capture the end time when the component renders

  // Calculate the duration in milliseconds
  const durationMs = startTime ? endTime.getTime() - startTime.getTime() : 0;

  // In a real app, this data would be passed in as props
  const breakDetails = {
    start: startTime ? startTime.toLocaleTimeString() : "N/A",
    end: new Date().toLocaleTimeString(),
    duration: formatDuration(durationMs),
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-8 rounded-2xl items-center text-center bg-white w-[550px]">
        <View className="w-20 h-20 items-center justify-center bg-blue-100 rounded-full border-4 border-blue-200">
          <Clock color="#3b82f6" size={40} />
        </View>
        <Text className="text-3xl font-bold text-gray-800 mt-4">
          Break Ended
        </Text>
        <Text className="text-gray-500 mt-2 text-center">
          Started break: {breakDetails.start}, Break Ended {breakDetails.end} (
          {breakDetails.duration})
        </Text>
        <TouchableOpacity
          onPress={onClockIn}
          className="w-full mt-6 py-3 bg-primary-400 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-lg">Clock In</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default BreakEndedModal;
