/**
 * Purge paths for the local database.
 *
 * This is the highest-risk module in Phase 1. The local DB carries names,
 * phone numbers and emails, and there are exactly three moments where it must
 * be destroyed:
 *
 *   1. clearCacheData()            — the operator asked for a cache reset
 *   2. reconcileEnvironmentOnBoot() — a staging <-> prod switch. Miss this and
 *                                     PRODUCTION customer data is left sitting
 *                                     on a staging device.
 *   3. Station change               — POS re-provisioned as kiosk/KDS. Miss
 *                                     this and PII lands on a dining-room
 *                                     tablet.
 *
 * ---------------------------------------------------------------------------
 * Why (2) uses a pending flag instead of just calling destroy
 * ---------------------------------------------------------------------------
 * reconcileEnvironmentOnBoot() runs SYNCHRONOUSLY at module load in
 * lib/storage.ts, before any store hydrates. Deleting a SQLite file is async.
 * Fire-and-forget from there would race the first sync write: the DB could be
 * reopened and repopulated before the delete lands, and the delete would then
 * take out the NEW environment's data instead of the old.
 *
 * So the env switch records an intent synchronously, and initLocalDb() honours
 * it before it opens anything. The purge then cannot race, and it survives a
 * crash between the two — the flag is still set on the next boot.
 */
import { destroyLocalDb, getDb, initLocalDb } from "@/lib/db/index";
import { forbiddenTables, type StationKind } from "@/lib/db/policy";
import type { PurgeReason } from "@/lib/db/purgeFlag";
import { dbWriteMutex } from "@/lib/db/write";
import {
  KEY_DB_PURGE_CACHE,
  KEY_DB_PURGE_ENV,
  KEY_DB_PURGE_STATION,
} from "@/lib/telemetry/keys";
import { recordCount } from "@/lib/telemetry/registry";

export { DB_PURGE_PENDING_KEY, type PurgeReason } from "@/lib/db/purgeFlag";

/**
 * Destroy the database now and reopen it empty.
 *
 * For the paths that CAN await — cache clear and station change. The env
 * switch uses the pending flag above instead.
 */
export async function purgeLocalDbNow(reason: PurgeReason): Promise<void> {
  countPurge(reason);
  await destroyLocalDb();
  // Reopen so the app is not left in a half-state: a purge means "empty", not
  // "unavailable". initLocalDb() recreates the schema.
  await initLocalDb();
}

/**
 * Drop only the tables this station kind may not hold.
 *
 * Used when a device is re-provisioned (POS -> kiosk). Deliberately NOT a full
 * purge: a kiosk still legitimately holds the menu, and re-syncing it over a
 * dining-room WiFi connection for no reason is a worse experience than the
 * targeted delete.
 */
export async function purgeForbiddenTables(
  station: StationKind,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const tables = forbiddenTables(station);
  if (tables.length === 0) return 0;

  recordCount(KEY_DB_PURGE_STATION);
  let dropped = 0;
  try {
    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        for (const table of tables) {
          // DELETE, not DROP: the schema stays intact so a device re-provisioned
          // back to POS does not need a rebuild, and so the CREATE IF NOT EXISTS
          // on next boot has nothing to repair.
          await db.runAsync(`DELETE FROM ${table}`);
          dropped += 1;
        }
        // sync_state rows for now-forbidden entities must go too, or the delta
        // engine would resume from a stale watermark if the station flips back.
        await db.runAsync(
          `DELETE FROM sync_state WHERE entity NOT IN ('menu')`,
        );
      });
    });
  } catch (error) {
    console.warn("[LocalDB] station purge failed:", error);
  }
  return dropped;
}

function countPurge(reason: PurgeReason): void {
  if (reason === "env_switch") recordCount(KEY_DB_PURGE_ENV);
  else if (reason === "cache_clear") recordCount(KEY_DB_PURGE_CACHE);
  else recordCount(KEY_DB_PURGE_STATION);
}
