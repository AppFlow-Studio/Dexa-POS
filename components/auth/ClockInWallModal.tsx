import { Href, useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface ClockInWallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ClockInWallModal: React.FC<ClockInWallModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();

  const handleGoToClockIn = () => {
    onClose(); // Close the modal first
    router.push("/timeclock" as Href); // Navigate to the timeclock page
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-4 rounded-2xl bg-[#303030] border border-gray-700 items-center">
        <View className="w-16 h-16 bg-yellow-900/30 rounded-full items-center justify-center border-4 border-yellow-500/30 mb-3">
          <AlertTriangle color="#FBBF24" size={36} />
        </View>
        <DialogHeader className="items-center">
          <DialogTitle className="text-2xl font-bold text-center text-yellow-400">
            Action Required
          </DialogTitle>
          <DialogDescription className="text-center text-lg text-gray-300 my-3">
            You must be clocked in to perform this action.
          </DialogDescription>
        </DialogHeader>
        <View className="flex-row gap-4 mt-3 w-full">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 px-6 border border-gray-600 bg-[#212121] rounded-xl items-center"
          >
            <Text className="text-lg font-bold text-gray-300">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGoToClockIn}
            className="flex-1 py-3 px-6 bg-blue-600 rounded-xl items-center"
          >
            <Text className="text-lg font-bold text-white">Go to Clock In</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ClockInWallModal;
