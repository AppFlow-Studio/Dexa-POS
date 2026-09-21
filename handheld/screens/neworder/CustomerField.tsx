import { colors } from "@/lib/theme";
import React from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { type } from "../../lib/type";

/** The artifact's `.tf`: a 64dp rounded field with a 12dp label over the value. */
export function CustomerField({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  keyboardType?: TextInputProps["keyboardType"];
}) {
  return (
    <View className="mx-4 justify-center px-5" style={{ minHeight: 64, borderRadius: 18, backgroundColor: colors.panel }}>
      <Text style={[type.nav, { color: colors.label }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCorrect={false}
        className="py-0"
        style={[type.row, { fontWeight: "400", color: colors.heading }]}
        accessibilityLabel={label}
      />
    </View>
  );
}
