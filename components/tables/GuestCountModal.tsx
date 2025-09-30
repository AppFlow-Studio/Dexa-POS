import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface GuestCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (guestCount: number) => void;
}

export const GuestCountModal: React.FC<GuestCountModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [count, setCount] = useState("1");

  const handleSubmit = () => {
    const guestCount = parseInt(count, 10);
    if (!isNaN(guestCount) && guestCount > 0) {
      onSubmit(guestCount);
      setCount("1"); // Reset for next time
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[450px] p-6">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl text-center font-semibold">
            Enter Number of Guests
          </DialogTitle>
        </DialogHeader>
        <View className="py-4">
          <TextInput
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            className="bg-[#212121] border border-gray-600 rounded-lg text-3xl text-white text-center font-bold h-16"
            autoFocus
            maxLength={3}
          />
        </View>
        <DialogFooter className="flex-row gap-3">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 bg-[#212121] border border-gray-600 rounded-lg"
          >
            <Text className="text-center text-xl font-bold text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSubmit}
            className="flex-1 py-3 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-xl font-bold text-white">
              Start Order
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
