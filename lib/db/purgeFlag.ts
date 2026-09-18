/**
 * The "destroy this database before you next open it" flag — constants only.
 *
 * This module imports NOTHING. That is load-bearing: lib/storage.ts writes the
 * flag from inside reconcileEnvironmentOnBoot(), which runs at module load
 * before any store hydrates. Anything this module imported would be pulled into
 * that boot path, and importing lib/storage.ts back would be an outright cycle.
 *
 * So the shape is: storage.ts writes the key with its own MMKV handle,
 * lib/db/index.ts reads and clears it during init. Both import only the
 * constant from here.
 *
 * Why a flag rather than a direct delete — see the header of lib/db/teardown.ts.
 * Short version: reconcileEnvironmentOnBoot() is synchronous, deleting a SQLite
 * file is async, and a fire-and-forget delete can race the first write of the
 * NEW environment's data and take that out instead.
 */

/** Key in `syncStorage`. Written after clearAll(), same as ENV_SIGNATURE_KEY. */
export const DB_PURGE_PENDING_KEY = "local_db_purge_pending";

export type PurgeReason = "env_switch" | "cache_clear" | "station_change";
