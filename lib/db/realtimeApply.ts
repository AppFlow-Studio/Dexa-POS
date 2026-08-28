/**
 * Realtime broadcasts -> the local database, through the SAME write boundary
 * the delta pull uses.
 *
 * Realtime and the delta pull are two halves of one system, not two systems:
 *
 *   - Realtime is the LATENCY path. A change on another station shows up in
 *     under a second.
 *   - The delta pull is the CORRECTNESS path. It repairs anything a dropped
 *     channel missed, and it is what makes a reconnect cheap instead of a full
 *     refetch.
 *
 * Sharing one write helper — and one row mapping (mapOrdersToBatch) — is what
 * keeps them from disagreeing. Two mappings would mean a broadcast-applied row
 * and a pull-applied row could differ for the same order, which is invisible
 * until someone compares two stations at close-out.
 *
 * The critical difference from a pull: a broadcast carries NO cursor, so this
 * never advances the watermark. Applying a broadcast for an order newer than
 * our cursor and then moving the cursor to it would skip every order in
 * between — a permanent hole. The pull owns the cursor; realtime only ever
 * updates rows.
 */
import { mapOrdersToBatch } from "@/lib/db/descriptors/orders";
import { getEntity } from "@/lib/db/entities";
import { getDb, isLocalDbReady } from "@/lib/db/index";
import type { StationKind } from "@/lib/db/policy";
import { writeBatch } from "@/lib/db/write";

export interface RealtimeApplyResult {
  applied: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Apply one or more orders received over realtime.
 *
 * Silent no-op when the DB is unavailable or the station may not hold orders —
 * a broadcast handler runs on the hot path and must never throw into it.
 */
export async function applyOrdersFromRealtime(
  orders: Array<Record<string, unknown>>,
  station: StationKind,
  locationId: string,
): Promise<RealtimeApplyResult> {
  if (!isLocalDbReady()) return { applied: 0, skipped: true, reason: "db" };
  if (orders.length === 0) return { applied: 0, skipped: true, reason: "empty" };

  const entity = getEntity("orders");
  if (!entity) return { applied: 0, skipped: true, reason: "no descriptor" };
  if (!entity.stations.has(station)) {
    return { applied: 0, skipped: true, reason: "station" };
  }

  // A broadcast payload can be partial. Anything without an id or a timestamp
  // cannot be keyed or ordered, so it is dropped rather than guessed at — the
  // delta pull will bring it in properly on the next cycle.
  const usable = orders.filter(
    (o) => typeof o.id === "string" && typeof o.updated_at === "string",
  );
  if (usable.length === 0) {
    return { applied: 0, skipped: true, reason: "unusable payload" };
  }

  const batch = mapOrdersToBatch(
    usable as any,
    new Date().toISOString(),
  );

  // NOTE the absent watermark argument. See the module header.
  const result = await writeBatch(entity, station, locationId, batch);

  return { applied: result.written, skipped: !result.committed };
}

/**
 * Remove an order the server says is gone.
 *
 * Realtime DELETE events are the only place a hard delete arrives promptly;
 * everything else waits for the manifest reconcile. Children go with it via
 * ON DELETE CASCADE.
 */
export async function deleteOrderFromRealtime(
  orderId: string,
  station: StationKind,
): Promise<boolean> {
  if (!isLocalDbReady()) return false;
  const entity = getEntity("orders");
  if (!entity || !entity.stations.has(station)) return false;

  const db = getDb();
  if (!db) return false;

  try {
    await db.runAsync("DELETE FROM orders WHERE id = ?", [orderId]);
    return true;
  } catch (error) {
    console.warn("[LocalDB] realtime delete failed:", error);
    return false;
  }
}
