import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { type } from "../lib/type";

/** The artifact's `.sub`: "Needs you" / "Your section" above a row group. */
export const SectionLabel = React.memo(function SectionLabel({ text }: { text: string }) {
  return (
    <View className="justify-end px-4 pb-2" style={{ minHeight: 38 }}>
      <Text style={[type.label, { color: colors.label }]}>{text}</Text>
    </View>
  );
});
