import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { initials } from "../lib/format";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

/** The artifact's `.av`: a 40dp soft-accent circle with 14/600 initials. */
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const size = small ? 28 : 40;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: tint.accentSoft }}
      accessibilityLabel={name}
    >
      <Text style={[type.avatar, small && { fontSize: 11, lineHeight: 14 }, { color: colors.teal }]}>
        {initials(name)}
      </Text>
    </View>
  );
}
