import { colors } from "@/lib/theme";
import React, { useCallback } from "react";
import { Text, View } from "react-native";
import { useOrderByDbId } from "../../hooks/useOrderByDbId";
import { formatCurrency, formatElapsed } from "../../lib/format";
import { tableStatusLabel, tableTint } from "../../lib/tableStatus";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { ListRow } from "../../primitives";
import { canSeat } from "../seat/useSeatTable";
import type { TableRowData } from "./useTableRows";

/** The artifact's `.seatbtn`: a 36dp accent pill where a free table's total would be. */
function SeatPill() {
  return (
    <View className="justify-center rounded-full px-4" style={{ minHeight: 36, backgroundColor: tint.accentSoft }}>
      <Text style={[type.segment, { color: colors.teal }]}>Seat</Text>
    </View>
  );
}

/**
 * One Tables row: the table number in a status-tinted tile, "Status · time"
 * (time in warning colour when overtime, "seats N" when free) and the linked
 * check's total — or a "Seat" pill when the table can be seated, in which
 * case the row opens the seat page (`onSeat`) instead of the check.
 * Props are primitives plus stable callbacks; only the total is a live
 * subscription, scoped to this table's own order.
 */
export const TableRow = React.memo(function TableRow({
  id,
  title,
  tileLabel,
  status,
  capacity,
  minutes,
  overtime,
  orderDbId,
  divider,
  dark,
  onPress,
  onSeat,
}: TableRowData & {
  divider: boolean;
  dark: boolean;
  onPress: (tableId: string) => void;
  onSeat: (tableId: string) => void;
}) {
  const total = useOrderByDbId(orderDbId)?.total_amount;
  const seatable = canSeat(status);
  const handlePress = useCallback(() => (seatable ? onSeat(id) : onPress(id)), [seatable, onSeat, onPress, id]);

  const free = minutes === null;
  const detail = free
    ? capacity
      ? `${tableStatusLabel(status)} · seats ${capacity}`
      : tableStatusLabel(status)
    : `${tableStatusLabel(status)} · `;
  const accent = free
    ? undefined
    : {
        text: formatElapsed(minutes),
        color: overtime ? colors.warning : colors.label,
        bold: overtime,
      };

  return (
    <ListRow
      tile={{ label: tileLabel, ...tableTint(status, overtime, dark) }}
      title={title}
      detail={detail}
      detailAccent={accent}
      value={total !== undefined ? formatCurrency(total) : undefined}
      right={seatable ? <SeatPill /> : undefined}
      divider={divider}
      onPress={handlePress}
    />
  );
});
