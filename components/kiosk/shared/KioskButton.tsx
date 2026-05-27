import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

export function KioskButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const theme = useKioskTheme();
  const { scale } = useKioskScale();
  const styles = useMemo(
    () => makeStyles(theme, Math.max(0.8, scale)),
    [scale, theme],
  );
  const textStyle =
    variant === "primary"
      ? styles.primaryText
      : variant === "secondary"
        ? styles.secondaryText
        : styles.ghostText;

  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.72}
      style={[styles.base, styles[variant], disabled ? styles.disabled : null]}
    >
      <Text style={[styles.text, textStyle]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function normalizeHex(color: string): string | null {
  const trimmed = color.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  return match ? `#${match[1]}` : null;
}

function getReadableTextColor(background: string): "#FFFFFF" | "#111827" {
  const normalized = normalizeHex(background);
  if (!normalized) return "#FFFFFF";
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.56 ? "#111827" : "#FFFFFF";
}

function makeStyles(theme: ReturnType<typeof useKioskTheme>, scale: number) {
  const primaryColor = normalizeHex(theme.primaryColor) ?? "#0C4FD1";
  const backgroundColor = normalizeHex(theme.backgroundColor) ?? "#FFFFFF";
  const textColor = normalizeHex(theme.textColor) ?? "#111827";
  const accentColor = normalizeHex(theme.accentColor) ?? "#111827";
  const primaryTextColor = getReadableTextColor(primaryColor);

  return StyleSheet.create({
    base: {
      minHeight: 54,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24 * scale,
      paddingVertical: 12 * scale,
      borderWidth: 1,
      zIndex: 10,
      elevation: 3,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
    },
    primary: {
      backgroundColor: primaryColor,
      borderColor: primaryColor,
    },
    secondary: {
      backgroundColor: `${primaryColor}10`,
      borderColor: `${primaryColor}30`,
      elevation: 0,
      shadowOpacity: 0,
    },
    ghost: {
      backgroundColor: `${backgroundColor}CC`,
      borderColor: `${textColor}18`,
      elevation: 0,
      shadowOpacity: 0,
    },
    text: {
      fontSize: 16 * scale,
      fontWeight: "900",
      textAlign: "center",
    },
    primaryText: {
      color: primaryTextColor,
    },
    secondaryText: {
      color: primaryColor,
    },
    ghostText: {
      color: accentColor === backgroundColor ? textColor : accentColor,
    },
    disabled: {
      opacity: 0.45,
    },
  });
}
