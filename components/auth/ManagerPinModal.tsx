import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import React, { useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import PinDisplay from "./PinDisplay";
import PinNumpad from "./PinNumpad";

const ManagerPinModal = () => {
  const { isPinModalOpen, closePinModal, actionToPerform } =
    usePinOverrideStore();
  const { addTemporaryMenuAccess, addTemporaryCategoryAccess } = useMenuStore();
  const [currentPin, setCurrentPin] = useState("");

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

  const handlePinSubmit = () => {
    // In a real app, this would be a secure check.
    if (currentPin === "1234") {
      if (actionToPerform) {
        if (actionToPerform.type === "select_menu") {
          addTemporaryMenuAccess(actionToPerform.payload.menuName);
        } else if (actionToPerform.type === "select_category") {
          addTemporaryCategoryAccess(actionToPerform.payload.categoryName);
        }
      }
      toast.success("Access Granted", { position: ToastPosition.BOTTOM });
      closePinModal();
    } else {
      // Trigger shake animation for wrong PIN
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      toast.error("Invalid PIN", { position: ToastPosition.BOTTOM });
    }
    setCurrentPin("");
  };

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }],
    };
  });

  return (
    <Dialog open={isPinModalOpen} onOpenChange={closePinModal}>
      <DialogContent className="w-fit h-fit bg-[#303030] border-gray-600 p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold text-white">
            Manager Override
          </DialogTitle>
        </DialogHeader>
        <Animated.View style={shakeStyle} className="py-4">
          <Text className="text-center text-lg text-gray-300 mb-4">
            Enter Manager PIN to access this item
          </Text>
          <PinDisplay pinLength={currentPin.length} maxLength={4} />
          <PinNumpad
            onKeyPress={(input) => {
              if (typeof input === "number") {
                if (currentPin.length < 4) {
                  const newPin = currentPin + input.toString();
                  setCurrentPin(newPin);
                }
              } else if (input === "clear") {
                setCurrentPin("");
              } else if (input === "backspace") {
                setCurrentPin(currentPin.slice(0, -1));
              }
            }}
          />
          <TouchableOpacity
            onPress={handlePinSubmit}
            className="py-3 bg-blue-600 rounded-lg w-full self-center mt-4"
          >
            <Text className="text-center text-lg font-bold text-white">
              Enter
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerPinModal;
