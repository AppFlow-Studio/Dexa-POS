import { colors } from "@/lib/theme";
import React from "react";
import { TextInput, View } from "react-native";
import { type } from "../lib/type";

/** The note card the order note, item note and options sheets share: a multiline input on the card colour. */
export function NoteField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  minHeight = 96,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  minHeight?: number;
}) {
  return (
    <View className="mx-4 mb-2 px-5 py-3" style={{ borderRadius: 18, backgroundColor: colors.card }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline
        autoFocus={autoFocus}
        textAlignVertical="top"
        style={[type.row, { fontWeight: "400", color: colors.heading, minHeight }]}
        accessibilityLabel={label}
      />
    </View>
  );
}
