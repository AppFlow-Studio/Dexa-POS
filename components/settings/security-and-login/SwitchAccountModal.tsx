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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const MAX_PIN_LENGTH = 4;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadMockEmployees(8); }, []);

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) { setPin((prev) => prev + input); setError(null); }
    } else {
      if (input === "backspace") { setPin((prev) => prev.slice(0, -1)); setError(null); }
      if (input === "clear") { setPin(""); setError(null); }
    }
  };

  const handleSwitchUser = () => {
    if (!selectedEmployeeId) { setError('Select a profile'); return; }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) { setError('Invalid employee'); return; }
    if (emp.shiftStatus !== 'clocked_in') {
      try { clockIn(emp.id); } catch { }
      try { tcClockIn(); } catch { }
    }
    const res = signIn(selectedEmployeeId, pin);
    if (!res.ok) {
      setError(res.reason === 'invalid_pin' ? 'Incorrect PIN' : 'Employee is not clocked in');
      return;
    }
    setPin("");
    setError(null);
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
          <Text className="font-semibold text-gray-600 mb-2">Select a profile</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {employees.map(e => (
              <TouchableOpacity key={e.id} onPress={() => { setSelectedEmployeeId(e.id); setPin(''); setError(null); }} className={`mr-3 items-center ${selectedEmployeeId === e.id ? '' : 'opacity-70'}`}>
                <Image source={e.profilePictureUrl ? { uri: e.profilePictureUrl } : require("@/assets/images/tom_hardy.jpg")} className="w-14 h-14 rounded-full" />
                <Text className="text-gray-700 text-xs mt-1">{e.fullName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text className="font-semibold text-gray-600 mb-2">Enter 4-digit PIN</Text>
          <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />
          <PinNumpad onKeyPress={handleKeyPress} />
          {error ? (<Text className="text-red-500 mt-2">{error}</Text>) : null}
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
