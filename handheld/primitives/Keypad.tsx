import { colors } from "@/lib/theme";
import { Delete } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

/** Digit or symbol key; the caller decides what "." or "00" means. */
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "00";

const DIGIT_ROWS: readonly (readonly KeypadKey[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

const SIZE = {
  regular: { height: 52, radius: 16, text: type.key },
  big: { height: 64, radius: 20, text: type.keyBig },
} as const;

function Key({
  label,
  onPress,
  ghost = false,
  disabled = false,
  size,
  children,
}: {
  label: string;
  onPress?: () => void;
  /** `.kp .gh`: transparent, label-coloured (".", backspace, spacer). */
  ghost?: boolean;
  disabled?: boolean;
  size: keyof typeof SIZE;
  children?: React.ReactNode;
}) {
  const s = SIZE[size];
  const fg = disabled ? colors.muted : ghost ? colors.label : colors.heading;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: tint.accentSoft }}
      className="flex-1 items-center justify-center"
      style={{
        minHeight: s.height,
        borderRadius: s.radius,
        backgroundColor: ghost || !onPress ? "transparent" : colors.card,
      }}
    >
      {children ?? (
        <Text style={[s.text, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * The artifact's `.kp`: 3 x 4 keys in flex rows (no grid), 8dp apart, 20dp
 * side padding. `big` is the manager-PIN size (64dp). `leftKey` is the
 * bottom-left slot: "." for amounts, "00" for cents entry, `null` for the
 * spacer the PIN pad uses.
 */
export function Keypad({
  onKey,
  onBackspace,
  leftKey = ".",
  size = "regular",
  disabled = false,
}: {
  onKey: (key: KeypadKey) => void;
  onBackspace: () => void;
  leftKey?: "." | "00" | null;
  size?: keyof typeof SIZE;
  disabled?: boolean;
}) {
  const iconColor = disabled ? colors.muted : colors.label;
  return (
    <View className="gap-2 px-5">
      {DIGIT_ROWS.map((row) => (
        <View key={row.join("")} className="flex-row gap-2">
          {row.map((k) => (
            <Key key={k} label={k} size={size} disabled={disabled} onPress={() => onKey(k)} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        {leftKey ? (
          <Key label={leftKey} size={size} ghost disabled={disabled} onPress={() => onKey(leftKey)} />
        ) : (
          <Key label="" size={size} ghost />
        )}
        <Key label="0" size={size} disabled={disabled} onPress={() => onKey("0")} />
        <Key label="Backspace" size={size} ghost disabled={disabled} onPress={onBackspace}>
          <Delete size={24} color={iconColor} />
        </Key>
      </View>
    </View>
  );
}
