import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface StickyAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  testID?: string;
}

function backgroundFor(variant: StickyAction["variant"], disabled: boolean) {
  if (disabled) return colors.inset;
  if (variant === "danger") return colors.danger;
  if (variant === "secondary") return colors.card;
  return colors.teal;
}

function foregroundFor(variant: StickyAction["variant"], disabled: boolean) {
  if (disabled) return colors.muted;
  return variant === "secondary" ? colors.heading : colors.onSolid;
}

/**
 * Bottom-pinned action row. Buttons split the width evenly and are at least
 * 48dp tall, so the primary action always sits in the thumb zone. The bottom
 * safe-area inset is the container's job (HandheldRoot's SafeAreaView already
 * applies it; BottomSheet pads its own panel).
 */
export function StickyActionBar({ actions }: { actions: StickyAction[] }) {
  return (
    <View
      className="flex-row gap-3 px-4 py-3"
      style={{
        backgroundColor: colors.panel,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
    >
      {actions.map((a) => {
        const disabled = !!a.disabled;
        return (
          <Pressable
            key={a.label}
            testID={a.testID}
            onPress={a.onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            android_ripple={{ color: colors.tealMuted }}
            className="min-h-12 flex-1 items-center justify-center rounded-xl px-4"
            style={{ backgroundColor: backgroundFor(a.variant, disabled) }}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: foregroundFor(a.variant, disabled) }}
              numberOfLines={1}
            >
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
