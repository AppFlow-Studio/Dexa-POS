import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Link, useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const { isPinClockedIn, clockInWithPin, clockOutWithPin } =
    useTimeclockStore();
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

    // Check if user is already clocked in
    if (isPinClockedIn(pin)) {
      // User is already clocked in, just sign in
      showDialog(
        "Signed In",
        "Welcome back! You are already clocked in.",
        "success"
      );
      setTimeout(() => {
        router.replace("/home");
      }, 1500);
      return;
    }

    // Clock in the user automatically
    const clockInResult = clockInWithPin(pin);
    if (!clockInResult.ok) {
      showDialog("Sign In Failed", "Please enter a valid PIN.", "error");
      return;
    }

    // Successfully clocked in and signed in
    const userProfile = clockInResult.userProfile;
    showDialog(
      "Signed In Successfully",
      `Welcome ${userProfile.fullName}!\nRole: ${userProfile.employeeId}\nEmail: ${userProfile.email}\nYou have been automatically clocked in.`,
      "success"
    );
    setPin("");
    setTimeout(() => {
      router.replace("/home");
    }, 1500);
  };

  const handleClockIn = () => {
    if (!canSubmit) return;
    const res = clockInWithPin(pin);
    if (!res.ok && res.reason === "already_clocked_in") {
      showDialog(
        "Already Clocked In",
        "You are already clocked in.",
        "warning"
      );
      return;
    }
    if (!res.ok) {
      showDialog("Clock In Failed", "Please enter a valid PIN.", "error");
      return;
    }

    // Show success dialog with user information
    const userProfile = res.userProfile;
    showDialog(
      "Clocked In Successfully",
      `Welcome ${userProfile.fullName}!\nRole: ${userProfile.employeeId}\nEmail: ${userProfile.email}\nYour time has been recorded.`,
      "success"
    );
    setPin("");
  };

  const handleClockOut = () => {
    if (!canSubmit) return;
    const res = clockOutWithPin(pin);
    if (!res.ok && res.reason === "not_clocked_in") {
      showDialog(
        "Not Clocked In",
        "You are not currently clocked in.",
        "warning"
      );
      return;
    }
    if (!res.ok) {
      showDialog("Clock Out Failed", "Please enter a valid PIN.", "error");
      return;
    }

    // Show success dialog with user information
    const userProfile = res.userProfile;
    showDialog(
      "Clocked Out Successfully",
      `Goodbye ${userProfile.fullName}!\nYour shift has been recorded and saved.\nProfile saved for future reference.`,
      "success"
    );
    setPin("");
  };

  return (
    <View className="w-full m-auto">
      <Text className="text-4xl font-medium text-white text-center mb-8">
        Get Started
      </Text>

      <Text className="text-xl font-semibold text-white mb-2">
        ENTER YOUR PASSCODE
      </Text>
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
