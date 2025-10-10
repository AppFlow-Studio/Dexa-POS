import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Clock } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { signInWithPin } = useEmployeeStore();
  const [pin, setPin] = useState("");
  const MAX_PIN_LENGTH = 4;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPin("");
      setError(null);
    }
  }, [isOpen]);

  const handleKeyPress = (input: NumpadInput) => {
    setError(null);
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prev) => prev + input);
      }
    } else {
      if (input === "backspace") {
        setPin((prev) => prev.slice(0, -1));
      }
      if (input === "clear") {
        setPin("");
      }
    }
  };

  const handleSwitchUser = () => {
    if (pin.length !== MAX_PIN_LENGTH) {
      setError(`PIN must be ${MAX_PIN_LENGTH} digits`);
      return;
    }

    const res = signInWithPin(pin);
    if (!res.ok) {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      return;
    }

    setPin("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-2xl overflow-hidden bg-[#303030] border-gray-700">
        <View className="bg-[#212121] p-4 w-full">
          <DialogTitle className="text-white text-xl font-bold text-center">
            Switch Account
          </DialogTitle>
        </View>
        <View className="p-4 w-full">
          <Text className="font-semibold text-gray-300 mb-2 text-lg text-center">
            Enter PIN to Switch
          </Text>
          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />
          <PinNumpad onKeyPress={handleKeyPress} />
          {error ? (
            <Text className="text-red-400 mt-2 text-center text-lg">
              {error}
            </Text>
          ) : (
            <View className="h-6 mt-2" />
          )}
          <TouchableOpacity className="self-end my-3">
            <Text className="font-semibold text-blue-400 text-base">
              Forgot Pin?
            </Text>
          </TouchableOpacity>
          <View className="flex-row gap-3 border-t border-gray-700 pt-4">
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-600 rounded-lg">
              <Clock color="#9CA3AF" size={18} />
              <Text className="font-bold text-gray-300 text-lg">Timeclock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSwitchUser}
              className="flex-1 py-3 bg-blue-600 rounded-lg items-center"
            >
              <Text className="font-bold text-white text-lg">Enter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchAccountModal;
