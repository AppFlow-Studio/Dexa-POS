import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { metrics } from "../../lib/tokens";
import { type } from "../../lib/type";

/**
 * The artifact's `.tp` on screen 7: a 116dp card with the percentage over
 * its dollar value, accent-filled when selected (`.tp.on`).
 */
export function TipCard({
  percent,
  value,
  selected,
  onPress,
}: {
  percent: number;
  value: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${percent} percent, ${value}`}
      className="flex-1 items-center justify-center"
      style={{
        minHeight: metrics.tipCard,
        borderRadius: metrics.tipCardRadius,
        backgroundColor: selected ? colors.teal : colors.card,
        gap: 6,
      }}
    >
      <Text style={[type.tipPercent, { color: selected ? colors.onSolid : colors.heading }]}>
        {percent}%
      </Text>
      <Text style={[type.tipValue, { color: selected ? "rgba(12,15,26,0.7)" : colors.label }]}>
        {value}
      </Text>
    </Pressable>
  );
}

/** The `.tipg2` pair under the presets: Custom and No tip, 60dp. */
export function TipAltCard({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className="flex-1 items-center justify-center"
      style={{
        minHeight: metrics.tipAltCard,
        borderRadius: metrics.tipAltRadius,
        backgroundColor: selected ? colors.teal : colors.card,
      }}
    >
      <Text style={[type.line, { color: selected ? colors.onSolid : colors.heading }]}>{label}</Text>
    </Pressable>
  );
}

/** A 3-up / 2-up row of cards, 10dp apart with the artifact's 16dp gutter. */
export function TipRow({ children, top = 0 }: { children: React.ReactNode; top?: number }) {
  return (
    <View
      className="flex-row"
      style={{ paddingHorizontal: metrics.px, paddingTop: top, gap: 10 }}
    >
      {children}
    </View>
  );
}
