import { colors } from "@/lib/theme";
import { Search, X } from "lucide-react-native";
import React from "react";
import { Pressable, TextInput, View } from "react-native";
import { type } from "../lib/type";

/** The artifact's `.search`: a 52dp pill with an icon and a plain text input. */
export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <View
      className="mx-4 mb-3 flex-row items-center gap-3.5 rounded-full px-5"
      style={{ minHeight: 52, backgroundColor: colors.panel }}
    >
      <Search size={22} color={colors.label} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.label}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={autoFocus}
        className="flex-1 py-0"
        style={[type.value, { fontWeight: "400", color: colors.heading }]}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
          <X size={20} color={colors.label} />
        </Pressable>
      ) : null}
    </View>
  );
}
