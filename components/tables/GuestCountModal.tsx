import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import GuestCountNumpad from "./GuestCountNumpad";

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

  const handleInput = (value: string) => {
    // Clear all
    if (value === "clear") {
      setCount("1");
      return;
    }

    // Backspace behavior
    if (value === "backspace") {
      if (count.length <= 1) {
        setCount("1");
      } else {
        setCount(count.slice(0, -1));
      }
      return;
    }

    // Number input 0-9
    const isDigit = /^[0-9]$/.test(value);
    if (isDigit) {
      // If current count is "1" and we're adding a digit, replace it
      if (count === "1") {
        setCount(value);
      } else {
        // Limit to 3 digits max
        if (count.length < 3) {
          setCount(count + value);
        }
      }
    }
  };

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
          <View className="bg-[#212121] border border-gray-600 rounded-lg p-4 mb-4">
            <Text className="text-center text-4xl font-bold text-white">{count}</Text>
          </View>
          <GuestCountNumpad onKeyPress={handleInput} />
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
