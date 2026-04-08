import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";

interface PTOBalanceCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "default" | "primary" | "secondary";
}

const PTOBalanceCard: React.FC<PTOBalanceCardProps> = ({
  label,
  value,
  icon,
  variant,
}) => {
  const valueColor = {
    success: colors.success,
    warning: colors.warning,
    default: colors.heading,
    primary: colors.teal,
    secondary: colors.label,
  }[variant];

  const bgColor = {
    success: colors.success + '10',
    warning: colors.warning + '10',
    default: colors.panel,
    primary: colors.teal + '10',
    secondary: colors.label + '10',
  }[variant];

  const borderColor = {
    success: colors.success + '30',
    warning: colors.warning + '30',
    default: colors.border,
    primary: colors.teal + '30',
    secondary: colors.label + '20',
  }[variant];

  return (
    <View
      style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: bgColor, borderWidth: 1, borderColor }}
    >
      <View className="mb-2">{icon}</View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: valueColor, marginBottom: 2 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: colors.label }}>{label}</Text>
    </View>
  );
};

export default PTOBalanceCard;
