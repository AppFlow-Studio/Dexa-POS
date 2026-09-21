import { colors } from "@/lib/theme";
import { Plus } from "lucide-react-native";
import React from "react";
import { Pressable, Text } from "react-native";
import { type } from "../lib/type";

/** The artifact's `.fab`: a 56dp extended button pinned bottom-right, above the tab bar. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="absolute bottom-4 right-4 flex-row items-center gap-2.5 px-5"
      style={{
        minHeight: 56,
        borderRadius: 18,
        backgroundColor: colors.teal,
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.5,
        shadowRadius: 13,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <Plus size={22} color={colors.onSolid} strokeWidth={2.2} />
      <Text style={[type.button, { color: colors.onSolid }]}>{label}</Text>
    </Pressable>
  );
}
