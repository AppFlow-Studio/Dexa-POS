import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useCallback } from "react";
import { Text, View } from "react-native";
import { Checkbox } from "../../components/Checkbox";
import { checkTitle, itemCount, orderKind, orderKindLabel } from "../../lib/checks";
import { formatCurrency } from "../../lib/format";
import { type } from "../../lib/type";
import { ListRow } from "../../primitives";

/**
 * A check that could be merged in: "#1046 · Table 12", "Dine in · 3 items",
 * its total and a checkbox. Subscribes to its own profile only.
 */
export const MergeRow = React.memo(function MergeRow({
  orderId,
  checked,
  divider,
  onToggle,
}: {
  orderId: string;
  checked: boolean;
  divider: boolean;
  onToggle: (orderId: string) => void;
}) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const press = useCallback(() => onToggle(orderId), [onToggle, orderId]);
  if (!order) return null;
  const n = itemCount(order);
  return (
    <ListRow
      title={checkTitle(order)}
      detail={`${orderKindLabel(orderKind(order))} · ${n} ${n === 1 ? "item" : "items"}`}
      selected={checked}
      divider={divider}
      onPress={press}
      right={
        <View className="flex-row items-center" style={{ gap: 14 }}>
          <Text style={[type.value, { color: colors.heading }]}>{formatCurrency(order.total_amount ?? 0)}</Text>
          <Checkbox checked={checked} />
        </View>
      }
    />
  );
});
