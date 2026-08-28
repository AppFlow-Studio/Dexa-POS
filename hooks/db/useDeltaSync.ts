/**
 * Track A, Phase 2 — the delta sync loop.
 *
 * Gated behind `EXPO_PUBLIC_DELTA_SYNC` (default off, rollback = unset it).
 * Runs a keyset delta pull for every entity the current station kind may hold
 * that has a pullDelta implementation, plus a manifest reconcile on a daily
 * cadence for hard-delete detection.
 *
 * Deliberately detached and non-fatal: a background sync must never take down
 * a screen. `syncEntity` / `reconcileManifest` record failures to sync_state
 * and telemetry and return — they never throw — so each cycle here is
 * fire-and-forget.
 *
 * Everything this writes is a no-op for the UI until Phase 3 reads the DB, but
 * the loop has to run NOW so the mirror is populated and the Phase 2
 * shadow-compare service period can start.
 */
import { useEffect } from "react";

import { registerOrdersDescriptor } from "@/lib/db/descriptors/orders";
import { syncableEntities } from "@/lib/db/entities";
import { getDb, isLocalDbReady } from "@/lib/db/index";
import type { StationKind } from "@/lib/db/policy";
import { reconcileManifest, syncEntity } from "@/lib/db/syncEngine";

const DELTA_SYNC_ENABLED = process.env.EXPO_PUBLIC_DELTA_SYNC === "1";

/** Steady state is one near-empty round trip per tick. */
const SYNC_INTERVAL_MS = 30_000;
/** The manifest is the rare-case safety net — once a day is plenty. */
const MANIFEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How long to wait for initLocalDb() at mount before giving up this cycle. */
const DB_READY_WAIT_MS = 5_000;
const DB_READY_POLL_MS = 250;

async function waitForDbReady(signal: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + DB_READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (isLocalDbReady()) return true;
    if (signal.aborted) return false;
    await new Promise((resolve) => setTimeout(resolve, DB_READY_POLL_MS));
  }
  return isLocalDbReady();
}

/** True when the manifest reconcile is due: never run, or older than a day. */
async function manifestDue(
  entityName: string,
  locationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const row = await db.getFirstAsync<{ last_manifest_at: string | null }>(
      `SELECT last_manifest_at FROM sync_state
        WHERE entity = ? AND location_id = ?`,
      [entityName, locationId],
    );
    if (!row?.last_manifest_at) return true; // never run before
    return (
      Date.now() - new Date(row.last_manifest_at).getTime() >=
      MANIFEST_INTERVAL_MS
    );
  } catch {
    return false;
  }
}

export function useDeltaSync(opts: {
  supabase: import("@supabase/supabase-js").SupabaseClient | null;
  locationId: string | null;
  station: StationKind;
}): void {
  const { supabase, locationId, station } = opts;

  // Idempotent: registerEntityQueries just re-attaches the same implementation.
  useEffect(() => {
    registerOrdersDescriptor();
  }, []);

  useEffect(() => {
    if (!DELTA_SYNC_ENABLED) {
      if (__DEV__)
        console.log(
          "[LocalDB][delta] flag off — EXPO_PUBLIC_DELTA_SYNC is not '1'",
        );
      return;
    }
    if (!supabase || !locationId) {
      if (__DEV__)
        console.log("[LocalDB][delta] waiting for location", {
          hasSupabase: !!supabase,
          locationId,
        });
      return;
    }

    const entities = syncableEntities(station);
    if (entities.length === 0) {
      if (__DEV__)
        console.log(
          "[LocalDB][delta] no syncable entities for station:",
          station,
        );
      return;
    }
    if (__DEV__)
      console.log("[LocalDB][delta] sync loop starting", {
        station,
        locationId,
        entities: entities.map((e) => e.name),
      });

    const controller = new AbortController();
    const { signal } = controller;

    const runCycle = async (): Promise<void> => {
      if (!(await waitForDbReady(signal))) return;
      for (const entity of entities) {
        await syncEntity(entity, station, supabase, locationId, { signal });
      }
      // Shadow-compare (Phase 2 "Done when"): dev-only log of mirror row
      // counts + window edges, compared against the server. Count alone can't
      // prove a roll — the edges show the window actually advanced. Never fatal.
      if (__DEV__) {
        const db = getDb();
        if (!db) return;
        for (const entity of entities) {
          try {
            const row = await db.getFirstAsync<{ n: number }>(
              `SELECT COUNT(*) AS n FROM ${entity.table} WHERE location_id = ?`,
              [locationId],
            );
            const edges = await db.getFirstAsync<{
              oldestRetained: string | null;
              newestSeen: string | null;
            }>(
              `SELECT MIN(created_at) AS oldestRetained, MAX(updated_at) AS newestSeen
                 FROM ${entity.table} WHERE location_id = ?`,
              [locationId],
            );
            console.log(
              `[LocalDB][shadow] ${entity.name} mirror=${row?.n ?? "?"}` +
                ` oldest=${edges?.oldestRetained ?? "?"}` +
                ` newest=${edges?.newestSeen ?? "?"}`,
            );
          } catch {
            // the log must never take down the cycle
          }
        }
      }
    };

    const runReconcile = async (): Promise<void> => {
      if (!(await waitForDbReady(signal))) return;
      for (const entity of entities) {
        if (await manifestDue(entity.name, locationId)) {
          await reconcileManifest(entity, supabase, locationId, { signal });
        }
      }
    };

    // First pull immediately so the mirror populates, then on the tick.
    void runCycle();
    void runReconcile();

    const syncTimer = setInterval(() => {
      void runCycle();
    }, SYNC_INTERVAL_MS);
    const manifestTimer = setInterval(() => {
      void runReconcile();
    }, MANIFEST_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(syncTimer);
      clearInterval(manifestTimer);
    };
  }, [supabase, locationId, station]);
}
