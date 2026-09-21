import { colors } from "@/lib/theme";
import type { CartItem } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** `.tag`: the small "TO GO" / "CUSTOM" label after an item name. */
export function Tag({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <View
      className="ml-2 justify-center rounded-md px-1.5"
      style={{ height: 20, backgroundColor: accent ? tint.accentSoft : tint.infoSoft }}
    >
      <Text style={[type.badge, { letterSpacing: 0.44, color: accent ? colors.teal : colors.info }]}>
        {label}
      </Text>
    </View>
  );
}

/** "Medium · Seat 2": chosen options, notes, then the seat, as the artifact. */
function itemDetail(item: CartItem): string {
  const parts: string[] = [];
  for (const group of item.customizations.modifiers ?? []) {
    for (const option of group.options) {
      parts.push(option.isNo ? `No ${option.name}` : option.name);
    }
  }
  if (item.customizations.notes) parts.push(item.customizations.notes);
  if (item.seatNumber) parts.push(`Seat ${item.seatNumber}`);
  return parts.join(" · ");
}

/** The artifact's `.ln`: qty, name (+tag), detail, price; inset top rule. */
export function LineItem({ item }: { item: CartItem }) {
  const detail = itemDetail(item);
  return (
    <View className="flex-row items-start gap-3 px-4 py-2.5">
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 16, right: 16, height: 1, backgroundColor: tint.divider }}
      />
      <Text className="w-5" style={[type.lineQty, { color: colors.label }]}>
        {item.quantity}
      </Text>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center">
          <Text className="shrink" style={[type.line, { color: colors.heading }]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.is_to_go ? <Tag label="TO GO" /> : null}
          {item.is_open_item ? <Tag label="CUSTOM" accent /> : null}
        </View>
        {detail ? (
          <Text className="mt-0.5" style={[type.detail, { color: colors.muted }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={[type.price, { color: colors.heading }]}>
        {formatCurrency(item.price * item.quantity)}
      </Text>
    </View>
  );
}
