import React from "react";
import { Switch, Text, View } from "react-native";

interface SettingsHeaderProps {
  title: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  title,
  value,
  onValueChange,
}) => {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-xl font-bold text-white">{title}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#d1d5db", true: "#86efac" }}
        thumbColor={value ? "#22c55e" : "#f4f3f4"}
      />
    </View>
  );
};

export default SettingsHeader;
