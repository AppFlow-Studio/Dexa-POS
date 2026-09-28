import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { type } from "../lib/type";

/**
 * The artifact's `.amt-in`: a 14dp label over a 44/700 typed amount, both
 * centred, with an optional line under it ("Change $4.37"). Sits above a
 * `Keypad` in every amount sheet.
 */
export function AmountDisplay({
  label,
  value,
  note,
  noteColor,
}: {
  label: string;
  value: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <View className="items-center px-5 pt-3.5" style={{ paddingBottom: 10 }}>
      <Text style={[type.detail, { color: colors.label }]}>{label}</Text>
      <Text
        className="mt-1"
        style={[type.amount, { color: colors.heading }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {note ? (
        <Text className="mt-0.5" style={[type.heroNote, { color: noteColor ?? colors.muted }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}
