import { colors } from "@/lib/theme";
import { Plus } from "lucide-react-native";
import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import type { MenuRowData } from "./useMenuRows";

/** `.qa`: the 40dp add disc — a plus, or the count already on the check. */
function AddDisc({ count }: { count: number }) {
  const on = count > 0;
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-full"
      style={{ backgroundColor: on ? colors.teal : tint.accentSoft }}
    >
      {on ? (
        <Text style={[type.value, { color: colors.onSolid }]}>{count}</Text>
      ) : (
        <Plus size={22} color={colors.teal} strokeWidth={2.2} />
      )}
    </View>
  );
}

/**
 * The artifact's `.mi`: 81dp, name, "$29.00 · description", the add disc.
 * Memoised on primitives; the whole row is the tap target, as on the register.
 */
export const MenuRow = React.memo(function MenuRow({
  row,
  count,
  divider,
  onPress,
}: {
  row: MenuRowData;
  count: number;
  divider: boolean;
  onPress: (row: MenuRowData) => void;
}) {
  const { item } = row;
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${item.name}`}
      className="flex-row items-center gap-3.5 px-4 py-2"
      style={{ minHeight: 81 }}
    >
      {divider ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 16, right: 16, height: 1, backgroundColor: tint.divider }}
        />
      ) : null}
      <View className="min-w-0 flex-1">
        <Text style={[type.row, { color: colors.heading }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="mt-1" style={[type.detail, { color: colors.muted }]} numberOfLines={1}>
          <Text style={[type.label, { color: colors.label }]}>{formatCurrency(item.price)}</Text>
          {item.description ? ` · ${item.description}` : ""}
        </Text>
      </View>
      <AddDisc count={count} />
    </Pressable>
  );
});
