/**
 * The delta sync engine — "fetch only what changed".
 *
 * One loop, driven entirely by entity descriptors. Written once; every entity
 * gets it for free.
 *
 *   1. read the watermark from sync_state
 *   2. pullDelta(since = watermark, limit = PAGE)   // ascending by watermark
 *   3. ONE TRANSACTION: upsert rows -> prune to retention -> advance watermark
 *   4. if hasMore, repeat from 2 (the watermark has advanced, so no drift)
 *
 * Four properties this buys, each of which is a bug the current code has:
 *
 *   - RESUMABLE. A pull interrupted at page 3 of 9 resumes at page 3. Today a
 *     failed get_pos_bootstrap_v1 throws the whole payload away.
 *   - NO OFFSET DRIFT. Keyset pagination on (watermark, id), not OFFSET. Rows
 *     inserted mid-pull cannot cause a skip or a duplicate — which is exactly
 *     what usePreviousOrdersStore.goToPage risks today with
 *     `offset: page * 50`.
 *   - IDEMPOTENT. Re-running from the same watermark re-upserts the same rows.
 *     Safe to retry blindly.
 *   - BOUNDED. A steady-state pull on a quiet minute returns ZERO rows and
 *     costs one round trip with an empty result set, instead of the full
 *     536-1108 ms embed.
 *
 * The tiebreak is not optional. Two rows can share a millisecond; with a bare
 * `> watermark` those rows are skipped forever, and with `>= watermark` the
 * loop never terminates. Every cursor here is the PAIR (watermark, id).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EntityDescriptor } from "@/lib/db/entities";
import { getDb, isLocalDbReady } from "@/lib/db/index";
import type { StationKind } from "@/lib/db/policy";
import { dbWriteMutex, recordSyncFailure, writeBatch } from "@/lib/db/write";
import {
  KEY_SYNC_CYCLE_MS,
  KEY_SYNC_EMPTY_CYCLE,
  KEY_SYNC_ERROR,
  KEY_SYNC_MANIFEST_DELETED,
  KEY_SYNC_MANIFEST_MS,
  KEY_SYNC_PAGES,
  KEY_SYNC_ROWS,
} from "@/lib/telemetry/keys";
import { recordCount, recordSample } from "@/lib/telemetry/registry";

/** Rows per page. Small enough to keep a failed page cheap to redo. */
export const DEFAULT_PAGE_SIZE = 200;

/**
 * How far BEHIND the newest row seen the cursor is allowed to settle.
 *
 * ---------------------------------------------------------------------------
 * This exists because of a real, silent, permanent data-loss bug. Read before
 * changing it.
 * ---------------------------------------------------------------------------
 *
 * `orders.updated_at` is set by the BEFORE UPDATE trigger
 * `update_orders_updated_at` -> `update_updated_at_column()`, which stamps
 * `now()`. In Postgres `now()` is TRANSACTION START time, not commit time. So
 * a row's timestamp is assigned when its transaction begins, but the row only
 * becomes VISIBLE to other sessions when that transaction commits.
 *
 * That gap loses rows:
 *
 *   10:00:00.000  txn A begins, updates order X   -> X.updated_at = .000
 *   10:00:00.100  txn B begins, updates order Y   -> Y.updated_at = .100
 *   10:00:00.150  txn B COMMITS                    (Y now visible)
 *   10:00:00.200  delta pull: sees Y, not X. Cursor -> .100
 *   10:00:00.500  txn A COMMITS                    (X now visible)
 *   10:00:01.000  delta pull: WHERE updated_at > .100
 *                 X.updated_at is .000, so X is NEVER fetched again.
 *
 * X is permanently missing from the mirror. No retry heals it, because the
 * engine correctly believes it has already read past that instant. The
 * manifest reconcile does not help either — it detects deletions, not missed
 * updates.
 *
 * The fix is to keep the cursor a fixed interval behind the newest timestamp
 * seen, so any transaction that was in flight has committed by the time the
 * cursor passes its start time. The cost is re-reading the last few seconds of
 * changes on every cycle — which is free, because upserts are idempotent and
 * the window is tiny.
 *
 * 5s is comfortably longer than any POS write transaction (they are
 * milliseconds; the slowest RPCs are tens of ms). Raise it if a long-running
 * migration or batch job ever writes to a mirrored table.
 */
export const WATERMARK_LAG_MS = 5_000;

/**
 * Where the cursor should actually be persisted, given the newest row seen.
 *
 * Never moves backwards: a lag that regressed the cursor every cycle would
 * re-read the same window forever. Once the cursor reaches `now - lag` it
 * simply stays there until newer rows arrive, which is the intended
 * steady state.
 *
 * The returned `id` is null whenever the lag applied, because a lagged
 * timestamp does not correspond to any real row and therefore has no tiebreak.
 * `applyKeyset` reads a null id as "inclusive of this instant" (gte), so rows
 * sitting exactly on the boundary are re-read rather than skipped.
 */
export function computeLaggedCursor(
  seen: { value: string | null; id: string | null },
  current: SyncCursor,
  opts: { lagMs?: number; now?: number; caughtUp: boolean },
): { value: string | null; id: string | null } {
  // Mid-backlog: we are far behind real time, so no in-flight transaction can
  // be hiding ahead of us. Take the exact row cursor and keep paging.
  if (!opts.caughtUp) return seen;
  if (!seen.value) return seen;

  const lagMs = opts.lagMs ?? WATERMARK_LAG_MS;
  const now = opts.now ?? Date.now();
  const boundary = new Date(now - lagMs).toISOString();

  // Settle at whichever is older: the newest row we saw, or the lag boundary.
  const target = seen.value < boundary ? seen.value : boundary;

  // Never regress.
  if (current.watermark && target <= current.watermark) {
    return { value: current.watermark, id: current.watermarkId };
  }
  return { value: target, id: target === seen.value ? seen.id : null };
}

/**
 * Hard stop on pages per cycle.
 *
 * A cold sync of a large history legitimately needs many pages, but an
 * unbounded loop is how a descriptor bug (a watermark that never advances)
 * turns into an infinite request storm against production. The cycle stops,
 * reports `hitPageLimit`, and the next cycle resumes exactly where it left off
 * — which is safe precisely because the loop is resumable.
 */
export const MAX_PAGES_PER_CYCLE = 50;

export interface SyncCycleResult {
  entity: string;
  pages: number;
  rowsWritten: number;
  hitPageLimit: boolean;
  /** True when the server had nothing new — the steady-state case. */
  wasEmpty: boolean;
  error: string | null;
}

export interface SyncCursor {
  watermark: string | null;
  watermarkId: string | null;
}

/** Read the resume cursor. A missing row means "never synced" -> cold sync. */
export async function readCursor(
  entityName: string,
  locationId: string,
): Promise<SyncCursor> {
  const db = getDb();
  if (!db) return { watermark: null, watermarkId: null };
  try {
    const row = await db.getFirstAsync<{
      watermark: string | null;
      watermark_id: string | null;
    }>(
      `SELECT watermark, watermark_id FROM sync_state
        WHERE entity = ? AND location_id = ?`,
      [entityName, locationId],
    );
    return {
      watermark: row?.watermark ?? null,
      watermarkId: row?.watermark_id ?? null,
    };
  } catch {
    return { watermark: null, watermarkId: null };
  }
}

export async function readRetentionFloor(
  entityName: string,
  locationId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<{ retention_floor: string | null }>(
      `SELECT retention_floor FROM sync_state WHERE entity = ? AND location_id = ?`,
      [entityName, locationId],
    );
    return row?.retention_floor ?? null;
  } catch {
    return null;
  }
}

/**
 * Pull every change for one entity since its watermark.
 *
 * Never throws: a sync failure is recorded to sync_state (so the freshness UI
 * can show it) and returned, because a background sync must not be able to take
 * down a screen.
 */
export async function syncEntity(
  entity: EntityDescriptor,
  station: StationKind,
  supabase: SupabaseClient,
  locationId: string,
  opts: { pageSize?: number; lagMs?: number; signal?: AbortSignal } = {},
): Promise<SyncCycleResult> {
  const result: SyncCycleResult = {
    entity: entity.name,
    pages: 0,
    rowsWritten: 0,
    hitPageLimit: false,
    wasEmpty: true,
    error: null,
  };

  if (!entity.pullDelta) {
    result.error = "no pullDelta implementation";
    return result;
  }
  if (!entity.stations.has(station)) {
    // Not an error — a kiosk simply has nothing to do for `orders`.
    return result;
  }
  if (!isLocalDbReady()) {
    result.error = "local db unavailable";
    return result;
  }

  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const started = Date.now();
  let cursor = await readCursor(entity.name, locationId);

  try {
    for (let page = 0; page < MAX_PAGES_PER_CYCLE; page++) {
      if (opts.signal?.aborted) break;

      const delta = await entity.pullDelta({
        supabase,
        locationId,
        since: cursor.watermark,
        sinceId: cursor.watermarkId,
        limit: pageSize,
        signal: opts.signal,
      });

      result.pages += 1;
      recordCount(KEY_SYNC_PAGES);

      if (delta.received === 0) {
        // Steady state: nothing changed. Still write sync_state so the
        // freshness stamp reflects a successful check rather than going stale
        // on a quiet service period.
        if (page === 0) {
          recordCount(KEY_SYNC_EMPTY_CYCLE);
          await writeBatch(
            entity,
            station,
            locationId,
            { root: [] },
            undefined,
            { lastSuccessAt: new Date().toISOString(), lastError: null },
          );
        }
        break;
      }

      result.wasEmpty = false;

      // Hold the cursor behind in-flight transactions. See WATERMARK_LAG_MS —
      // without this, a row whose transaction started before the cursor but
      // committed after it is skipped permanently.
      const persistCursor = computeLaggedCursor(delta.watermark, cursor, {
        lagMs: opts.lagMs,
        caughtUp: !delta.hasMore,
      });

      const write = await writeBatch(
        entity,
        station,
        locationId,
        delta.batch,
        persistCursor,
        { lastSuccessAt: new Date().toISOString(), lastError: null },
      );

      if (write.rejected) {
        result.error = "station policy refused the batch";
        break;
      }

      // The invariant this whole design turns on: the cursor lives in the same
      // transaction as the rows. A rollback means the cursor did not move, so
      // the next cycle re-fetches this exact page rather than skipping it.
      if (!write.committed) {
        result.error = "write failed — watermark not advanced";
        await recordSyncFailure(entity, locationId, result.error);
        break;
      }

      result.rowsWritten += write.written + write.childrenWritten;
      recordCount(KEY_SYNC_ROWS, write.written);

      // Advance the in-memory cursor to match what we just committed. Mid-page
      // this is the exact row cursor; on the final page it is the lagged one,
      // so the next cycle re-reads the safety window.
      cursor = {
        watermark: persistCursor.value,
        watermarkId: persistCursor.id,
      };

      if (!delta.hasMore) break;

      if (page === MAX_PAGES_PER_CYCLE - 1) {
        result.hitPageLimit = true;
        console.warn(
          `[SyncEngine] ${entity.name} hit the ${MAX_PAGES_PER_CYCLE}-page cap; ` +
            `resuming next cycle from ${cursor.watermark}`,
        );
      }
    }
  } catch (error) {
    result.error = String(error);
    recordCount(KEY_SYNC_ERROR);
    await recordSyncFailure(entity, locationId, result.error);
  }

  recordSample(KEY_SYNC_CYCLE_MS, Date.now() - started);
  return result;
}

/**
 * Detect HARD deletes by comparing the server's id set against ours.
 *
 * Most "deletions" here are soft (voided_at, is_voided, is_active, availability)
 * and ride the normal delta because they bump updated_at. This covers the
 * genuine `DELETE`, which leaves no trace of any kind — there is no deleted_at
 * anywhere in the remote schema (0 hits across 634 table definitions).
 *
 * Deliberately bounded to rows at or after our retention floor. Deleting
 * anything outside the window we actually verified would remove rows the server
 * still has and we simply did not ask about.
 */
export async function reconcileManifest(
  entity: EntityDescriptor,
  supabase: SupabaseClient,
  locationId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<{ deleted: number; error: string | null }> {
  if (!entity.pullManifest) return { deleted: 0, error: null };

  const db = getDb();
  if (!db) return { deleted: 0, error: "local db unavailable" };

  const floor = await readRetentionFloor(entity.name, locationId);
  if (!floor) return { deleted: 0, error: null }; // nothing held, nothing to verify

  const started = Date.now();
  try {
    const serverIds = await entity.pullManifest({
      supabase,
      locationId,
      since: floor,
      signal: opts.signal,
    });

    // An empty manifest for a window we hold rows in is far more likely to be
    // a failed/filtered query than a genuine mass deletion. Refuse it — the
    // cost of being wrong here is wiping real history.
    if (serverIds.length === 0) {
      return { deleted: 0, error: null };
    }

    const serverSet = new Set(serverIds);
    const localRows = await db.getAllAsync<{ id: string }>(
      `SELECT "${entity.primaryKey}" AS id FROM ${entity.table}
        WHERE location_id = ? AND "${entity.retention.pruneBy}" >= ?`,
      [locationId, floor],
    );

    const orphans = localRows
      .map((r) => r.id)
      .filter((id) => !serverSet.has(id));
    if (orphans.length === 0) {
      await touchManifestTimestamp(entity, locationId);
      return { deleted: 0, error: null };
    }

    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        // Chunked: SQLite caps bound parameters (999 by default), and an orphan
        // list can exceed that after a long offline stretch.
        for (let i = 0; i < orphans.length; i += 500) {
          const chunk = orphans.slice(i, i + 500);
          await db.runAsync(
            `DELETE FROM ${entity.table}
              WHERE "${entity.primaryKey}" IN (${chunk.map(() => "?").join(",")})`,
            chunk,
          );
        }
      });
    });

    await touchManifestTimestamp(entity, locationId);
    recordCount(KEY_SYNC_MANIFEST_DELETED, orphans.length);
    recordSample(KEY_SYNC_MANIFEST_MS, Date.now() - started);
    return { deleted: orphans.length, error: null };
  } catch (error) {
    recordCount(KEY_SYNC_ERROR);
    return { deleted: 0, error: String(error) };
  }
}

async function touchManifestTimestamp(
  entity: EntityDescriptor,
  locationId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.runAsync(
    `INSERT INTO sync_state (entity, location_id, last_manifest_at)
     VALUES (?, ?, ?)
     ON CONFLICT(entity, location_id) DO UPDATE SET
       last_manifest_at = excluded.last_manifest_at`,
    [entity.name, locationId, new Date().toISOString()],
  );
}

/**
 * Force a full re-pull of an entity on the next cycle.
 *
 * Clears the cursor but leaves the rows in place, so the UI keeps rendering
 * what it has while the re-pull runs. Upserts make the overlap harmless.
 */
export async function resetCursor(
  entityName: string,
  locationId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.runAsync(
    `UPDATE sync_state SET watermark = NULL, watermark_id = NULL
      WHERE entity = ? AND location_id = ?`,
    [entityName, locationId],
  );
}
