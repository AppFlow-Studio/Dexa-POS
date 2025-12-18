import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLoading } from "@/contexts/LoadingContext";
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
  const { showLoading, hideLoading, isLoading } = useLoading();
  const { signInWithPin, findEmployeeByPin, clockIn, clockOut } =
    useEmployeeStore();
  const canSubmit = useMemo(
    () => pin.length === MAX_PIN_LENGTH && !isLoading,
    [pin, isLoading]
  );

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

  const triggerShakeAnimation = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 })
    );
  };

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

  const handleLogin = async () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN to sign in.`,
        "error"
      );
      return;
    }

    showLoading("Verifying PIN...");
    const res = await signInWithPin(pin);
    hideLoading();
    if (!res.ok) {
      triggerShakeAnimation();
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    setPin("");
    router.replace("/home");
  };

  const handleClockIn = async () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }
    showLoading("Verifying PIN...");
    const employee = await findEmployeeByPin(pin);
    hideLoading();
    if (!employee) {
      triggerShakeAnimation();
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

  const handleClockOut = async () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN.`,
        "error"
      );
      return;
    }
    showLoading("Verifying PIN...");
    const employee = await findEmployeeByPin(pin);
    hideLoading();
    if (!employee) {
      triggerShakeAnimation();
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

  const handleOpenTimeclock = async () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        `Please enter a ${MAX_PIN_LENGTH}-digit PIN to open the timeclock.`,
        "error"
      );
      return;
    }
    showLoading("Verifying PIN...");
    const employee = await findEmployeeByPin(pin);
    hideLoading();
    if (!employee) {
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin("");
      return;
    }
    // Check for manager-level roles (merchant.manager, merchant.admin, merchant.owner)
    const managerRoles = [
      "merchant.manager",
      "merchant.admin",
      "merchant.owner",
    ];
    if (!managerRoles.includes(employee.role)) {
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
