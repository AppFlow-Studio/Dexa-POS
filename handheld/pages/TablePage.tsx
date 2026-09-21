import { logError } from "@/lib/logError";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect } from "react";
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

/**
 * A session's order that the store has not loaded (seated on another
 * station): fetch it, as useTableSession does on the register. A table
 * seated here is already in the store under the session's local order key.
 */
function useHydrateOrder(orderDbId: string | null, loaded: boolean) {
  useEffect(() => {
    if (!orderDbId || loaded) return;
    useOrderStore
      .getState()
      .syncOrderFromDatabase(orderDbId)
      .catch((e: unknown) => logError("order", "Handheld table order hydrate failed", e));
  }, [orderDbId, loaded]);
}

/** Screen 5: a table's check. Route: /handheld/table/[id]. */
export default function TablePage({ tableId }: { tableId: string }) {
  const now = useMinuteTick();
  const { summary, serverName } = useTableSummary(tableId, now);
  const local = useOrderStore((s) => (summary?.orderDbId ? (s.ordersById[summary.orderDbId] ?? null) : null));
  const byDbId = useOrderByDbId(summary?.orderDbId);
  const order = byDbId ?? local;
  useHydrateOrder(summary?.orderDbId ?? null, !!order);

  if (!summary) {
    return <CheckPage title="Table" orderId={null} emptyText="This table is no longer on the plan." />;
  }
  return (
    <CheckPage
      title={summary.title}
      subtitle={subtitle(summary, serverName)}
      orderId={order?.id ?? null}
      emptyText={
        summary.minutes === null
          ? "No one is seated here."
          : "Opening this table's check…"
      }
    />
  );
}
