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
      <Text className="text-2xl font-bold text-white text-center mb-6">
        Forgot Pin
      </Text>

      <View className="mb-4">
        <Text className="text-lg font-semibold text-gray-300 mb-2">
          Enter your email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          className="w-full p-4 bg-[#303030] border border-gray-600 rounded-lg text-xl text-white h-16"
          placeholder="john@gmail.com"
          placeholderTextColor="#6B7280"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        className="w-full p-4 bg-blue-600 rounded-lg items-center"
      >
        <Text className="text-white text-xl font-bold">Submit</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ForgotPinScreen;
