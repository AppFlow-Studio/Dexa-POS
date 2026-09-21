import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import type { MenuChip } from "./useMenuRows";

/** The artifact's `.chips`: a horizontal row of 38dp pills, the active one accent-tinted. */
export function CategoryChips({
  chips,
  active,
  onChange,
}: {
  chips: MenuChip[];
  active: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // A ScrollView defaults to flexGrow 1 and its row children stretch, so
      // with a short list the strip (and every chip) would fill the screen.
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, alignItems: "center" }}
    >
      {chips.map((chip) => {
        const on = chip.key === active;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onChange(chip.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            className="justify-center rounded-full px-4"
            style={{ minHeight: 38, backgroundColor: on ? tint.accentSoft : colors.panel }}
          >
            <Text style={[type.segment, { color: on ? colors.teal : colors.label }]} numberOfLines={1}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
