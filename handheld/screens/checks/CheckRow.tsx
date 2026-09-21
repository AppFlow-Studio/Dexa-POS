import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { ShoppingBag, Truck, Utensils, type LucideIcon } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  checkTitle,
  kitchenState,
  orderKind,
  orderKindLabel,
  orderKindTint,
  type KitchenTone,
  type OrderKind,
} from "../../lib/checks";
import { formatCurrency } from "../../lib/format";
import { ListRow } from "../../primitives";

const KIND_ICON: Record<OrderKind, LucideIcon> = {
  takeout: ShoppingBag,
  dine_in: Utensils,
  delivery: Truck,
};

function toneColor(tone: KitchenTone): string {
  if (tone === "ok") return colors.success;
  if (tone === "warn") return colors.warning;
  return colors.label;
}

/**
 * One Checks row: order-type icon in a tinted tile, "#1045 · Ben K.",
 * "Takeout · Not sent" with the kitchen state coloured, and the total.
 * Subscribes to its own profile only.
 */
export const CheckRow = React.memo(function CheckRow({
  orderId,
  now,
  divider,
  dark,
  onPress,
}: {
  orderId: string;
  now: number;
  divider: boolean;
  dark: boolean;
  onPress: (orderId: string) => void;
}) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const handlePress = useCallback(() => onPress(orderId), [onPress, orderId]);
  if (!order) return null;

  const kind = orderKind(order);
  const Icon = KIND_ICON[kind];
  const { fg, bg } = orderKindTint(kind, dark);
  const kitchen = kitchenState(order, now);

  return (
    <ListRow
      tile={{ bg, fg, icon: <Icon size={24} color={fg} /> }}
      title={checkTitle(order)}
      detail={`${orderKindLabel(kind)} · `}
      detailAccent={{
        text: kitchen.label,
        color: toneColor(kitchen.tone),
        bold: kitchen.tone !== "plain",
      }}
      value={formatCurrency(order.total_amount ?? 0)}
      divider={divider}
      onPress={handlePress}
    />
  );
});
