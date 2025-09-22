import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Link, useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";

const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const { isPinClockedIn, clockInWithPin, clockIn: tcClockIn, clockOut: tcClockOut } = useTimeclockStore();
  const { employees, loadMockEmployees, clockIn, clockOut, signIn } = useEmployeeStore();
  const canSubmit = useMemo(() => pin.length > 0, [pin]);

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    variant: "success" | "warning" | "error";
  }>({ visible: false, title: "", message: "", variant: "success" });
  const showDialog = (
    title: string,
    message: string,
    variant: "success" | "warning" | "error"
  ) => setDialog({ visible: true, title, message, variant });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  React.useEffect(() => {
    loadMockEmployees(8);
  }, []);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      // Append number if PIN is not full
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prevPin) => prevPin + input.toString());
      }
    } else {
      // Handle actions
      switch (input) {
        case "backspace":
          setPin((prevPin) => prevPin.slice(0, -1));
          break;
        case "clear":
          setPin("");
          break;
      }
    }
  };

  const handleLogin = () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        "Please enter a valid PIN to sign in.",
        "error"
      );
      return;
    }
    if (!selectedEmployeeId) {
      showDialog("Select Employee", "Please select your profile first.", "error");
      return;
    }

    // Auto clock-in before signing in, so terminal session + shift state are aligned
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (emp && emp.shiftStatus !== 'clocked_in') {
      clockIn(selectedEmployeeId);
      tcClockIn();
    }

    const res = signIn(selectedEmployeeId, pin);
    if (!res.ok) {
      if (res.reason === 'not_clocked_in') {
        showDialog("Not Clocked In", "Please clock in before signing into the terminal.", "warning");
      } else {
        showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      }
      return;
    }

    setPin("");
    router.replace("/home");
  };

  const handleClockIn = () => {
    if (!selectedEmployeeId) {
      showDialog("Select Employee", "Tap your profile first, then Clock In.", "warning");
      return;
    }
    // Mark shift status only; do not navigate
    clockIn(selectedEmployeeId);
    // Also update timeclock store status so MenuItem & others see clockedIn state
    tcClockIn();
    setPin("");
    showDialog("Clocked In", "You're now on the clock. Enter your PIN to sign into the terminal.", "success");
  };

  const handleClockOut = () => {
    if (!selectedEmployeeId) {
      showDialog("Select Employee", "Tap your profile first, then enter PIN to clock out.", "warning");
      return;
    }
    if (!canSubmit) {
      showDialog("Enter PIN", "Please enter your 4-digit PIN to clock out.", "error");
      return;
    }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) return;
    if (emp.pin !== pin) {
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      return;
    }
    if (emp.shiftStatus !== 'clocked_in') {
      showDialog("Not Clocked In", "You are not currently clocked in.", "warning");
      return;
    }
    clockOut(selectedEmployeeId);
    tcClockOut();
    showDialog("Clocked Out Successfully", `Goodbye ${emp.fullName}!`, "success");
    setPin("");
  };

  return (
    <View className="w-full m-auto">
      <Text className="text-4xl font-medium text-white text-center mb-8">
        Get Started
      </Text>

      <Text className="text-xl font-semibold text-white mb-2">Select Your Profile</Text>
      <ScrollView horizontal className="mb-4" showsHorizontalScrollIndicator={false}>
        {employees.map((e) => (
          <TouchableOpacity key={e.id} onPress={() => setSelectedEmployeeId(e.id)} className={`mr-4 items-center ${selectedEmployeeId === e.id ? 'opacity-100' : 'opacity-50'}`}>
            <Image source={e.profilePictureUrl ? { uri: e.profilePictureUrl } : require("@/assets/images/tom_hardy.jpg")} className="w-20 h-20 rounded-full" />
            <Text className="text-white mt-2">{e.fullName}</Text>
            <Text className={`text-xs mt-1 ${e.shiftStatus === 'clocked_in' ? 'text-green-400' : 'text-gray-400'}`}>{e.shiftStatus === 'clocked_in' ? 'Clocked In' : 'Clocked Out'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text className="text-xl font-semibold text-white mb-2">ENTER YOUR PASSCODE</Text>
      <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

      <View className="mt-6">
        <PinNumpad onKeyPress={handleKeyPress} />
      </View>

      <View className="flex-row gap-6 mt-8">
        <TouchableOpacity
          onPress={handleLogin}
          className="flex-1 p-6 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-primary-300 text-xl font-bold">SIGN IN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClockIn}
          className="flex-1 p-6 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-orange-400 text-xl font-bold">CLOCK IN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClockOut}
          className="flex-1 p-6 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-green-400 text-xl font-bold">CLOCK OUT</Text>
        </TouchableOpacity>
      </View>

      <Link href="/timeclock" asChild>
        <TouchableOpacity className="self-center bg-[#2D2D2D] border border-gray-700 rounded-xl p-6 mt-8 flex-row items-center gap-2">
          <Text className="text-xl font-semibold text-white">
            Open Timeclock
          </Text>
          <Clock color="white" size={24} />
        </TouchableOpacity>
      </Link>

      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent className="">
          <View
            className="w-120 max-w-2xl rounded-2xl p-6"
            style={{
              backgroundColor: "#2b2b2b",
              borderWidth: 1,
              borderColor:
                dialog.variant === "success"
                  ? "#059669"
                  : dialog.variant === "warning"
                    ? "#F59E0B"
                    : "#EF4444",
            }}
          >
            <Text
              className={`text-3xl font-semibold mb-2 ${dialog.variant === "success" ? "text-green-400" : dialog.variant === "warning" ? "text-yellow-400" : "text-red-400"}`}
            >
              {dialog.title}
            </Text>
            <Text className="text-2xl text-gray-200 mb-4">
              {dialog.message}
            </Text>
            <TouchableOpacity
              onPress={hideDialog}
              className="self-end px-6 py-3 rounded-lg"
              style={{
                backgroundColor:
                  dialog.variant === "success"
                    ? "#065F46"
                    : dialog.variant === "warning"
                      ? "#92400E"
                      : "#7F1D1D",
              }}
            >
              <Text className="text-white text-xl font-medium">OK</Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default PinLoginScreen;
