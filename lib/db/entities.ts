/**
 * Entity descriptors — the single declaration of how each mirrored entity
 * behaves. Retention, station scoping and freshness thresholds live here as
 * data so there is no per-entity sync code to keep in step.
 *
 * Phase 1 populates the storage-policy half. Phase 2 adds `pullDelta` /
 * `pullManifest` and the descriptor becomes the whole sync contract.
 */
import type { StationKind } from "@/lib/db/policy";
import type { TableName } from "@/lib/db/schema";

export interface RetentionPolicy {
  /**
   * Hard row cap per location, enforced INSIDE the insert transaction (never
   * on a timer — a timer can be missed, and a burst can overshoot the cap
   * between ticks).
   *
   * null = uncapped, for tables that are replaced wholesale each sync and are
   * bounded by the size of the menu rather than by time.
   */
  maxRows: number | null;
  /** Secondary bound, where the data genuinely expires. null = no age bound. */
  maxAgeDays: number | null;
  /** Column the prune orders by — newest kept. */
  pruneBy: string;
}

export interface EntityDescriptor {
  /** Stable name. Keys `sync_state.entity` and every telemetry counter. */
  name: string;
  table: TableName;
  /** Child tables removed by ON DELETE CASCADE when a parent row is pruned. */
  children?: TableName[];
  /** Which station kinds may hold this entity at all. */
  stations: ReadonlySet<StationKind>;
  retention: RetentionPolicy;
  /**
   * How long before the freshness UI calls this stale. Deliberately per-entity:
   * the right threshold varies by an order of magnitude across the app.
   */
  staleAfterMs: number;
}

const MIN = 60_000;

/**
 * ⚠ PROVISIONAL CAPS — NOT YET DERIVED.
 *
 * These are placeholders so the retention machinery is exercisable, NOT chosen
 * values. The real numbers come from the Phase 1 measurement harness
 * (lib/db/measure.ts): bytes-per-row per table on the lowest-spec device, a
 * total device storage budget, and the observed workload
 * (cap = min(budget / bytes-per-row, workload x safety factor)).
 *
 * Do NOT carry the old MMKV-era constants across — MAX_CACHED_ORDERS = 200,
 * KDS_DONE_TICKET_LIMIT = 50 and friends were sized for in-memory JSON blobs
 * with no query engine, which is a completely different constraint. Record the
 * derivation in the plan doc §11 when these are set for real.
 */
const PROVISIONAL = {
  orders: 2000,
  customers: 5000,
  inventoryItems: 2000,
  staff: 500,
} as const;

const POS_ONLY: ReadonlySet<StationKind> = new Set<StationKind>(["pos"]);
const POS_AND_KIOSK: ReadonlySet<StationKind> = new Set<StationKind>([
  "pos",
  "kiosk",
]);

export const ENTITIES: Record<string, EntityDescriptor> = {
  orders: {
    name: "orders",
    table: "orders",
    // Both cascade from orders(id) — pruning a parent takes its items and
    // payments with it, so they need no cap of their own.
    children: ["order_items", "order_payments"],
    stations: POS_ONLY,
    retention: {
      maxRows: PROVISIONAL.orders,
      maxAgeDays: null,
      pruneBy: "created_at",
    },
    staleAfterMs: 5 * MIN,
  },

  menu: {
    name: "menu",
    table: "menu_items",
    children: [
      "menu_categories",
      "modifier_groups",
      "menu_item_modifier_groups",
    ],
    stations: POS_AND_KIOSK,
    // Replaced wholesale on each sync and bounded by the size of the menu, so
    // a row cap would only ever truncate a legitimately large menu.
    retention: { maxRows: null, maxAgeDays: null, pruneBy: "updated_at" },
    // Tight on purpose: a stale menu means ringing up yesterday's prices.
    staleAfterMs: 2 * MIN,
  },

  inventory: {
    name: "inventory",
    table: "inventory_items",
    children: ["vendors"],
    stations: POS_ONLY,
    retention: {
      maxRows: PROVISIONAL.inventoryItems,
      maxAgeDays: null,
      pruneBy: "updated_at",
    },
    // Stock is the most time-sensitive thing we mirror — 60s, not 5 minutes.
    staleAfterMs: 1 * MIN,
  },

  customers: {
    name: "customers",
    table: "customers",
    stations: POS_ONLY,
    retention: {
      maxRows: PROVISIONAL.customers,
      maxAgeDays: null,
      pruneBy: "last_order_date",
    },
    staleAfterMs: 15 * MIN,
  },

  staff: {
    name: "staff",
    table: "staff",
    stations: POS_ONLY,
    retention: {
      maxRows: PROVISIONAL.staff,
      maxAgeDays: null,
      pruneBy: "updated_at",
    },
    staleAfterMs: 60 * MIN,
  },
};

export type EntityName = keyof typeof ENTITIES;

export function getEntity(name: string): EntityDescriptor | undefined {
  return ENTITIES[name];
}

/** Descriptor for a table, if that table is an entity root (not a child). */
export function entityForTable(table: TableName): EntityDescriptor | undefined {
  return Object.values(ENTITIES).find((e) => e.table === table);
}
