import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/**
 * A row of 48dp pills with the amounts a guest is likely to hand over —
 * "Exact" first, then the next round bills. Same pill as the artifact's
 * `.chip`, but sharing the row equally so four fit a 360dp screen.
 */
export function QuickCash({
  amounts,
  selected,
  onPick,
}: {
  amounts: readonly number[];
  selected: number | null;
  onPick: (amount: number) => void;
}) {
  return (
    <View className="flex-row px-4" style={{ gap: 8 }}>
      {amounts.map((amount, i) => {
        const on = selected !== null && Math.abs(selected - amount) < 0.005;
        const label = i === 0 ? "Exact" : formatCurrency(amount).replace(/\.00$/, "");
        return (
          <Pressable
            key={amount}
            onPress={() => onPick(amount)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={i === 0 ? `Exact, ${formatCurrency(amount)}` : formatCurrency(amount)}
            className="flex-1 items-center justify-center rounded-full px-2"
            style={{ minHeight: 48, backgroundColor: on ? tint.accentSoft : colors.panel }}
          >
            <Text style={[type.value, { color: on ? colors.teal : colors.heading }]} numberOfLines={1} adjustsFontSizeToFit>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
