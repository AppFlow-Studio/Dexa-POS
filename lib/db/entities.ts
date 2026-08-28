/**
 * Entity descriptors — the single declaration of how each mirrored entity
 * behaves. Retention, station scoping, freshness thresholds AND the delta
 * contract all live here as data, so there is no per-entity sync code to keep
 * in step. lib/db/syncEngine.ts is written once and drives every entity.
 *
 * The descriptor is also where the awkward per-table schema facts get absorbed.
 * `watermarkColumn` is deliberately per-entity rather than a global
 * `updated_at`, because it genuinely differs: order_payments has NO updated_at
 * or created_at on remote (only initiated_at / approved_at / voided_at), which
 * is why payments ride along as children of their parent order rather than
 * carrying a cursor of their own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { StationKind } from "@/lib/db/policy";
import type { TableName } from "@/lib/db/schema";
import type { EntityBatch } from "@/lib/db/write";

export interface RetentionPolicy {
  /**
   * Hard row cap per location, enforced INSIDE the insert transaction (never
   * on a timer — a timer can be missed, and a burst can overshoot the cap
   * between ticks).
   *
   * null = uncapped, for tables replaced wholesale each sync and bounded by
   * the size of the menu rather than by time.
   */
  maxRows: number | null;
  /** Secondary bound, where the data genuinely expires. null = no age bound. */
  maxAgeDays: number | null;
  /** Column the prune orders by — newest kept. Also the retention_floor source. */
  pruneBy: string;
}

export interface PullContext {
  supabase: SupabaseClient;
  locationId: string;
  /** Resume cursor. null on a cold sync. */
  since: string | null;
  /** Tiebreak for rows sharing a watermark value. null on a cold sync. */
  sinceId: string | null;
  limit: number;
  signal?: AbortSignal;
}

export interface DeltaPage {
  /** Rows already mapped to local columns, ready for the write boundary. */
  batch: EntityBatch;
  /**
   * Cursor of the LAST row in this page. The engine advances only to here, and
   * only if the whole page commits.
   */
  watermark: { value: string | null; id: string | null };
  /** True when the server likely has more rows past this page. */
  hasMore: boolean;
  /** Rows received before mapping — used to detect an empty (no-op) cycle. */
  received: number;
}

export interface ManifestContext {
  supabase: SupabaseClient;
  locationId: string;
  /** Oldest row we hold. The reconcile only verifies rows at or after this. */
  since: string;
  signal?: AbortSignal;
}

export interface EntityDescriptor {
  /** Stable name. Keys `sync_state.entity` and every telemetry counter. */
  name: string;
  table: TableName;
  primaryKey: string;
  /**
   * Column the server orders changes by. NOT always `updated_at` — see the
   * module header. Used for both the delta filter and the resume cursor.
   */
  watermarkColumn: string;
  /** Child tables written in the same transaction as the root row. */
  children?: TableName[];
  /** Which station kinds may hold this entity at all. */
  stations: ReadonlySet<StationKind>;
  retention: RetentionPolicy;
  /**
   * How long before the freshness UI calls this stale. Deliberately per-entity:
   * the right threshold varies by an order of magnitude across the app.
   */
  staleAfterMs: number;

  /** Fetch one page of changes. Absent = pull-only entity not yet implemented. */
  pullDelta?: (ctx: PullContext) => Promise<DeltaPage>;
  /**
   * Fetch id-only rows for the retained window, to detect HARD deletes.
   *
   * Most "deletions" in this schema are soft — voided_at, is_voided, is_active,
   * availability — and those ride the normal delta because they bump
   * updated_at. This exists for the genuine `DELETE`, which has no marker of
   * any kind (there is no deleted_at anywhere in the remote schema).
   */
  pullManifest?: (ctx: ManifestContext) => Promise<string[]>;
}

const MIN = 60_000;

/**
 * RETENTION CAPS — DERIVED 2026-08-28 (Phase 1 measurement, Samsung SM-P613).
 *
 * cap = min(budget / bytes-per-row, workload x safety factor).
 *
 * Measured on device (lib/db/measure.ts, EXPO_PUBLIC_DB_MEASURE=1):
 *   order_items 403 B/row · order_payments 1120 B/row · inventory_items 795 ·
 *   customers 786 · staff 328 · menu_items 1212. Orders' insert-diff reads 0 on
 *   a pre-populated table (rows reuse existing pages), so the orders number is
 *   the REAL payload from the mirror's actual rows: **1387 B/row** over 2,000
 *   orders (plus a small promoted-column/index overhead).
 *
 * Budget is NOT binding for any table — at a conservative 50 MB mirror budget,
 * 50 MB / bytes-per-row supports orders ≈ 15k, customers ≈ 66k, inventory
 * ≈ 66k, staff ≈ 160k. The caps below are therefore WORKLOAD-derived (how far
 * back a cashier looks up a check; how many customers/inventory a location
 * realistically holds), with the measured budget as an upper bound they never
 * approach:
 *   orders 2000 ≈ 47 days at the busiest location (42.6 orders/day, B1);
 *   customers 5000, inventory 2000, staff 500 — all generously above real
 *   volume (the device synced 18 staff and ~54 menu items).
 */
const RETENTION_CAPS = {
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

/**
 * Registry. Descriptors that own real queries live in lib/db/descriptors/ and
 * are merged in below; the rest are storage-policy-only until their phase.
 */
export const ENTITIES: Record<string, EntityDescriptor> = {
  orders: {
    name: "orders",
    table: "orders",
    primaryKey: "id",
    watermarkColumn: "updated_at",
    // Both cascade from orders(id) — pruning a parent takes its items and
    // payments with it, so they need no cap of their own.
    children: ["order_items", "order_payments"],
    stations: POS_ONLY,
    retention: {
      maxRows: RETENTION_CAPS.orders,
      maxAgeDays: null,
      pruneBy: "created_at",
    },
    staleAfterMs: 5 * MIN,
    // pullDelta / pullManifest attached below from descriptors/orders.ts
  },

  menu: {
    name: "menu",
    table: "menu_items",
    primaryKey: "id",
    watermarkColumn: "updated_at",
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
    primaryKey: "id",
    watermarkColumn: "updated_at",
    children: ["vendors"],
    stations: POS_ONLY,
    retention: {
      maxRows: RETENTION_CAPS.inventoryItems,
      maxAgeDays: null,
      pruneBy: "updated_at",
    },
    // Stock is the most time-sensitive thing we mirror — 60s, not 5 minutes.
    staleAfterMs: 1 * MIN,
  },

  customers: {
    name: "customers",
    table: "customers",
    primaryKey: "id",
    watermarkColumn: "updated_at",
    stations: POS_ONLY,
    retention: {
      maxRows: RETENTION_CAPS.customers,
      maxAgeDays: null,
      pruneBy: "last_order_date",
    },
    staleAfterMs: 15 * MIN,
  },

  staff: {
    name: "staff",
    table: "staff",
    primaryKey: "location_member_id",
    watermarkColumn: "updated_at",
    stations: POS_ONLY,
    retention: {
      maxRows: RETENTION_CAPS.staff,
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

/** Entities this station kind may sync, that have a delta implementation. */
export function syncableEntities(station: StationKind): EntityDescriptor[] {
  return Object.values(ENTITIES).filter(
    (e) => e.stations.has(station) && typeof e.pullDelta === "function",
  );
}

/**
 * Attach a query implementation to a descriptor.
 *
 * Descriptors are declared here (so the storage policy is readable in one
 * place) and their queries live in lib/db/descriptors/ (so this file does not
 * grow a Supabase dependency per entity). This is the seam between the two.
 */
export function registerEntityQueries(
  name: string,
  impl: Pick<EntityDescriptor, "pullDelta" | "pullManifest">,
): void {
  const entity = ENTITIES[name];
  if (!entity) {
    console.warn(
      `[LocalDB] cannot register queries for unknown entity ${name}`,
    );
    return;
  }
  if (impl.pullDelta) entity.pullDelta = impl.pullDelta;
  if (impl.pullManifest) entity.pullManifest = impl.pullManifest;
}
