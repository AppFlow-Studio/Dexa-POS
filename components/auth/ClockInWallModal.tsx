import { Href, useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
        <DialogTitle className="text-2xl font-bold text-center text-red-600">
          Action Required
        </DialogTitle>
        <DialogDescription className="text-center text-gray-600 text-lg my-4">
          You must be clocked in to perform this action.
        </DialogDescription>
        <View className="flex-row gap-2 mt-4">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGoToClockIn}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Go to Clock In</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ClockInWallModal;
