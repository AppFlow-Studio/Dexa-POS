import React from "react";
import { useMinuteTick } from "../hooks/useMinuteTick";
import { useOrderByDbId } from "../hooks/useOrderByDbId";
import { useTableSummary } from "../hooks/useTableSummary";
import { formatElapsed } from "../lib/format";
import { tableStatusLabel } from "../lib/tableStatus";
import type { TableSummary } from "../lib/tableSummary";
import { CheckPage } from "./CheckPage";

function guestsLabel(n: number | null): string {
  if (!n) return "";
  return n === 1 ? "1 guest" : `${n} guests`;
}

/** "4 guests · 25 min · Marcus", or the free state "Available · seats 4". */
function subtitle(t: TableSummary, serverName: string | null): string {
  if (t.minutes === null) {
    return t.capacity ? `${tableStatusLabel(t.status)} · seats ${t.capacity}` : tableStatusLabel(t.status);
  }
  return [guestsLabel(t.guests), formatElapsed(t.minutes), serverName].filter(Boolean).join(" · ");
}

/** Screen 5, read-only: a table's check. Route: /handheld/table/[id]. */
export default function TablePage({ tableId }: { tableId: string }) {
  const now = useMinuteTick();
  const { summary, serverName } = useTableSummary(tableId, now);
  const order = useOrderByDbId(summary?.orderDbId);

  if (!summary) {
    return <CheckPage title="Table" orderId={null} emptyText="This table is no longer on the floor plan." />;
  }
  return (
    <CheckPage
      title={summary.title}
      subtitle={subtitle(summary, serverName)}
      orderId={order?.id ?? null}
      emptyText={
        summary.minutes === null
          ? "No one is seated here."
          : "No check has been started for this table yet."
      }
    />
  );
}
