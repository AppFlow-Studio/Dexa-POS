import React from "react";
import { Text, View } from "react-native";

const SettingsCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-white p-6 rounded-2xl border border-gray-200">
    <Text className="text-xl font-bold text-gray-800 mb-4">{title}</Text>
    {children}
  </View>
);

export default SettingsCard;
