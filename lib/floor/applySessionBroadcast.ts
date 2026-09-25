import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import type {
  FloorPlanObject,
  TableSession,
  TableStatus,
} from "@/types/db-floor-plan-types";

/**
 * Payload of a `location:{id}:tables` INSERT/UPDATE broadcast, as built by
 * public.broadcast_table_session_changes().
 */
export interface SessionBroadcastPayload {
  operation?: string;
  timestamp?: string;
  data?: {
    session?: {
      id?: string;
      status?: string;
      is_active?: boolean;
      party_size?: number | null;
      server_staff_id?: string | null;
      guest_name?: string | null;
      guest_phone?: string | null;
      guest_notes?: string | null;
      seated_at?: string | null;
      current_course?: number | null;
      needs_attention?: boolean | null;
      is_vip?: boolean | null;
      order_id?: string | null;
      session_number?: string | null;
    } | null;
    tables?: Array<{ table_id?: string; is_primary?: boolean }> | null;
  } | null;
}

export interface SessionBroadcastResult {
  tables: FloorPlanObject[];
  /** Tables whose session was set, replaced or removed. */
  changedTables: FloorPlanObject[];
}

/**
 * Apply one table-session broadcast to the floor's tables, with the same
 * rules as the authoritative refresh (get_location_table_status_v2):
 *   - a session shows on the tables in its active junction rows;
 *   - an inactive or `cleaning` session shows on no table;
 *   - a live local-only status for the SAME session is never overwritten;
 *   - a session cleared locally within the TTL is treated as gone.
 *
 * Returns null when the payload cannot be applied safely (no session, no
 * `is_active` — i.e. the database predates the payload fields — or no table
 * list); the caller then falls back to a reconcile.
 */
export function applySessionBroadcast(
  tables: FloorPlanObject[],
  payload: SessionBroadcastPayload | null | undefined,
  wasRecentlyCleared: (sessionId: string) => boolean,
): SessionBroadcastResult | null {
  const session = payload?.data?.session;
  const junction = payload?.data?.tables;
  if (
    !session?.id ||
    !session.status ||
    typeof session.is_active !== "boolean" ||
    (junction != null && !Array.isArray(junction))
  ) {
    return null;
  }

  const sessionId = session.id;
  const tableIds = new Set(
    (junction ?? [])
      .map((row) => row?.table_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const gone =
    !session.is_active ||
    session.status === "cleaning" ||
    wasRecentlyCleared(sessionId);

  const mergedTableIds = tableIds.size > 1 ? [...tableIds] : undefined;
  const changedTables: FloorPlanObject[] = [];

  const next = tables.map((table) => {
    const current = table.session;
    const holdsThisSession = current?.id === sessionId;
    const shouldHold = !gone && tableIds.has(table.id);

    if (!shouldHold && !holdsThisSession) return table;

    if (!shouldHold) {
      // Session moved off this table, ended, or went to cleaning.
      const cleared = { ...table, session: undefined };
      changedTables.push(cleared);
      return cleared;
    }

    if (current && holdsThisSession && isLocalOnlyStatus(current.status)) {
      return table;
    }

    // Fields the broadcast doesn't carry (e.g. reservation_id) survive from
    // the same session; a different session on this table is replaced.
    const base: Partial<TableSession> = holdsThisSession ? current! : {};
    const nextSession: TableSession = {
      ...base,
      id: sessionId,
      session_number: session.session_number ?? base.session_number,
      status: session.status as TableStatus,
      party_size: session.party_size ?? 0,
      guest_name: session.guest_name,
      guest_phone: session.guest_phone ?? undefined,
      guest_notes: session.guest_notes ?? base.guest_notes,
      order_id: session.order_id,
      server_staff_id: session.server_staff_id ?? undefined,
      seated_at: session.seated_at ?? base.seated_at ?? new Date().toISOString(),
      current_course: session.current_course ?? 1,
      needs_attention: session.needs_attention ?? false,
      is_vip: session.is_vip ?? false,
      merged_tables: mergedTableIds,
    };
    const updated = { ...table, session: nextSession };
    changedTables.push(updated);
    return updated;
  });

  return { tables: next, changedTables };
}
