import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

export function QuantityStepper({
  quantity,
  onChange,
  min = 1,
  max = 99,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  min?: number;
  max?: number;
}) {
  const theme = useKioskTheme();
  const step = (delta: number) =>
    onChange(Math.min(max, Math.max(min, quantity + delta)));
  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${theme.textColor}14`,
        backgroundColor: `${theme.textColor}05`,
        paddingHorizontal: 6,
      }}
    >
      <Pressable
        onPress={() => step(-1)}
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          opacity: quantity <= min ? 0.45 : 1,
        }}
      >
        <Minus color={theme.primaryColor} size={20} />
      </Pressable>
      <Text
        style={{
          minWidth: 38,
          textAlign: "center",
          color: theme.textColor,
          fontSize: 22,
          fontWeight: "900",
        }}
      >
        {quantity}
      </Text>
      <Pressable
        onPress={() => step(1)}
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          backgroundColor: theme.primaryColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus color="#FFFFFF" size={20} />
      </Pressable>
    </View>
  );
}
