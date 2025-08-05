import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { useRouter } from "expo-router";
import { ArrowLeft, Clock } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const MAX_PIN_LENGTH = 6;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");

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
    // TODO: Add real PIN validation logic here
    router.replace("/home");
  };

  return (
    <View className="w-full m-auto">
      <Text className="text-4xl font-medium text-accent-500 text-center mb-6">
        Employee Login (PIN)
      </Text>

      <Text className="text-base font-semibold text-accent-500 mb-2">
        Enter your pin
      </Text>

      <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

      <PinNumpad onKeyPress={handleKeyPress} />

      <TouchableOpacity className="self-end my-6">
        <Text className="font-semibold text-primary-400">Forgot Pin</Text>
      </TouchableOpacity>

      <View className="flex-row space-x-4 gap-4">
        <TouchableOpacity className="flex-1 p-4 bg-background-100 border border-background-500 rounded-xl items-center flex-row justify-center space-x-2 gap-2">
          <Text className="text-accent-500 text-lg font-bold">Timeclock</Text>
          <Clock className="text-accent-500" size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLogin}
          className="flex-1 p-4 bg-primary-400 rounded-xl items-center flex-row justify-center space-x-2 gap-2"
        >
          <Text className="text-white text-lg font-bold">Login</Text>
          <ArrowLeft
            color="#FFFFFF"
            size={20}
            strokeWidth={3}
            style={{ transform: [{ rotate: "180deg" }] }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PinLoginScreen;
