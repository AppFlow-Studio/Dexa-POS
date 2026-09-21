import { colors } from "@/lib/theme";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { metrics, tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** The artifact's `.btn.cart`: count disc, "Review order", running total — all on one pill. */
export function CartButton({ count, total, onPress }: { count: number; total: number; onPress: () => void }) {
  return (
    <View className="px-4 pb-3 pt-3">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Review order, ${count} items, ${formatCurrency(total)}`}
        android_ripple={{ color: tint.accentSoft }}
        className="flex-row items-center justify-between rounded-full pl-3"
        style={{ minHeight: metrics.button, paddingRight: 24, backgroundColor: colors.teal }}
      >
        <View
          className="items-center justify-center rounded-full px-2"
          style={{ minWidth: 32, minHeight: 32, backgroundColor: "rgba(12,15,26,0.14)" }}
        >
          <Text style={[type.segment, { fontWeight: "600", color: colors.onSolid }]}>{count}</Text>
        </View>
        <Text style={[type.button, { color: colors.onSolid }]}>Review order</Text>
        <Text style={[type.value, { color: colors.onSolid }]}>{formatCurrency(total)}</Text>
      </Pressable>
    </View>
  );
}
