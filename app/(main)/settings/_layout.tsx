import SidebarNavigation from "@/components/settings/SidebarNavigation";
import { Slot } from "expo-router";
import React from "react";
import { View } from "react-native";

export default function SettingsLayout() {
  return (
    <View className="flex-1 flex-row bg-[#212121]">
      <SidebarNavigation />
      <View className="flex-1">
        <Slot />
      </View>
    </View>
  );
}
