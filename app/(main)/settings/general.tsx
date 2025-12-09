import React from "react";
import { ScrollView, Text, View } from "react-native";

const GeneralSettingsScreen = () => {
  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">General Settings</Text>
        <Text className="text-gray-400 mt-2">
          Manage business information, hours, and tax settings.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView>{/* Checklist items will be implemented here */}</ScrollView>
    </View>
  );
};

export default GeneralSettingsScreen;
