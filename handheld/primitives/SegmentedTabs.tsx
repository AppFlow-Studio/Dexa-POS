import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { tint } from "../lib/tokens";
import { type } from "../lib/type";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * The artifact's `.segs`: a 48dp pill track on the panel colour, 4dp inset,
 * the selected segment a soft-accent pill with accent text and a dimmed count.
 */
export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <View
      className="mx-4 mb-3 flex-row rounded-full p-1"
      style={{ minHeight: 48, backgroundColor: colors.panel }}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const selected = o.value === value;
        const fg = selected ? colors.teal : colors.label;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full px-2"
            style={{ backgroundColor: selected ? tint.accentSoft : "transparent" }}
          >
            <Text style={[type.segment, { color: fg }]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.count !== undefined ? (
              <Text style={[type.chip, { color: fg, opacity: 0.7 }]}>{o.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
