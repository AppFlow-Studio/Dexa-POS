import { colors } from "@/lib/theme";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Checkbox } from "../../components/Checkbox";
import { formatCurrency } from "../../lib/format";
import { linesDue, type OpenLine } from "../../lib/split";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { StickyActionBar } from "../../primitives";
import type { SplitShare } from "../pay/unwired";

/** A 64dp selectable line: checkbox, quantity, name + seat, price. */
function PickRow({ line, on, divider, onPress }: { line: OpenLine; on: boolean; divider: boolean; onPress: () => void }) {
  const { item, quantity } = line;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      className="flex-row items-center gap-3.5 px-4"
      style={{ minHeight: 64, backgroundColor: on ? tint.selectedRow : "transparent" }}
    >
      {divider && !on ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 52, right: 16, height: 1, backgroundColor: tint.divider }} />
      ) : null}
      <Checkbox checked={on} />
      <Text className="w-5" style={[type.lineQty, { color: colors.label }]}>{quantity}</Text>
      <View className="min-w-0 flex-1">
        <Text style={[type.line, { color: colors.heading }]} numberOfLines={1}>{item.name}</Text>
        {item.seatNumber ? <Text style={[type.detail, { color: colors.muted }]}>Seat {item.seatNumber}</Text> : null}
      </View>
      <Text style={[type.price, { color: colors.heading }]}>{formatCurrency(item.price * quantity)}</Text>
    </Pressable>
  );
}

/**
 * "By item": tick the lines this guest is paying for; the footer carries the
 * count and the amount with tax. Whole lines only — paying part of a
 * multi-quantity line is the register's PayForItemsView until this is wired.
 */
export function ItemSplit({
  lines,
  taxRatesMap,
  busy,
  onPay,
}: {
  lines: readonly OpenLine[];
  taxRatesMap: Record<string, number>;
  busy: boolean;
  onPay: (share: SplitShare) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const chosen = useMemo(() => lines.filter((l) => picked.has(l.item.id)), [lines, picked]);
  const amount = useMemo(() => linesDue(chosen, taxRatesMap), [chosen, taxRatesMap]);
  const count = chosen.reduce((n, l) => n + l.quantity, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pay = () =>
    onPay({
      label: `${count} ${count === 1 ? "item" : "items"}`,
      amount,
      items: chosen.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
    });

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 12 }}>
        {lines.map((l, i) => (
          <PickRow key={l.item.id} line={l} on={picked.has(l.item.id)} divider={i > 0} onPress={() => toggle(l.item.id)} />
        ))}
      </ScrollView>
      <StickyActionBar
        actions={[
          {
            label: count ? `Pay for ${count} ${count === 1 ? "item" : "items"} · ${formatCurrency(amount)}` : "Choose items to pay for",
            disabled: count === 0 || busy,
            onPress: pay,
          },
        ]}
      />
    </>
  );
}
