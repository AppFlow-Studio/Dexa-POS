/**
 * THE write boundary. Every row that enters the local database goes through
 * `writeRows()` — the delta engine, realtime broadcasts, and (from Phase 7) the
 * outbox drain.
 *
 * There is exactly one of these on purpose. Three invariants have to hold for
 * every write in the system, and a single choke point is the only way to make
 * that structural rather than a convention someone has to remember:
 *
 *   1. STATION POLICY — a kiosk can never acquire order history, even if a
 *      later phase points it at the wrong descriptor (lib/db/policy.ts).
 *   2. RETENTION — pruning happens inside the SAME transaction as the insert,
 *      never on a timer. A timer can be missed, and a burst can overshoot the
 *      cap between ticks.
 *   3. ATOMICITY — a batch either lands whole or not at all, so a partial
 *      apply can never advance a sync watermark past rows that failed.
 *
 * Phase 1 ships this unused: nothing calls it yet. It exists now so that the
 * policy and retention tests in __tests__/db/ can prove it before any data
 * depends on it.
 */
import type { SQLiteDatabase } from "expo-sqlite";

import { getDb } from "@/lib/db/index";
import { type EntityDescriptor } from "@/lib/db/entities";
import { canStore, type StationKind } from "@/lib/db/policy";
import type { TableName } from "@/lib/db/schema";
import {
  KEY_DB_POLICY_REJECT,
  KEY_DB_PRUNED_ROWS,
  KEY_DB_WRITE_ERROR,
  KEY_DB_WRITE_MS,
  KEY_DB_WRITE_ROWS,
} from "@/lib/telemetry/keys";
import { recordCount, recordSample } from "@/lib/telemetry/registry";

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface WriteResult {
  written: number;
  pruned: number;
  /** True when station policy refused the write outright. */
  rejected: boolean;
}

const EMPTY: WriteResult = { written: 0, pruned: 0, rejected: false };

/**
 * Upsert rows for one entity, prune to retention, in a single transaction.
 *
 * `locationId` scopes the prune. Retention is per-location because a device can
 * legitimately hold two locations' data and one must not evict the other.
 */
export async function writeRows(
  entity: EntityDescriptor,
  station: StationKind,
  locationId: string,
  rows: Row[],
): Promise<WriteResult> {
  if (rows.length === 0) return EMPTY;

  // (1) Station policy. Checked before anything touches disk.
  if (!canStore(station, entity.table)) {
    recordCount(KEY_DB_POLICY_REJECT);
    console.warn(
      `[LocalDB] station "${station}" may not store "${entity.table}" — write refused`,
    );
    return { written: 0, pruned: 0, rejected: true };
  }

  const db = getDb();
  if (!db) return EMPTY;

  const started = Date.now();
  let pruned = 0;

  try {
    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        await upsertRow(db, entity.table, row);
      }
      // (2) Prune inside the same transaction as the insert.
      pruned = await pruneToRetention(db, entity, locationId);
    });

    recordSample(KEY_DB_WRITE_MS, Date.now() - started);
    recordCount(KEY_DB_WRITE_ROWS, rows.length);
    if (pruned > 0) recordCount(KEY_DB_PRUNED_ROWS, pruned);

    return { written: rows.length, pruned, rejected: false };
  } catch (error) {
    // (3) The transaction rolled back, so nothing landed. Reporting 0 written
    // is what stops a caller advancing a watermark past rows that failed.
    recordCount(KEY_DB_WRITE_ERROR);
    console.warn(`[LocalDB] write to ${entity.table} failed:`, error);
    return EMPTY;
  }
}

/**
 * INSERT ... ON CONFLICT DO UPDATE, built from the row's own keys.
 *
 * Column names come from the row object, which comes from a descriptor's
 * `toColumns()`. They are never user input — but they are still whitelisted
 * against the row's own keys and quoted, so a malformed descriptor produces a
 * SQL error rather than anything more interesting.
 */
async function upsertRow(
  db: SQLiteDatabase,
  table: TableName,
  row: Row,
): Promise<void> {
  const cols = Object.keys(row);
  if (cols.length === 0) return;

  const quoted = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  // The primary key is column 1 by convention in every descriptor; excluding
  // it from the UPDATE set is what keeps the identity trigger happy.
  const updates = cols
    .slice(1)
    .map((c) => `"${c}" = excluded."${c}"`)
    .join(", ");

  const sql = updates
    ? `INSERT INTO ${table} (${quoted}) VALUES (${placeholders})
       ON CONFLICT(${`"${cols[0]}"`}) DO UPDATE SET ${updates}`
    : `INSERT OR REPLACE INTO ${table} (${quoted}) VALUES (${placeholders})`;

  await db.runAsync(sql, cols.map((c) => row[c]));
}

/**
 * Enforce the row cap, newest kept, and record the retention floor.
 *
 * `retention_floor` is the oldest row that survived. Screens must read it and
 * state the window when a query reaches past it — an analytics range that
 * predates the floor has to say so rather than silently under-report revenue.
 */
async function pruneToRetention(
  db: SQLiteDatabase,
  entity: EntityDescriptor,
  locationId: string,
): Promise<number> {
  const { maxRows, pruneBy } = entity.retention;
  if (maxRows === null) return 0;

  const table = entity.table;

  // Keyed on the primary key of the surviving set. Child rows follow via
  // ON DELETE CASCADE, so items and payments need no prune of their own.
  const result = await db.runAsync(
    `DELETE FROM ${table}
      WHERE location_id = ?
        AND rowid NOT IN (
          SELECT rowid FROM ${table}
           WHERE location_id = ?
           ORDER BY "${pruneBy}" DESC
           LIMIT ?
        )`,
    [locationId, locationId, maxRows],
  );

  const floor = await db.getFirstAsync<{ floor: string | null }>(
    `SELECT MIN("${pruneBy}") AS floor FROM ${table} WHERE location_id = ?`,
    [locationId],
  );

  await db.runAsync(
    `INSERT INTO sync_state (entity, location_id, retention_floor, row_count)
     VALUES (?, ?, ?, (SELECT COUNT(*) FROM ${table} WHERE location_id = ?))
     ON CONFLICT(entity, location_id) DO UPDATE SET
       retention_floor = excluded.retention_floor,
       row_count       = excluded.row_count`,
    [entity.name, locationId, floor?.floor ?? null, locationId],
  );

  return result.changes ?? 0;
}
