import Header from "@/components/Header";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export default function MainLayout() {
  return (
    // SafeAreaView handles the top notch and bottom system bar
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
      <StatusBar style={"light"} />

      <View className="flex-1 flex-row">
        {/* The Sidebar is now a self-contained component that handles its own state */}
        {/* <Sidebar /> */}
        {/* <ModifierSidebar /> */}
        <View className="flex-1 flex-col">
          <View className="px-6 pt-3 pb-2">
            <Header />
          </View>
          <Slot />
        </View>
      </View>
    </SafeAreaView>
  );
}
