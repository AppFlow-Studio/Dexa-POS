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
      <Text className="text-4xl font-bold text-gray-800 text-center mb-8">
        Reset Pin
      </Text>

      <View className="mb-4">
        <Text className="text-xl font-semibold text-gray-600 mb-2">
          Enter new pin
        </Text>
        <TextInput
          value={newPin}
          onChangeText={setNewPin}
          className="w-full px-6 py-4 h-20 bg-white border border-gray-200 rounded-lg text-2xl"
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6} // Example max length
        />
      </View>

      <View className="mb-6">
        <Text className="text-xl font-semibold text-gray-600 mb-2">
          Confirm new pin
        </Text>
        <TextInput
          value={confirmPin}
          onChangeText={setConfirmPin}
          className="w-full p-6 bg-white border border-gray-200 rounded-lg text-2xl"
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </View>

      <TouchableOpacity
        onPress={handleReset}
        className="w-full p-6 bg-primary-400 rounded-lg items-center"
      >
        <Text className="text-white text-2xl font-bold">Reset</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ResetPinScreen;
