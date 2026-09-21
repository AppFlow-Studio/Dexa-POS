import { colors } from "@/lib/theme";
import { Delete } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

/** Digit or symbol key; the caller decides what "." or "00" means. */
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "00";

const DIGIT_ROWS: readonly (readonly KeypadKey[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

function Key({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.tealMuted }}
      className="min-h-14 flex-1 items-center justify-center rounded-xl"
      style={{ backgroundColor: onPress ? colors.card : "transparent" }}
    >
      {children ?? (
        <Text
          className="text-2xl font-semibold"
          style={{ color: disabled ? colors.muted : colors.heading }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * 3 x 4 numeric keypad built from flex rows (no grid). Keys share the width
 * evenly and are at least 56dp tall. `leftKey` is the bottom-left slot:
 * "." for amounts, "00" for cents-style entry, `null` for an empty spacer.
 */
export function Keypad({
  onKey,
  onBackspace,
  leftKey = ".",
  disabled = false,
}: {
  onKey: (key: KeypadKey) => void;
  onBackspace: () => void;
  leftKey?: "." | "00" | null;
  disabled?: boolean;
}) {
  return (
    <View className="gap-2 px-4">
      {DIGIT_ROWS.map((row) => (
        <View key={row.join("")} className="flex-row gap-2">
          {row.map((k) => (
            <Key key={k} label={k} disabled={disabled} onPress={() => onKey(k)} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        {leftKey ? (
          <Key label={leftKey} disabled={disabled} onPress={() => onKey(leftKey)} />
        ) : (
          <Key label="" />
        )}
        <Key label="0" disabled={disabled} onPress={() => onKey("0")} />
        <Key label="Backspace" disabled={disabled} onPress={onBackspace}>
          <Delete size={24} color={disabled ? colors.muted : colors.heading} />
        </Key>
      </View>
    </View>
  );
}
