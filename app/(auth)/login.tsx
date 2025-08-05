import { useRouter } from "expo-router";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const MerchantLoginScreen = () => {
  const router = useRouter();

  const handleLogin = () => {
    // TODO: Add real authentication logic here
    // On success, navigate to the store selection screen
    router.push("/store-select");
  };

  return (
    <View className="w-full">
      <Text className="text-4xl font-semibold text-accent-500 text-center mb-8">
        Merchant Login
      </Text>

      <View className="mb-4">
        <Text className="text-lg font-medium text-accent-500 mb-2">Email</Text>
        <TextInput
          className="w-full p-4 border border-neutral-200 rounded-xl text-lg"
          placeholder="john@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View className="mb-4">
        <Text className="text-lg font-medium text-accent-500 mb-2">
          Password
        </Text>
        <TextInput
          className="w-full p-4 border border-neutral-200 rounded-xl text-lg"
          placeholder="••••••••"
          secureTextEntry
        />
      </View>

      <TouchableOpacity className="self-end mb-6">
        <Text className="font-semibold text-primary-400">Forgot Password</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogin}
        className="w-full p-4 bg-primary-400 rounded-xl items-center"
      >
        <Text className="text-white text-lg font-bold">Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default MerchantLoginScreen;
