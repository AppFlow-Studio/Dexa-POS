import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Clock } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [pin, setPin] = useState("");
  const MAX_PIN_LENGTH = 6;

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) setPin((prev) => prev + input);
    } else {
      if (input === "backspace") setPin((prev) => prev.slice(0, -1));
      if (input === "clear") setPin("");
    }
  };

  const handleSwitchUser = () => {
    // Add logic to verify PIN and switch user
    alert(`Switching user with PIN: ${pin}`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-[550px] p-0 rounded-2xl overflow-hidden bg-white">
        <View className="bg-gray-800 p-6 w-full">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Employee Switch Account
          </DialogTitle>
        </View>
        <View className="bg-white p-6 w-full">
          <Text className="font-semibold text-gray-600 mb-2">
            Enter your pin
          </Text>
          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />
          <PinNumpad onKeyPress={handleKeyPress} />
          <TouchableOpacity className="self-end my-4">
            <Text className="font-semibold text-primary-400">Forgot Pin</Text>
          </TouchableOpacity>
          <View className="flex-row gap-2 border-t border-gray-200 pt-4">
            <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-300 rounded-lg">
              <Clock color="#4b5563" size={20} />
              <Text className="font-bold text-gray-700">Timeclock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSwitchUser}
              className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
            >
              <Text className="font-bold text-white">Switch User</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchAccountModal;
