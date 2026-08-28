/**
 * Local SQLite database — open, pragma, version, teardown.
 *
 * Phase 1 (Track A foundation): this module creates the database and nothing
 * else. No screen reads it, no sync path writes to it. That is deliberate —
 * the purge paths, the station policy and the retention machinery all need to
 * be proven correct BEFORE any data depends on them, because the failure mode
 * of getting them wrong is PII on the wrong device, not a broken screen.
 *
 * Failure posture: every entry point here degrades to null rather than
 * throwing. A device that cannot open SQLite must still run the POS exactly as
 * it does today — the local DB is an accelerator through the whole of Track A,
 * never a dependency. Callers check `isLocalDbReady()`.
 */
import * as SQLite from "expo-sqlite";

import { dbWriteMutex } from "@/lib/db/mutex";
import { DB_PURGE_PENDING_KEY, type PurgeReason } from "@/lib/db/purgeFlag";
import {
  DROP_STATEMENTS,
  PRAGMAS,
  SCHEMA_REBUILD_IS_SAFE,
  SCHEMA_STATEMENTS,
  SCHEMA_VERSION,
} from "@/lib/db/schema";
import { getSyncString, removeSyncKey } from "@/lib/storage";
import {
  KEY_DB_INIT_ERROR,
  KEY_DB_INIT_MS,
  KEY_DB_REBUILD,
} from "@/lib/telemetry/keys";
import { recordCount, recordSample } from "@/lib/telemetry/registry";

export const DB_NAME = "dexa-local.db";

/**
 * Read and clear the pending-purge flag.
 *
 * Cleared BEFORE the delete runs, deliberately: if the delete then fails, the
 * next boot opens the existing file rather than looping forever on a purge that
 * cannot succeed. A failed purge shows up as stale data and a warn; a boot loop
 * is worse.
 */
function consumePurgePending(): PurgeReason | null {
  try {
    const reason = getSyncString(DB_PURGE_PENDING_KEY) as
      PurgeReason | undefined;
    if (!reason) return null;
    removeSyncKey(DB_PURGE_PENDING_KEY);
    return reason;
  } catch {
    return null;
  }
}

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
let lastInitError: string | null = null;

/** The opened handle, or null if the DB is unavailable. Never throws. */
export function getDb(): SQLite.SQLiteDatabase | null {
  return db;
}

export function isLocalDbReady(): boolean {
  return db !== null;
}

export function getLocalDbError(): string | null {
  return lastInitError;
}

/**
 * Open (or create) the local database. Idempotent and concurrency-safe: the
 * in-flight promise is shared, so twenty callers at boot produce one open.
 */
export function initLocalDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (db) return Promise.resolve(db);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const started = Date.now();
    try {
      // Honour a purge owed from a previous run BEFORE opening. This is the
      // env-switch path: reconcileEnvironmentOnBoot() is synchronous and cannot
      // await a file delete, so it records the intent and we act on it here,
      // where nothing can have reopened or repopulated the file yet.
      const owed = consumePurgePending();
      if (owed) {
        console.warn(`[LocalDB] purge owed (${owed}) — deleting before open`);
        await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
      }

      const handle = await SQLite.openDatabaseAsync(DB_NAME);

      // PRAGMAs must run before any schema work. journal_mode returns a row,
      // which execAsync tolerates and runAsync does not.
      for (const pragma of PRAGMAS) {
        await handle.execAsync(pragma);
      }

      // Diagnostic: confirm busy_timeout actually took effect — "database is
      // locked" failures that persist despite the pragma mean a stale bundle
      // or a lock held longer than the timeout, and this tells them apart.
      try {
        const bt = await handle.getFirstAsync<{ busy_timeout: number }>(
          "PRAGMA busy_timeout",
        );
        console.log(
          `[LocalDB] open ok — busy_timeout=${bt?.busy_timeout ?? "?"}ms schema=v${SCHEMA_VERSION}`,
        );
      } catch {
        // non-fatal
      }

      await applySchema(handle);

      db = handle;
      lastInitError = null;
      recordSample(KEY_DB_INIT_MS, Date.now() - started);
      return handle;
    } catch (error) {
      // Swallow deliberately. Through Track A the app is fully functional
      // without this database; a failed open must not degrade the POS.
      lastInitError = String(error);
      recordCount(KEY_DB_INIT_ERROR);
      console.warn("[LocalDB] init failed — continuing without it:", error);
      db = null;
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Bring the file to SCHEMA_VERSION.
 *
 * Track A policy: the local DB is a pure projection of server state, so a
 * version mismatch is resolved by DROP + rebuild + resync. There is no
 * migration ladder to write and no way for a schema change to corrupt data,
 * because every row is refetchable.
 *
 * That stops being true at the Track A -> Track B boundary (Phase 6), where
 * the DB starts holding rows the server has never seen. SCHEMA_REBUILD_IS_SAFE
 * is the switch: when it flips false, this function must refuse to drop and a
 * forward-only migration ladder takes over. The `throw` below is what makes
 * forgetting that a loud failure at boot rather than silent data loss in the
 * field.
 */
async function applySchema(handle: SQLite.SQLiteDatabase): Promise<void> {
  const row = await handle.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const current = row?.user_version ?? 0;

  if (current === SCHEMA_VERSION) {
    // Still run CREATE IF NOT EXISTS: cheap, and it self-heals a file whose
    // creation was interrupted midway on a previous boot.
    await execAll(handle, SCHEMA_STATEMENTS);
    return;
  }

  if (current !== 0) {
    if (!SCHEMA_REBUILD_IS_SAFE) {
      throw new Error(
        `[LocalDB] schema v${current} -> v${SCHEMA_VERSION} needs a migration. ` +
          `Drop-and-rebuild is disabled because the local DB now holds ` +
          `unsynced rows. Write the migration.`,
      );
    }
    console.warn(
      `[LocalDB] schema v${current} -> v${SCHEMA_VERSION}: dropping and rebuilding`,
    );
    recordCount(KEY_DB_REBUILD);
    await execAll(handle, DROP_STATEMENTS);
  }

  await execAll(handle, SCHEMA_STATEMENTS);
  await handle.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function execAll(
  handle: SQLite.SQLiteDatabase,
  statements: readonly string[],
): Promise<void> {
  for (const sql of statements) {
    await handle.execAsync(sql);
  }
}

/**
 * Size of the database file on disk, in bytes.
 *
 * `page_count * page_size` rather than a filesystem stat: it is two cheap
 * pragma reads and it is the number SQLite itself considers authoritative.
 * Reported alongside getStorageSizeStats() in the existing storage monitor so
 * local-DB growth is visible before it is a problem.
 */
export async function getDbSizeBytes(): Promise<number | null> {
  if (!db) return null;
  const handle = db;
  try {
    return await dbWriteMutex.runExclusive(async () => {
      const pageCount = await handle.getFirstAsync<{ page_count: number }>(
        "PRAGMA page_count",
      );
      const pageSize = await handle.getFirstAsync<{ page_size: number }>(
        "PRAGMA page_size",
      );
      if (!pageCount || !pageSize) return null;
      return pageCount.page_count * pageSize.page_size;
    });
  } catch {
    return null;
  }
}

/** Row counts per table — diagnostics and the Phase 1 measurement harness. */
export async function getTableRowCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!db) return out;
  const handle = db;
  const { TABLES } = await import("@/lib/db/schema");
  await dbWriteMutex.runExclusive(async () => {
    for (const table of TABLES) {
      try {
        const row = await handle.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table}`,
        );
        out[table] = row?.n ?? 0;
      } catch {
        out[table] = -1;
      }
    }
  });
  return out;
}

/**
 * Close and delete the database file entirely.
 *
 * Used by the PII purge paths (lib/db/teardown.ts). Deleting the file rather
 * than truncating tables is the right call for a purge: it reclaims the pages
 * (SQLite does not shrink on DELETE), and it cannot leave a table behind that
 * someone forgot to add to a list.
 */
export async function destroyLocalDb(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (error) {
    console.warn("[LocalDB] destroy failed:", error);
    db = null;
  }
}

/** Test seam: drop the module-level handle without touching the file. */
export function __resetLocalDbForTests(): void {
  db = null;
  initPromise = null;
  lastInitError = null;
}
