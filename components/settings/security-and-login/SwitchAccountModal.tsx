import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { employees, loadMockEmployees, signIn, clockIn } = useEmployeeStore();
  const { clockIn: tcClockIn } = useTimeclockStore();
  const [pin, setPin] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );
  const MAX_PIN_LENGTH = 4;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMockEmployees(8);
  }, []);

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prev) => prev + input);
        setError(null);
      }
    } else {
      if (input === "backspace") {
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      }
      if (input === "clear") {
        setPin("");
        setError(null);
      }
    }
  };

  const handleSwitchUser = () => {
    if (!selectedEmployeeId) {
      setError("Select a profile");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) {
      setError("Invalid employee");
      return;
    }
    if (emp.shiftStatus !== "clocked_in") {
      try {
        clockIn(emp.id);
      } catch {}
      try {
        tcClockIn();
      } catch {}
    }
    const res = signIn(selectedEmployeeId, pin);
    if (!res.ok) {
      setError(
        res.reason === "invalid_pin"
          ? "Incorrect PIN"
          : "Employee is not clocked in"
      );
      return;
    }
    setPin("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-[550px] p-0 rounded-2xl overflow-hidden bg-[#303030] border-gray-700">
        <View className="bg-[#212121] p-4 w-full">
          <DialogTitle className="text-white text-xl font-bold text-center">
            Switch Account
          </DialogTitle>
        </View>
        <View className="p-4 w-full">
          <Text className="font-semibold text-gray-300 mb-2 text-lg">
            Select a profile
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
          >
            {employees.map((e) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => {
                  setSelectedEmployeeId(e.id);
                  setPin("");
                  setError(null);
                }}
                className={`mr-3 items-center ${selectedEmployeeId === e.id ? "" : "opacity-60"}`}
              >
                <Image
                  source={
                    e.profilePictureUrl
                      ? { uri: e.profilePictureUrl }
                      : require("@/assets/images/tom_hardy.jpg")
                  }
                  className="w-12 h-12 rounded-full"
                />
                <Text className="text-gray-300 text-xs mt-1">{e.fullName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text className="font-semibold text-gray-300 mb-2 text-lg">
            Enter 4-digit PIN
          </Text>
          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />
          <PinNumpad onKeyPress={handleKeyPress} />
          {error ? (
            <Text className="text-red-400 mt-2 text-center text-lg">
              {error}
            </Text>
          ) : null}
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
              <Text className="font-bold text-white text-lg">Switch User</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchAccountModal;
