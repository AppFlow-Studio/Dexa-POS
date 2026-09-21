import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text } from "react-native";
import { metrics, tint } from "../lib/tokens";
import { type } from "../lib/type";

/** The artifact's `.btn` variants. */
export type ButtonVariant = "primary" | "tonal" | "soft" | "off" | "text";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Hug the label instead of sharing the row (`.btn.fit`). */
  fit?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  testID?: string;
}

function palette(variant: ButtonVariant, disabled: boolean) {
  if (disabled || variant === "off") return { bg: colors.panel, fg: colors.muted };
  switch (variant) {
    case "tonal":
      return { bg: tint.accentSoft, fg: colors.teal };
    case "soft":
      return { bg: colors.card, fg: colors.heading };
    case "text":
      return { bg: "transparent", fg: colors.teal };
    default:
      return { bg: colors.teal, fg: colors.onSolid };
  }
}

/** 56dp pill (44dp for `text`), full-width unless `fit`. */
export function Button({
  label,
  onPress,
  variant = "primary",
  fit = false,
  icon,
  disabled = false,
  testID,
}: ButtonProps) {
  const { bg, fg } = palette(variant, disabled);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={{ color: tint.accentSoft }}
      className={
        fit
          ? "flex-row items-center justify-center gap-2 rounded-full px-7"
          : "flex-1 flex-row items-center justify-center gap-2 rounded-full px-6"
      }
      style={{
        minHeight: variant === "text" ? metrics.textButton : metrics.button,
        backgroundColor: bg,
      }}
    >
      {icon}
      <Text
        className="shrink"
        style={[type.button, { color: fg }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </Pressable>
  );
}
