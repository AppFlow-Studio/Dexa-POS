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
import { dbWriteMutex } from "@/lib/db/mutex";
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
  if (orders.length === 0)
    return { applied: 0, skipped: true, reason: "empty" };

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

  const batch = mapOrdersToBatch(usable as any, new Date().toISOString());

  // NOTE the absent watermark argument. See the module header.
  const result = await writeBatch(entity, station, locationId, batch);

  return { applied: result.written, skipped: !result.committed };
}

/**
 * Realtime → mirror, NEW rows only.
 *
 * The LATENCY half of the mirror update: a broadcast for an order the mirror
 * doesn't hold yet is written immediately, so the next local read (e.g.
 * Previous Orders) sees it without waiting for the 30s delta.
 *
 * Deliberately does NOT overwrite rows the mirror already holds: a broadcast
 * payload is trimmed (v3 drops many header fields and the history embeds —
 * order_discounts, created_by_staff, stations, online_orders), so upserting it
 * over a complete delta-fetched row would DEGRADE that payload (e.g. the
 * server-name column going back to "Unknown"). The delta is the correctness
 * path: it re-fetches the new row with the full embed within a cycle, and the
 * upsert enriches it.
 *
 * v11 gives that rule a second, sharper instance: `_online_placed_at` is
 * resolved from the `online_orders` embed, which a broadcast does not carry.
 * So a brand-new online order lands here with a NULL placement and is NOT on
 * the local Online Orders board until the delta enriches it — ≤30 s, or ~1.2 s
 * through the realtime nudge (lib/db/deltaNudge.ts), and immediately when
 * online because the board's server pass is authoritative. Overwriting an
 * EXISTING row from here would be the harmful direction: it would take a
 * placed order back off the board. That is why this function inserts only
 * rows the mirror does not already hold.
 */
export async function applyOrdersFromRealtimeIfNew(
  orders: Array<Record<string, unknown>>,
  station: StationKind,
  locationId: string,
): Promise<void> {
  if (!isLocalDbReady()) return;
  const usable = orders.filter(
    (o) => typeof o.id === "string" && typeof o.updated_at === "string",
  );
  if (usable.length === 0) return;

  const db = getDb();
  if (!db) return;

  // Only rows the mirror doesn't already hold. Checked under the shared mutex
  // so this never races a delta write; writeBatch takes it again inside, but
  // the runExclusive above has released it by then.
  const missing: Array<Record<string, unknown>> = [];
  await dbWriteMutex.runExclusive(async () => {
    for (const o of usable) {
      const row = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM orders WHERE id = ?",
        [o.id as string],
      );
      if (!row) missing.push(o);
    }
  });
  if (missing.length === 0) return;

  await applyOrdersFromRealtime(missing, station, locationId);
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
    // Through the shared mutex — a DELETE stepping on the connection during a
    // mirror write transaction throws "database is locked".
    await dbWriteMutex.runExclusive(() =>
      db.runAsync("DELETE FROM orders WHERE id = ?", [orderId]),
    );
    return true;
  } catch (error) {
    console.warn("[LocalDB] realtime delete failed:", error);
    return false;
  }
}
