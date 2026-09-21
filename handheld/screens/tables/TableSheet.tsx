import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { CheckBody } from "../../components/check/CheckBody";
import { useOrderByDbId } from "../../hooks/useOrderByDbId";
import { formatElapsed } from "../../lib/format";
import { tableStatusLabel } from "../../lib/tableStatus";
import { type } from "../../lib/type";
import { BottomSheet } from "../../primitives";
import { useTableLive } from "./useTableLive";
import type { TableRowData } from "./useTableRows";

function guestsLabel(n: number | null): string {
  if (!n) return "";
  return n === 1 ? "1 guest" : `${n} guests`;
}

/** Subtitle in the artifact's words: "4 guests · 25 min", or the free state. */
function subtitle(row: TableRowData, serverName: string | null): string {
  if (row.minutes === null) {
    return row.capacity ? `${tableStatusLabel(row.status)} · seats ${row.capacity}` : tableStatusLabel(row.status);
  }
  const parts = [guestsLabel(row.guests), formatElapsed(row.minutes)];
  if (serverName) parts.push(serverName);
  return parts.filter(Boolean).join(" · ");
}

/** Sheet body: the check (screen 5, read-only) or a one-line free state. */
function Body({ row }: { row: TableRowData }) {
  const { session } = useTableLive(row.id);
  const order = useOrderByDbId(session?.order_id ?? row.orderDbId);
  if (order) return <CheckBody orderId={order.id} />;
  return (
    <View className="px-5 pb-6 pt-1">
      <Text style={[type.sheetDesc, { color: colors.label }]}>
        {row.minutes === null ? "No one is seated here." : "No check has been started for this table yet."}
      </Text>
    </View>
  );
}

/**
 * Tapping a table in this wave opens its check read-only. Seating, adding
 * items and paying are later waves, so the sheet has no footer actions.
 */
export function TableSheet({ row, onClose }: { row: TableRowData | null; onClose: () => void }) {
  const { serverName } = useTableLive(row?.id ?? "");
  return (
    <BottomSheet
      visible={row !== null}
      onClose={onClose}
      title={row?.title}
      subtitle={row ? subtitle(row, serverName) : undefined}
    >
      {row ? <Body row={row} /> : null}
    </BottomSheet>
  );
}
