import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Two-to-four way switch (Mine / All, Card / Cash, …). Segments split the
 * width evenly; each is at least 48dp tall.
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
      className="mx-4 my-2 flex-row rounded-xl p-1"
      style={{ backgroundColor: colors.inset }}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="min-h-12 flex-1 flex-row items-center justify-center rounded-lg px-2"
            style={{ backgroundColor: selected ? colors.teal : "transparent" }}
          >
            <Text
              className="text-base font-semibold"
              style={{ color: selected ? colors.onSolid : colors.label }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.count !== undefined ? (
              <Text
                className="ml-1 text-sm"
                style={{ color: selected ? colors.onSolid : colors.muted }}
              >
                {o.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
