import { images } from "@/lib/image";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Slot } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, View } from "react-native";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect to home/main if user is already signed in
  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return (
    <View className="flex-1 flex-row items-center justify-center bg-[#212121] p-8">
      {/* Left side with the image */}
      <View className="flex-1 h-full w-1/2">
        <Image
          source={images.loginBurger}
          className="w-full h-full rounded-2xl"
          resizeMode="cover"
        />
      </View>

      {/* Right side with the content from the active screen */}
      <View className="flex-1 items-center justify-center">
        <View className="w-full p-8">
          {/* Slot renders the content of login.tsx, sign-up.tsx, etc. */}
          <Slot />
        </View>
      </View>
    </View>
  );
}
