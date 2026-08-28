/**
 * THE write boundary. Every row that enters the local database goes through
 * `writeBatch()` — the delta engine, realtime broadcasts, and (from Phase 7)
 * the outbox drain.
 *
 * There is exactly one of these on purpose. Four invariants have to hold for
 * every write in the system, and a single choke point is the only way to make
 * that structural rather than a convention someone has to remember:
 *
 *   1. STATION POLICY — a kiosk can never acquire order history, even if a
 *      later phase points it at the wrong descriptor (lib/db/policy.ts).
 *   2. RETENTION — pruning happens inside the SAME transaction as the insert,
 *      never on a timer. A timer can be missed, and a burst can overshoot the
 *      cap between ticks.
 *   3. ATOMICITY — a batch either lands whole or not at all.
 *   4. WATERMARK — the sync cursor advances inside that SAME transaction.
 *
 * (4) is the one that is easy to get wrong and expensive to debug. If the
 * watermark is written outside the transaction, a partial failure leaves the
 * cursor past rows that never landed, and the delta engine will never fetch
 * them again — a silent, permanent hole in the local data that no retry heals.
 * Passing the watermark INTO this function, rather than letting the caller
 * write it afterwards, is what makes that mistake unavailable.
 */
import { Mutex } from "async-mutex";
import type { SQLiteDatabase } from "expo-sqlite";

import type { EntityDescriptor } from "@/lib/db/entities";
import { getDb } from "@/lib/db/index";
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

/** Root rows plus any child-table rows that must land in the same transaction. */
export interface EntityBatch {
  root: Row[];
  children?: Partial<Record<TableName, Row[]>>;
}

/** The cursor to advance, iff every row in the batch commits. */
export interface WatermarkAdvance {
  value: string | null;
  id: string | null;
}

export interface WriteResult {
  written: number;
  childrenWritten: number;
  pruned: number;
  /** True when station policy refused the write outright. */
  rejected: boolean;
  /** False when the transaction rolled back — the caller must NOT advance. */
  committed: boolean;
}

const EMPTY: WriteResult = {
  written: 0,
  childrenWritten: 0,
  pruned: 0,
  rejected: false,
  committed: false,
};

/**
 * Serializes every transaction on the single SQLite connection.
 *
 * expo-sqlite does NOT queue `withTransactionAsync` calls: two overlapping
 * ones on the same connection fail with "cannot start a transaction within a
 * transaction". The delta engine, realtime apply, the manifest reconcile and
 * the station purge can all fire near-simultaneously (especially around effect
 * re-runs), so every transaction goes through this mutex — FIFO, never nested.
 */
export const dbWriteMutex = new Mutex();

/**
 * Apply a batch for one entity: upsert root + children, prune to retention,
 * advance the watermark. One transaction, all or nothing.
 */
export async function writeBatch(
  entity: EntityDescriptor,
  station: StationKind,
  locationId: string,
  batch: EntityBatch,
  watermark?: WatermarkAdvance,
  syncMeta?: { lastSuccessAt?: string; lastError?: string | null },
): Promise<WriteResult> {
  const childTables = Object.keys(batch.children ?? {}) as TableName[];

  // (1) Station policy — checked before anything touches disk, for the root
  // AND every child table. A descriptor that fans out into a forbidden table
  // is refused whole rather than partially applied.
  for (const table of [entity.table, ...childTables]) {
    if (!canStore(station, table)) {
      recordCount(KEY_DB_POLICY_REJECT);
      console.warn(
        `[LocalDB] station "${station}" may not store "${table}" — batch refused`,
      );
      return { ...EMPTY, rejected: true };
    }
  }

  const hasRows =
    batch.root.length > 0 ||
    childTables.some((t) => batch.children![t]!.length);

  // An empty delta page still has to record "we checked, nothing changed" —
  // that is what keeps the freshness stamp honest on a quiet minute.
  if (!hasRows && !watermark && !syncMeta) return { ...EMPTY, committed: true };

  const db = getDb();
  if (!db) return EMPTY;

  const started = Date.now();
  let pruned = 0;
  let childrenWritten = 0;

  try {
    // The single SQLite connection cannot run two transactions at once; the
    // mutex makes every writeBatch (delta, realtime, reconcile) FIFO.
    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        for (const row of batch.root) {
          await upsertRow(db, entity.table, row);
        }
        for (const table of childTables) {
          for (const row of batch.children![table]!) {
            await upsertRow(db, table, row);
            childrenWritten += 1;
          }
        }

        // (2) Prune inside the same transaction as the insert.
        pruned = await pruneToRetention(db, entity, locationId);

        // (4) Watermark, still inside the transaction. If any statement above
        // threw, we never get here and the cursor stays where it was.
        await writeSyncState(db, entity, locationId, watermark, syncMeta);
      });
    });

    recordSample(KEY_DB_WRITE_MS, Date.now() - started);
    recordCount(KEY_DB_WRITE_ROWS, batch.root.length + childrenWritten);
    if (pruned > 0) recordCount(KEY_DB_PRUNED_ROWS, pruned);

    return {
      written: batch.root.length,
      childrenWritten,
      pruned,
      rejected: false,
      committed: true,
    };
  } catch (error) {
    // (3) The transaction rolled back, so nothing landed — including the
    // watermark. Reporting committed:false is what stops the caller advancing.
    recordCount(KEY_DB_WRITE_ERROR);
    console.warn(`[LocalDB] write to ${entity.table} failed:`, error);
    return EMPTY;
  }
}

/** Single-table convenience wrapper. Same boundary, same guarantees. */
export async function writeRows(
  entity: EntityDescriptor,
  station: StationKind,
  locationId: string,
  rows: Row[],
): Promise<WriteResult> {
  return writeBatch(entity, station, locationId, { root: rows });
}

/**
 * INSERT ... ON CONFLICT DO UPDATE, built from the row's own keys.
 *
 * Column names come from a descriptor's `toColumns()`, never from user input,
 * but they are still taken only from the row's own keys and quoted — so a
 * malformed descriptor produces a SQL error rather than anything more
 * interesting.
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
       ON CONFLICT("${cols[0]}") DO UPDATE SET ${updates}`
    : `INSERT OR REPLACE INTO ${table} (${quoted}) VALUES (${placeholders})`;

  await db.runAsync(
    sql,
    cols.map((c) => row[c]),
  );
}

/**
 * Enforce the row cap, newest kept.
 *
 * Returns the number pruned. `retention_floor` — the oldest surviving row — is
 * recorded by writeSyncState() below; screens read it to state their window
 * when a query reaches past it, rather than silently under-reporting.
 */
async function pruneToRetention(
  db: SQLiteDatabase,
  entity: EntityDescriptor,
  locationId: string,
): Promise<number> {
  const { maxRows, pruneBy } = entity.retention;
  if (maxRows === null) return 0;

  const result = await db.runAsync(
    `DELETE FROM ${entity.table}
      WHERE location_id = ?
        AND rowid NOT IN (
          SELECT rowid FROM ${entity.table}
           WHERE location_id = ?
           ORDER BY "${pruneBy}" DESC
           LIMIT ?
        )`,
    [locationId, locationId, maxRows],
  );

  return result.changes ?? 0;
}

/**
 * Upsert the sync_state row: watermark, floor, row count, timestamps.
 *
 * Only overwrites the watermark when one is supplied, so a realtime broadcast
 * (which carries no cursor) can update rows without disturbing the delta
 * engine's position in the stream.
 */
async function writeSyncState(
  db: SQLiteDatabase,
  entity: EntityDescriptor,
  locationId: string,
  watermark: WatermarkAdvance | undefined,
  meta: { lastSuccessAt?: string; lastError?: string | null } | undefined,
): Promise<void> {
  const floor = await db.getFirstAsync<{ floor: string | null }>(
    `SELECT MIN("${entity.retention.pruneBy}") AS floor
       FROM ${entity.table} WHERE location_id = ?`,
    [locationId],
  );

  await db.runAsync(
    `INSERT INTO sync_state
       (entity, location_id, watermark, watermark_id,
        last_success_at, last_attempt_at, last_error, retention_floor, row_count,
        retention_cap)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
             (SELECT COUNT(*) FROM ${entity.table} WHERE location_id = ?), ?)
     ON CONFLICT(entity, location_id) DO UPDATE SET
       watermark       = COALESCE(excluded.watermark, sync_state.watermark),
       watermark_id    = COALESCE(excluded.watermark_id, sync_state.watermark_id),
       last_success_at = COALESCE(excluded.last_success_at, sync_state.last_success_at),
       last_attempt_at = excluded.last_attempt_at,
       last_error      = excluded.last_error,
       retention_floor = excluded.retention_floor,
       row_count       = excluded.row_count,
       retention_cap   = excluded.retention_cap`,
    [
      entity.name,
      locationId,
      watermark?.value ?? null,
      watermark?.id ?? null,
      meta?.lastSuccessAt ?? null,
      new Date().toISOString(),
      meta?.lastError ?? null,
      floor?.floor ?? null,
      locationId,
      entity.retention.maxRows,
    ],
  );
}

/** Record a failed sync attempt without touching the watermark or any row. */
export async function recordSyncFailure(
  entity: EntityDescriptor,
  locationId: string,
  error: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.runAsync(
      `INSERT INTO sync_state (entity, location_id, last_attempt_at, last_error)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(entity, location_id) DO UPDATE SET
         last_attempt_at = excluded.last_attempt_at,
         last_error      = excluded.last_error`,
      [entity.name, locationId, new Date().toISOString(), error],
    );
  } catch {
    // A bookkeeping failure must not mask the sync failure it is recording.
  }
}
