import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import PinDisplay from "../auth/PinDisplay";
import PinNumpad, { NumpadInput } from "../auth/PinNumpad";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface PinInputModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}

const PinInputModal: React.FC<PinInputModalProps> = ({
  isOpen,
  title,
  subtitle,
  onConfirm,
  onCancel,
}) => {
  const [pin, setPin] = useState("");

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < 4) {
        setPin(pin + input.toString());
      }
    } else {
      switch (input) {
        case "backspace":
          setPin(pin.slice(0, -1));
          break;
        case "clear":
          setPin("");
          break;
      }
    }
  };

  const handleConfirm = () => {
    if (pin.length < 4) {
      // Trigger shake animation
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      return;
    }
    onConfirm(pin);
    setPin("");
  };

  const handleCancel = () => {
    setPin("");
    onCancel();
  };

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }],
    };
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="w-fit h-fit bg-surface border-gray-600 p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold text-white">
            {title}
          </DialogTitle>
        </DialogHeader>
        <Animated.View style={shakeStyle} className="py-4">
          {subtitle && (
            <Text className="text-center text-lg text-gray-300 mb-4">
              {subtitle}
            </Text>
          )}
          <PinDisplay pinLength={pin.length} maxLength={4} />
          <PinNumpad onKeyPress={handleKeyPress} />
          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              onPress={handleCancel}
              className="flex-1 py-3 bg-gray-600 rounded-lg"
            >
              <Text className="text-center text-lg font-bold text-white">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              className="flex-1 py-3 bg-blue-600 rounded-lg"
            >
              <Text className="text-center text-lg font-bold text-white">
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </DialogContent>
    </Dialog>
  );
};

export default PinInputModal;
