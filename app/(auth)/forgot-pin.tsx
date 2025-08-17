import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";

const ForgotPinScreen = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");

  const handleSubmit = () => {
    // In a real app, you would call your backend API here to send a reset email.
    // For now, we'll simulate a success and navigate to the reset page.
    if (email.includes("@") && email.includes(".")) {
      Alert.alert(
        "Success",
        "If an account with that email exists, a reset link has been sent."
      );
      router.push("/reset-pin");
    } else {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
    }
  };

  return (
    <View className="w-full">
      <Text className="text-3xl font-bold text-gray-800 text-center mb-8">
        Forgot Pin
      </Text>

      <View className="mb-6">
        <Text className="text-base font-semibold text-gray-600 mb-2">
          Enter your email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          className="w-full p-4 bg-white border border-gray-200 rounded-lg text-lg"
          placeholder="john@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        className="w-full p-4 bg-primary-400 rounded-lg items-center"
      >
        <Text className="text-white text-lg font-bold">Submit</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ForgotPinScreen;
