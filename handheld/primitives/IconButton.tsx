import React from "react";
import { Pressable } from "react-native";
import { tint } from "../lib/tokens";

/** The artifact's `.ib`: a 48dp round icon target with no background. */
export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: tint.accentSoft, borderless: true }}
      className="h-12 w-12 items-center justify-center rounded-full"
    >
      {children}
    </Pressable>
  );
}
