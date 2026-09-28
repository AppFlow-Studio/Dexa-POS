import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useMemo } from "react";
import { tableTitle } from "../../lib/tableName";
import { IN_USE_STATUSES } from "../../lib/tableStatus";
import type { TransferTarget } from "../../lib/transferServer";

/** One collator for the module — a `localeCompare` options bag builds a new one per call. */
const byTitle = new Intl.Collator(undefined, { numeric: true }).compare;

export interface MyOpenTable extends TransferTarget {
  title: string;
  /** Backend order id of the check, for its live total. */
  orderDbId: string | null;
}

/**
 * The signed-in server's occupied tables on every floor — what the low
 * battery sheet offers to hand off. A merged party is one row (one session),
 * titled "Tables 21 + 22" like the Tables tab.
 */
export function useMyOpenTables(): MyOpenTable[] {
  const me = useEmployeeStore((s) => s.loggedInEmployee?.profileId ?? null);
  const sessions = useTableSessionStore((s) => s.sessions);
  const active = useFloorPlanStore((s) => s.tables);
  const cache = useFloorPlanStore((s) => s.floorPlanCache);

  return useMemo(() => {
    if (!me) return [];
    const nameById = new Map<string, string>();
    for (const plan of Object.values(cache)) for (const t of plan.tables) nameById.set(t.id, t.name);
    for (const t of active) nameById.set(t.id, t.name);

    const seen = new Set<string>();
    const rows: MyOpenTable[] = [];
    for (const [tableId, session] of Object.entries(sessions)) {
      if (!session || session.server_staff_id !== me || !IN_USE_STATUSES.has(session.status)) continue;
      if (seen.has(session.id)) continue;
      const name = nameById.get(tableId);
      if (!name) continue;
      seen.add(session.id);
      const merged = (session.merged_tables ?? [])
        .filter((id) => id !== tableId)
        .map((id) => nameById.get(id))
        .filter((n): n is string => !!n);
      rows.push({ tableId, sessionId: session.id, title: tableTitle(name, merged), orderDbId: session.order_id ?? null });
    }
    return rows.sort((a, b) => byTitle(a.title, b.title));
  }, [me, sessions, active, cache]);
}
