import { colors } from "@/lib/theme";
import React, { useCallback } from "react";
import { useOrderByDbId } from "../../hooks/useOrderByDbId";
import { formatCurrency, formatElapsed } from "../../lib/format";
import { tableStatusLabel, tableTint } from "../../lib/tableStatus";
import { ListRow } from "../../primitives";
import type { TableRowData } from "./useTableRows";

/**
 * One Tables row: the table number in a status-tinted tile, "Status · time"
 * (time in warning colour when overtime, "seats N" when free) and the linked
 * check's total. Props are primitives plus a stable callback; only the total
 * is a live subscription, scoped to this table's own order.
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
  onPress,
}: TableRowData & { divider: boolean; onPress: (tableId: string) => void }) {
  const total = useOrderByDbId(orderDbId)?.total_amount;
  const handlePress = useCallback(() => onPress(id), [onPress, id]);

  const free = minutes === null;
  const detail = free
    ? capacity
      ? `${tableStatusLabel(status)} · seats ${capacity}`
      : tableStatusLabel(status)
    : `${tableStatusLabel(status)} · `;
  const accent = free
    ? undefined
    : { text: formatElapsed(minutes), color: overtime ? colors.warning : colors.label };

  return (
    <ListRow
      tile={{ label: tileLabel, ...tableTint(status, overtime) }}
      title={title}
      detail={detail}
      detailAccent={accent}
      value={total !== undefined ? formatCurrency(total) : undefined}
      divider={divider}
      onPress={handlePress}
    />
  );
});
