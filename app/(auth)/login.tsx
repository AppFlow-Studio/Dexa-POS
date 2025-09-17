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
      <Text className="text-4xl font-semibold text-white text-center mb-10">
        Merchant Login
      </Text>

      <View className="mb-6">
        <Text className="text-2xl font-medium text-white mb-2">Email</Text>
        <TextInput
          className="w-full p-6 border text-white border-neutral-200 rounded-xl text-2xl"
          placeholder="john@gmail.com"
          placeholderTextColor="white"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View className="mb-6">
        <Text className="text-2xl font-medium text-white mb-2">Password</Text>
        <TextInput
          className="w-full p-6 border text-white border-neutral-200 rounded-xl text-2xl"
          placeholderTextColor="white"
          placeholder="••••••••"
          secureTextEntry
        />
      </View>

      <TouchableOpacity className="self-end mb-8">
        <Text className="text-xl font-semibold text-white">
          Forgot Password
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogin}
        className="w-full p-6 bg-primary-400 rounded-xl items-center"
      >
        <Text className="text-white text-2xl font-bold">Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default MerchantLoginScreen;
