import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useCallback } from "react";
import { formatCurrency, formatElapsed, minutesSince } from "../../lib/format";
import { checkNumber, checkPlace, itemCountLabel } from "../../lib/openChecks";
import { ListRow } from "../../primitives";

/**
 * One Checks row. Subscribes to its own profile only, so a broadcast that
 * touches a different order never re-renders it.
 */
export const CheckRow = React.memo(function CheckRow({
  orderId,
  now,
  onPress,
}: {
  orderId: string;
  now: number;
  onPress: (orderId: string) => void;
}) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const handlePress = useCallback(() => onPress(orderId), [onPress, orderId]);
  if (!order) return null;

  const partial = order.paid_status === "Partial";
  const subtitle = [order.server_name, itemCountLabel(order)]
    .filter(Boolean)
    .join(" · ");
  const age = formatElapsed(minutesSince(order.opened_at, now));

  return (
    <ListRow
      title={checkNumber(order)}
      badge={checkPlace(order) || undefined}
      subtitle={subtitle}
      value={formatCurrency(order.total_amount ?? 0)}
      meta={partial ? `Partial · ${age}` : age}
      dotColor={partial ? colors.paymentPartial : undefined}
      onPress={handlePress}
      chevron
    />
  );
});
