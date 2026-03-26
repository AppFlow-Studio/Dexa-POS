import { useToast } from "@/contexts/ToastContext";
import type { MerchantRole } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
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
  const addTemporaryMenuAccess = useMenuStore((s) => s.addTemporaryMenuAccess);
  const addTemporaryCategoryAccess = useMenuStore((s) => s.addTemporaryCategoryAccess);
  const { show } = useToast(); // Initialize useToast
  const [currentPin, setCurrentPin] = useState("");

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

  const handlePinSubmit = () => {
    const MANAGER_ROLES: MerchantRole[] = ["merchant.manager", "merchant.admin", "merchant.owner"];
    const employee = useEmployeeStore.getState().findEmployeeByPin(currentPin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);

    if (isManager) {
      if (actionToPerform) {
        if (actionToPerform.type === "select_menu") {
          addTemporaryMenuAccess(actionToPerform.payload.menuName);
        } else if (actionToPerform.type === "select_category") {
          addTemporaryCategoryAccess(actionToPerform.payload.categoryName);
        }
      }
      show({
        title: "Access Granted",
        message: "Temporary access has been granted.",
        type: "success",
      });
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
      show({
        title: "Invalid PIN",
        message: employee
          ? "This employee does not have manager access."
          : "The PIN you entered does not match any employee.",
        type: "error",
      });
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
      <DialogContent className="w-[420px] h-fit bg-panel border-gray-600 p-6 overflow-hidden">
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
