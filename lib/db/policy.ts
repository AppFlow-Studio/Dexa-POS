/**
 * Station scoping for the local database.
 *
 * Kiosks and KDS units are the cheapest hardware in the building and need the
 * least data. Mirroring order history, customers or the staff roster onto a
 * self-service tablet in the dining room is storage we don't need and PII
 * exposure we don't want.
 *
 * The important design choice: this is enforced at the WRITE boundary, inside
 * the single helper in lib/db/write.ts — never at the read. A device that
 * shouldn't have the data can then never *acquire* it, even if a later screen
 * is pointed at the local DB by mistake. Enforcing on read would leave the rows
 * sitting on disk, which is the part that actually matters for PII.
 *
 * The station idiom already exists (contexts/PosSyncProvider.tsx gates ~20
 * subsystems on `station_type === "kds"`, lib/authFlow.ts maps "self_service"
 * -> kiosk). This extends it rather than inventing a parallel mechanism.
 */
import type { TableName } from "@/lib/db/schema";

export type StationKind = "pos" | "kds" | "kiosk";

/**
 * Mirrors resolvePostLoginRoute() in lib/authFlow.ts. Kept as a separate
 * function because that one returns a route and this one returns a capability;
 * they answer different questions and should be free to diverge.
 */
export function stationKind(stationType?: string | null): StationKind {
  if (stationType === "kds") return "kds";
  if (stationType === "self_service") return "kiosk";
  return "pos";
}

/**
 * What each station kind is allowed to store on disk.
 *
 * A kiosk is an ordering surface: it needs the menu and nothing else — no
 * history, no customers, no staff roster. A KDS shows tickets; item names ride
 * along on the ticket payload, so it does not need the menu tree either.
 */
const POLICY: Record<StationKind, ReadonlySet<TableName>> = {
  pos: new Set<TableName>([
    "orders",
    "order_items",
    "order_payments",
    "menu_categories",
    "menu_items",
    "modifier_groups",
    "menu_item_modifier_groups",
    "inventory_items",
    "vendors",
    "customers",
    "staff",
    "sync_state",
  ]),
  kiosk: new Set<TableName>([
    "menu_categories",
    "menu_items",
    "modifier_groups",
    "menu_item_modifier_groups",
    "sync_state",
  ]),
  // KDS ticket storage arrives in Phase 5 (kds history). Until then a KDS
  // device stores nothing but its own sync bookkeeping.
  kds: new Set<TableName>(["sync_state"]),
};

/**
 * The guard. Called by every write path, without exception.
 *
 * Returns false rather than throwing: a sync cycle running on a kiosk should
 * quietly skip the tables it may not hold, not crash. The write helper counts
 * the rejections so a misconfigured descriptor is visible in telemetry rather
 * than silent.
 */
export function canStore(kind: StationKind, table: TableName): boolean {
  return POLICY[kind].has(table);
}

/** Tables this station kind must NOT hold — the purge list on station change. */
export function forbiddenTables(kind: StationKind): TableName[] {
  const allowed = POLICY[kind];
  return ([...POLICY.pos] as TableName[]).filter((t) => !allowed.has(t));
}
