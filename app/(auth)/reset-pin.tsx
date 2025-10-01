import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";

const ResetPinScreen = () => {
  const router = useRouter();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const handleReset = () => {
    // Basic validation
    if (!newPin || !confirmPin) {
      Alert.alert("Error", "Please fill in both fields.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Error", "The PINs do not match.");
      return;
    }
    if (newPin.length < 6) {
      Alert.alert("Error", "PIN must be at least 6 digits long.");
      return;
    }

    // In a real app, you would call your backend API here with the reset token and new PIN.
    console.log("Resetting PIN to:", newPin);
    Alert.alert("Success", "Your PIN has been reset successfully.");
    router.replace("/pin-login"); // Use replace to prevent going back
  };

  return (
    <View className="w-full">
      <Text className="text-3xl font-bold text-white text-center mb-6">
        Reset Pin
      </Text>

      <View className="mb-4">
        <Text className="text-lg font-semibold text-gray-300 mb-2">
          Enter new pin
        </Text>
        <TextInput
          value={newPin}
          onChangeText={setNewPin}
          className="w-full p-4 h-16 bg-[#303030] border border-gray-600 rounded-lg text-xl text-white"
          placeholder="••••"
          placeholderTextColor="#6B7280"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </View>

      <View className="mb-6">
        <Text className="text-lg font-semibold text-gray-300 mb-2">
          Confirm new pin
        </Text>
        <TextInput
          value={confirmPin}
          onChangeText={setConfirmPin}
          className="w-full p-4 h-16 bg-[#303030] border border-gray-600 rounded-lg text-xl text-white"
          placeholder="••••"
          placeholderTextColor="#6B7280"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </View>

      <TouchableOpacity
        onPress={handleReset}
        className="w-full p-4 bg-blue-600 rounded-lg items-center"
      >
        <Text className="text-white text-xl font-bold">Reset</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ResetPinScreen;
