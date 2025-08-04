import Sidebar from "@/components/Sidebar";
import { Slot } from "expo-router";
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MainLayout() {
  return (
    // SafeAreaView handles the top notch and bottom system bar
    <SafeAreaView edges={["top"]} className="flex-1 bg-white">
      <View className="flex-1 flex-row">
        {/* Column 1: The persistent Sidebar */}
        <Sidebar />

        {/* Column 2: The content of the active screen, rendered by Expo Router */}
        {/* The Slot will be replaced by home.tsx, settings/my-profile.tsx, etc. */}
        <Slot />
      </View>
    </SafeAreaView>
  );
}
