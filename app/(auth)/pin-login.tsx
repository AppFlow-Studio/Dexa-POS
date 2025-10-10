import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Link, useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const { signInWithPin } = useEmployeeStore();
  const canSubmit = useMemo(() => pin.length === MAX_PIN_LENGTH, [pin]);

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
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      setPin(""); // Clear pin on error
      return;
    }

    // On success
    setPin("");
    router.replace("/home");
  };

  // REMOVED: The useEffect for auto-submitting the PIN has been removed.

  return (
    <View className="w-full m-auto">
      <Text className="text-3xl font-semibold text-white text-center mb-8">
        Enter Your PIN
      </Text>

      <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

      <View className="w-full mt-4">
        <PinNumpad onKeyPress={handleKeyPress} />
      </View>
      <View className="flex-row gap-4 mt-6 items-stretch">
        {/* Sign In Button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={!canSubmit}
          className={`flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center ${
            !canSubmit && "opacity-50"
          }`}
        >
          <Text className="text-blue-400 text-xl font-bold">SIGN IN</Text>
        </TouchableOpacity>

        {/* Open Timeclock Button */}
        <Link href="/timeclock" asChild>
          <TouchableOpacity className="flex-1 min-w-0 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center justify-center flex-row">
            <Text className="text-lg font-semibold text-white mr-2">
              Open Timeclock
            </Text>
            <Clock color="white" size={20} />
          </TouchableOpacity>
        </Link>
      </View>
      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent>
          <View
            className="w-120 max-w-lg rounded-2xl p-6"
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
            <Text className="text-xl text-gray-200 mb-4">{dialog.message}</Text>
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
    </View>
  );
};

export default PinLoginScreen;
