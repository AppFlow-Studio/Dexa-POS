import { images } from "@/lib/image";
import { Slot } from "expo-router";
import React from "react";
import { Image, View } from "react-native";

export default function AuthLayout() {
  return (
    <View className="flex-1 flex-row items-center justify-center bg-[#212121] p-8">
      {/* Left side with the image */}
      <View className="flex-1 h-full w-1/2">
        <Image
          source={images.loginBurger}
          className="w-full h-full rounded-3xl"
          resizeMode="cover"
        />
      </View>

      {/* Right side with the content from the active screen */}
      <View className="flex-1 items-center justify-center">
        <View className="w-full p-16">
          {/* Slot renders the content of index.tsx, store-select.tsx, etc. */}
          <Slot />
        </View>
      </View>
    </View>
  );
}
