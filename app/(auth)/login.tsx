import { useRouter } from "expo-router";
import React from "react";
import {
  KeyboardAvoidingView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const MerchantLoginScreen = () => {
  const router = useRouter();

  const handleLogin = () => {
    // TODO: Add real authentication logic here
    // On success, navigate to the store selection screen
    router.push("/store-select");
  };

  return (
    <View className="w-full">
      <Text className="text-3xl font-semibold text-white text-center mb-8">
        Merchant Login
      </Text>

      <KeyboardAvoidingView behavior="padding" className="mb-4">
        <Text className="text-xl font-medium text-white mb-2">Email</Text>
        <TextInput
          className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl"
          placeholder="john@gmail.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </KeyboardAvoidingView>

      <View className="mb-4">
        <Text className="text-xl font-medium text-white mb-2">Password</Text>
        <KeyboardAvoidingView behavior="position">
          <TextInput
            className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl"
            placeholderTextColor="#9CA3AF"
            placeholder="••••••••"
            secureTextEntry
          />
        </KeyboardAvoidingView>
      </View>

      <TouchableOpacity className="self-end mb-6">
        <Text className="text-lg font-semibold text-white">
          Forgot Password
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogin}
        className="w-full p-4 bg-blue-600 rounded-xl items-center"
      >
        <Text className="text-white text-xl font-bold">Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default MerchantLoginScreen;
