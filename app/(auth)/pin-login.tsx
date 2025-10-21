import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [currentEmployee, setCurrentEmployee] =
    useState<EmployeeProfile | null>(null);
  const { employees, signInWithPin, clockIn, clockOut } = useEmployeeStore();
  const canSubmit = useMemo(() => pin.length === MAX_PIN_LENGTH, [pin]);

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

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

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prevPin) => prevPin + input.toString());
      }
    } else {
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
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN to sign in.`,
        "error"
      );
      return;
    }
    const res = signInWithPin(pin);
    if (!res.ok) {
      // Trigger shake animation for wrong PIN
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    setPin("");
    router.replace("/home");
  };

  const handleClockIn = () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }
    const employee = employees.find((e) => e.pin === pin);
    if (!employee) {
      // Trigger shake animation for wrong PIN
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    setCurrentEmployee(employee);
    if (employee.shiftStatus === "clocked_in") {
      showDialog(
        "Already Clocked In",
        `${employee.fullName} is already on the clock.`,
        "warning"
      );
      setPin("");
      return;
    }
    clockIn(employee.id);
    showDialog(
      "Clock In Successful",
      `Welcome, ${employee.fullName}!`,
      "success"
    );
    setPin("");
  };

  const handleClockOut = () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }
    const employee = employees.find((e) => e.pin === pin);
    if (!employee) {
      // Trigger shake animation for wrong PIN
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    setCurrentEmployee(employee);
    if (employee.shiftStatus === "clocked_out") {
      showDialog(
        "Already Clocked Out",
        `${employee.fullName} is already off the clock.`,
        "warning"
      );
      setPin("");
      return;
    }
    clockOut(employee.id);
    showDialog(
      "Clock Out Successful",
      `Goodbye, ${employee.fullName}!`,
      "success"
    );
    setPin("");
  };

  const handleOpenTimeclock = () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN to open the timeclock.`,
        "error"
      );
      return;
    }
    const employee = employees.find((e) => e.pin === pin);
    if (!employee) {
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    if (employee.role !== "manager") {
      showDialog(
        "Permission Denied",
        "Only managers can access the timeclock.",
        "error"
      );
      setPin("");
      return;
    }
    router.push("/timeclock");
  };

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }],
    };
  });

  return (
    <>
      <Animated.View style={shakeStyle} className="w-full m-auto">
        <Text className="text-3xl font-semibold text-white text-center mb-8">
          Enter Your PIN
        </Text>

        <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

        <View className="w-full mt-4">
          <PinNumpad onKeyPress={handleKeyPress} />
        </View>

        <View className="flex-row gap-4 mt-6 items-stretch">
          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-blue-400 text-xl font-bold">SIGN IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockIn}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-green-400 text-xl font-bold">CLOCK IN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClockOut}
            disabled={!canSubmit}
            className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
              !canSubmit && "opacity-50"
            }`}
          >
            <Text className="text-red-400 text-xl font-bold">CLOCK OUT</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleOpenTimeclock}
          className="self-center mt-6 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center flex-row"
        >
          <Text className="text-lg font-semibold text-white mr-2">
            Open Timeclock
          </Text>
          <Lock color="white" size={20} />
        </TouchableOpacity>
      </Animated.View>

      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent className="min-w-xl w-[500px] ">
          <View
            className="min-w-xl w-full rounded-2xl p-6"
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
              className={`text-2xl font-semibold mb-2 ${
                dialog.variant === "success"
                  ? "text-green-400"
                  : dialog.variant === "warning"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {dialog.title}
            </Text>
            <Text className="text-xl text-gray-200 mb-6">{dialog.message}</Text>

            {/* User Avatar and Name */}
            {currentEmployee && (
              <View className="items-center mb-6">
                <View className="w-20 h-20 bg-blue-600 rounded-full items-center justify-center mb-3">
                  <Text className="text-white text-2xl font-bold">
                    {currentEmployee.fullName
                      .split(" ")
                      .map((name: string) => name.charAt(0))
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </Text>
                </View>
                <Text className="text-white text-lg font-semibold">
                  {currentEmployee.fullName}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={hideDialog}
              className="self-end px-5 py-2.5 rounded-lg"
              style={{
                backgroundColor:
                  dialog.variant === "success"
                    ? "#065F46"
                    : dialog.variant === "warning"
                      ? "#92400E"
                      : "#7F1D1D",
              }}
            >
              <Text className="text-white text-lg font-medium">OK</Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PinLoginScreen;
