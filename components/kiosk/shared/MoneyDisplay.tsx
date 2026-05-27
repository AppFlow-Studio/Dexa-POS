import { formatMoney } from "@/components/kiosk/cartMath";
import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import React from "react";
import { Text } from "react-native";

export function MoneyDisplay({
  value,
  size = "md",
}: {
  value: number;
  size?: "sm" | "md" | "lg";
}) {
  const theme = useKioskTheme();
  const { scale } = useKioskScale();
  const fontSize = { sm: 12, md: 17, lg: 28 }[size] * Math.max(0.8, scale);
  return (
    <Text style={{ color: theme.textColor, fontSize, fontWeight: "800" }}>
      {formatMoney(value)}
    </Text>
  );
}
