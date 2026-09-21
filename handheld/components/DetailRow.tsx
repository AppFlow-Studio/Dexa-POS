import { colors } from "@/lib/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Label on the left, value on the right; for read-only detail sheets. */
export function DetailRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View
      className="min-h-12 flex-row items-center justify-between px-4 py-2"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        className={emphasis ? "text-base font-bold" : "text-base"}
        style={{ color: emphasis ? colors.heading : colors.muted }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className={emphasis ? "ml-4 shrink text-lg font-bold" : "ml-4 shrink text-base font-semibold"}
        style={[{ color: colors.heading }, TABULAR]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
