import { colors } from "@/lib/theme";
import { ChevronDown } from "lucide-react-native";
import React from "react";
import { Pressable, Text } from "react-native";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

/**
 * A small, obviously-tappable selector for a header line: the current
 * choice on a panel-coloured pill with a chevron. The Tables tab and the
 * table picker use it for the plan (room / patio / section) in view.
 */
export function DropdownPill({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      android_ripple={{ color: tint.accentSoft }}
      className="flex-row items-center gap-1 rounded-full pl-3 pr-2"
      style={{ minHeight: 28, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
    >
      <Text className="shrink" style={[type.chip, { color: colors.heading }]} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={15} color={colors.label} strokeWidth={2.2} />
    </Pressable>
  );
}
