import { toastService } from "@/lib/toastService";
import type { TableStatus } from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { closeTable, markClean } from "../../lib/tableClose";
import { StickyActionBar } from "../../primitives";

/** Statuses this bar has an action for — the register's TableContextSheet actions. */
export function hasTableAction(status: TableStatus | undefined): boolean {
  return status === "paid" || status === "cleaning";
}

/**
 * The floor plan's two closing actions, on the table page:
 *
 * - paid → "Close table": `CLEAR_TABLE`, the check is archived and the table
 *   goes to cleaning (TableContextSheet "Close Table").
 * - cleaning → "Mark clean": the table is available again ("Mark Clean").
 *
 * Replaces the check footer on those two statuses — a paid check has nothing
 * to pay or send, and a cleaning table has no check. No ownership gate: the
 * register's floor plan has none for these either.
 */
export function TableActionBar({ tableId, title, status }: { tableId: string; title: string; status: TableStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const cleaning = status === "cleaning";

  const run = async () => {
    setBusy(true);
    const ok = cleaning ? await markClean(tableId) : await closeTable(tableId);
    setBusy(false);
    if (ok) {
      // Closing leaves the page up with "Mark clean" next; a clean table has
      // nothing left here, so go back to Tables.
      if (cleaning) router.back();
      toastService.show(
        cleaning
          ? { title: `${title} is available`, message: "The table can be seated again.", type: "success" }
          : { title: `${title} closed`, message: "Mark it clean when it's ready.", type: "success" },
      );
    } else {
      toastService.show({
        title: cleaning ? "Not marked clean" : "Table not closed",
        message: "The table did not change. Try again.",
        type: "warning",
      });
    }
  };

  const label = busy ? (cleaning ? "Marking clean…" : "Closing…") : cleaning ? "Mark clean" : "Close table";
  return (
    <StickyActionBar
      column
      actions={[{ label, disabled: busy, onPress: () => void run() }]}
      hint={cleaning ? undefined : `${title} moves to cleaning`}
    />
  );
}
