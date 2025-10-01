import React from "react";
import { Text, View } from "react-native";

const SettingsCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-[#303030] p-4 rounded-2xl border border-gray-700">
    <Text className="text-2xl font-bold text-white mb-3">{title}</Text>
    {children}
  </View>
);

export default SettingsCard;
