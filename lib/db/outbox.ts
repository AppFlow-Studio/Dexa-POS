/**
 * THE TRANSACTIONAL OUTBOX.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §7.1
 *
 * ── The problem this exists to remove ──────────────────────────────────────
 *
 * Today a mutation does two independent things:
 *   1. Zustand `set()`, persisted to MMKV on a 300ms debounce.
 *   2. A queue append to a DIFFERENT MMKV key (services/offlineSyncService).
 *
 * A crash, force-quit or OOM kill between them leaves the order without its
 * sync operation, or the operation without its order. No transaction can span
 * two storage systems, so this is not a bug to be fixed in place — it is a
 * property of the shape.
 *
 * Writing the row and its sync intent in ONE SQLite transaction makes "local
 * row created, server row didn't" **unrepresentable** rather than unlikely.
 * That is the single most important sentence in this file.
 *
 * ── Why this is not in write.ts ────────────────────────────────────────────
 *
 * `writeBatch()` is the boundary for rows arriving FROM the server (delta sync,
 * realtime). It owns station policy, retention and the sync watermark. This is
 * the boundary for rows originating ON the device. They share the connection
 * and the mutex but have opposite directions and opposite invariants — a
 * server row is never enqueued, and a local row is never pruned by retention
 * (see `RETENTION EXEMPTION` below).
 */
import { getDb, getReadDb, isLocalDbReady } from "@/lib/db/index";
import { dbWriteMutex } from "@/lib/db/mutex";
import type { SqlValue } from "@/lib/db/write";
import { getDeviceId } from "@/lib/deviceId";
import { storage } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutboxEntity =
  | "order"
  | "order_item"
  | "table_session"
  | "order_seat";

/**
 * The operations that can originate on a device.
 *
 * Deliberately a SMALL list, and deliberately not the ~40 in
 * `offlineSyncService.OperationType`. Only order/item/seating writes move here;
 * timeclock, cash drawer, loyalty, preauth and discounts keep using the
 * existing queue until they get their own plan. A partial migration with a
 * clear boundary beats a big-bang one that owns everything badly.
 */
export type OutboxOp =
  | "create_order"
  | "add_item"
  | "update_item_quantity"
  | "void_item"
  | "remove_item"
  | "set_item_seat"
  | "seat_guests"
  | "update_session_status";

export interface OutboxEntry {
  /** v4 uuid. Doubles as the RPC idempotency key — one id, one meaning. */
  id: string;
  op: OutboxOp;
  entity: OutboxEntity;
  entityId: string;
  /** Ops on the same order drain in FIFO; ops on different orders run parallel. */
  orderId?: string | null;
  payload: unknown;
  /** `sync_version` this write was based on, for conflict detection. */
  baseVersion?: number | null;
}

/** A row write that must land atomically with its outbox entries. */
export interface LocalStatement {
  sql: string;
  args: SqlValue[];
}

// ---------------------------------------------------------------------------
// Lamport clock
// ---------------------------------------------------------------------------

/**
 * Tables carrying a `sync_version` column. `order_items` deliberately does
 * not have one — its version rides its parent order. Declared rather than
 * probed, for the same reason as TABLES_WITH_SYNC_STATUS in schema.ts.
 */
const TABLES_WITH_SYNC_VERSION: ReadonlySet<string> = new Set([
  "orders",
  "table_sessions",
]);

const LAMPORT_KEY = "db.lamport";

/**
 * A device-wide Lamport counter.
 *
 * The plan says "a Lamport counter per (device, entity)". Device-wide is
 * strictly stronger and much simpler: it still gives a total order that
 * respects causality, and per-entity counters buy nothing here because merges
 * only ever compare two versions of the SAME entity — where a device-wide
 * clock orders them identically.
 *
 * WHY NOT WALL CLOCK: tablet clocks drift, and a device 10 minutes fast would
 * otherwise win every last-writer-wins merge forever. Wall-clock time is for
 * humans; causality is for merges. `updated_at` is still stored — for display.
 *
 * Raw MMKV, not the debounced Zustand adapter: this must be an atomic
 * read-increment-write, and a debounce could hand two writes the same value.
 */
let cachedLamport: number | null = null;

function readPersisted(): number {
  try {
    return storage.getNumber(LAMPORT_KEY) ?? 0;
  } catch {
    return 0;
  }
}

export function nextLamport(): number {
  // In-memory counter is AUTHORITATIVE once seeded; MMKV is write-through
  // durability, not the source of truth.
  //
  // Reading from MMKV on every call looks simpler and is wrong: if a read ever
  // fails or returns stale (a cleared bucket, a storage error, a test
  // environment with a partial mock) the counter silently RESTARTS. Two writes
  // then share a Lamport value, the (lamport, device_id) tie-break stops being
  // a total order, and two devices settle a merge differently — a divergence
  // with no error anywhere. Caught by the monotonicity test, which returned
  // 1 twice against a mocked MMKV.
  if (cachedLamport === null) cachedLamport = readPersisted();
  cachedLamport += 1;
  try {
    storage.set(LAMPORT_KEY, cachedLamport);
  } catch {
    // Durability lost, monotonicity kept. On restart the clock reseeds from
    // whatever did persist, and observeRemoteLamport() pulls it forward past
    // anything a peer has seen — so a lost write costs ordering precision,
    // never correctness.
  }
  return cachedLamport;
}

/** Test seam — the module counter outlives a rebuilt DB otherwise. */
export function __resetLamportForTests(): void {
  cachedLamport = null;
}

/**
 * Advance the clock past something we observed from elsewhere.
 *
 * This is the half of a Lamport clock that people forget, and without it the
 * counter is just a local sequence: if a peer is at 900 and we are at 12, our
 * next write must be > 900 or it will lose every merge against that peer
 * despite happening later. Call this whenever a remote `_lamport` is ingested.
 */
export function observeRemoteLamport(remote: number | null | undefined): void {
  if (typeof remote !== "number" || !Number.isFinite(remote)) return;
  if (cachedLamport === null) cachedLamport = readPersisted();
  if (remote > cachedLamport) {
    cachedLamport = remote;
    try {
      storage.set(LAMPORT_KEY, remote);
    } catch {
      // See nextLamport().
    }
  }
}

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

export interface CommitResult {
  ok: boolean;
  error?: string;
}

/**
 * Write rows AND their sync intent in one transaction. The only way a local
 * mutation may reach disk.
 *
 * Returns `{ ok: false }` rather than throwing, for the same reason the rest of
 * lib/db does: a device that cannot open SQLite must still run the POS. The
 * CALLER decides whether a failed local write is fatal to the interaction —
 * and for an order write it is, so callers must check.
 */
export async function commitLocalWrite(
  statements: LocalStatement[],
  ops: OutboxEntry[],
): Promise<CommitResult> {
  if (!isLocalDbReady() || !getDb()) {
    // The single most likely cause of "nothing syncs": the local database
    // never opened, so every local write no-ops and no op is ever queued.
    console.error(
      "[LF] ✗ local DB NOT READY — local-first writes cannot work. " +
        "Check initLocalDb() ran (PosSyncProvider) and that its flag is on.",
    );
    return { ok: false, error: "local db unavailable" };
  }
  const db = getDb()!;

  const deviceId = getDeviceId();
  const now = new Date().toISOString();

  try {
    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        for (const s of statements) {
          await db.runAsync(s.sql, s.args);
        }
        for (const op of ops) {
          await db.runAsync(
            `INSERT INTO outbox
               (id, op, entity, entity_id, order_id, payload, base_version,
                lamport, device_id, attempts, next_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending', ?)`,
            [
              op.id,
              op.op,
              op.entity,
              op.entityId,
              op.orderId ?? null,
              JSON.stringify(op.payload),
              op.baseVersion ?? null,
              nextLamport(),
              deviceId,
              now,
            ],
          );
        }
      });
    });
    if (ops.length > 0) {
      console.log(
        `[LF] committed ${statements.length} row(s) + ${ops.length} op(s):`,
        ops.map((o) => `${o.op}:${o.entityId.slice(0, 8)}`).join(" "),
      );
    }
    // Ask the drain to run soon. Deliberately AFTER the commit and NOT
    // awaited: the write is already durable, and making the caller wait on a
    // network push would put the round trip back on the hot path.
    try {
      // Required lazily — services/ imports lib/, so a static import here
      // would be a cycle.
      const {
        nudgeDrain,
      } = require("@/services/localFirst/outboxDrain") as typeof import("@/services/localFirst/outboxDrain");
      nudgeDrain();
    } catch {
      // The drain is an optimisation on top of a durable write. If it cannot
      // even be reached, the interval still picks the ops up.
    }
    return { ok: true };
  } catch (error) {
    // A rolled-back transaction leaves NOTHING behind — not the row, not the
    // op. That is the guarantee; the caller can retry the whole gesture.
    console.error(
      "[LF] ✗ LOCAL WRITE FAILED — nothing was written (row AND op rolled back):",
      error,
    );
    return { ok: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// The drain
// ---------------------------------------------------------------------------

export interface ClaimedOp extends OutboxEntry {
  attempts: number;
  lamport: number;
  deviceId: string | null;
  createdAt: string;
}

interface OutboxRow {
  id: string;
  op: string;
  entity: string;
  entity_id: string;
  order_id: string | null;
  payload: string;
  base_version: number | null;
  lamport: number;
  device_id: string | null;
  attempts: number;
  created_at: string;
}

/**
 * Eligible ops, oldest first.
 *
 * `status = 'pending'`, NOT `status != 'inflight'`. The looser predicate also
 * matched 'failed', so every permanently-rejected op was re-claimed and
 * re-pushed on EVERY drain — one tap replaying twenty dead ops, filling the
 * log and hammering the server with calls that can never succeed. A rejection
 * is parked for a human by definition; re-attempting it is exactly what
 * markRejected exists to stop.
 *
 * Reads on the READ connection so a drain scan never queues behind whatever
 * batch the delta sync is writing — under WAL a reader on a separate
 * connection never blocks on a writer and never sees a half-applied
 * transaction.
 */
export async function claimBatch(limit = 50): Promise<ClaimedOp[]> {
  const db = getReadDb();
  if (!db) return [];
  try {
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT id, op, entity, entity_id, order_id, payload, base_version,
              lamport, device_id, attempts, created_at
         FROM outbox
        WHERE status = 'pending'
          AND (next_at IS NULL OR next_at <= ?)
        ORDER BY created_at ASC, rowid ASC
        LIMIT ?`,
      [new Date().toISOString(), limit],
    );
    return rows.map((r) => ({
      id: r.id,
      op: r.op as OutboxOp,
      entity: r.entity as OutboxEntity,
      entityId: r.entity_id,
      orderId: r.order_id,
      payload: safeParse(r.payload),
      baseVersion: r.base_version,
      attempts: r.attempts,
      lamport: r.lamport,
      deviceId: r.device_id,
      createdAt: r.created_at,
    }));
  } catch (error) {
    console.warn("[Outbox] claim failed:", error);
    return [];
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Op succeeded: delete it, and mark its row synced in the same transaction.
 *
 * DELETE rather than a status flag, deliberately: a fully drained outbox should
 * be an EMPTY table, which makes `SELECT COUNT(*)` a health metric on its own
 * and stops the table growing without bound on a busy station.
 *
 * The row's `_sync_status` update rides the same transaction so the two can
 * never disagree — a deleted op with a still-'pending' row would be a write
 * that never syncs and never retries.
 */
export async function markSynced(
  opId: string,
  row?: { table: string; id: string; syncVersion?: number | null },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`DELETE FROM outbox WHERE id = ?`, [opId]);
        if (row) {
          // `sync_version` exists on orders and table_sessions but NOT on
          // order_items. Writing it unconditionally raised "no such column",
          // which this function's try/catch swallowed — rolling back the
          // DELETE too, so the op was never removed and every item re-pushed
          // forever. Silent, and only visible as an outbox that never drains.
          const writeVersion =
            row.syncVersion != null && TABLES_WITH_SYNC_VERSION.has(row.table);

          // Only clear the row's pending state if it has no OTHER ops queued —
          // an item that was added and then re-quantitied has two ops, and
          // marking it 'synced' after the first would hide the second from
          // every "is this order fully synced?" check.
          await db.runAsync(
            `UPDATE ${row.table}
                SET _sync_status = CASE
                      WHEN (SELECT COUNT(*) FROM outbox WHERE entity_id = ?) = 0
                      THEN 'synced' ELSE _sync_status END
                  ${writeVersion ? ", sync_version = ?" : ""}
              WHERE id = ?`,
            writeVersion
              ? [row.id, row.syncVersion as number, row.id]
              : [row.id, row.id],
          );
        }
      });
    });
  } catch (error) {
    console.warn("[Outbox] markSynced failed:", error);
  }
}

/**
 * Exponential backoff with a 5-minute ceiling, so a dead server is retried
 * gently rather than hammered.
 *
 * The exponent clamp (20) exists only to stop `2 ** attempts` overflowing into
 * Infinity on a long-lived failed op; the CEILING is the outer Math.min. An
 * earlier version clamped the exponent at 8, which capped the delay at 256s and
 * meant the documented "5 minutes" was never reachable — the inner clamp bound
 * the result before the outer one could.
 */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function backoffMs(attempts: number): number {
  const exponent = Math.min(Math.max(attempts, 0), 20);
  return Math.min(2 ** exponent * 1000, MAX_BACKOFF_MS);
}

/**
 * Op failed transiently: schedule a retry. NEVER drops the op.
 *
 * The one thing this must not do is give up. A dropped write is silent data
 * loss, which is strictly worse than an op that retries for an hour and is
 * visible in the pending count.
 */
export async function markRetry(
  opId: string,
  attempts: number,
  error: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const nextAt = new Date(Date.now() + backoffMs(attempts + 1)).toISOString();
  try {
    await dbWriteMutex.runExclusive(async () => {
      await db.runAsync(
        `UPDATE outbox
            SET attempts = attempts + 1, next_at = ?, last_error = ?,
                status = 'pending'
          WHERE id = ?`,
        [nextAt, error.slice(0, 500), opId],
      );
    });
  } catch (e) {
    console.warn("[Outbox] markRetry failed:", e);
  }
}

/**
 * Op was REJECTED by the server (validation, auth, order locked for payment).
 *
 * Distinct from a retry: retrying will never help, so the op is parked as
 * 'failed' and the row flagged 'conflict' for the UI to surface. It is NOT
 * deleted — an operator needs to see what did not apply. A silently dropped
 * rejection is exactly the failure this project exists to remove.
 */
export async function markRejected(
  opId: string,
  reason: string,
  row?: { table: string; id: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await dbWriteMutex.runExclusive(async () => {
      await db.withTransactionAsync(async () => {
        // attempts is incremented here too, not just on retry. It is what
        // bounds requeueFailedOps(): an op whose stored PAYLOAD is malformed
        // (written by code that has since been fixed) fails identically on
        // every launch, and without a ceiling it would be retried forever.
        await db.runAsync(
          `UPDATE outbox
              SET status = 'failed', last_error = ?, attempts = attempts + 1
            WHERE id = ?`,
          [reason.slice(0, 500), opId],
        );
        if (row) {
          await db.runAsync(
            `UPDATE ${row.table} SET _sync_status = 'conflict' WHERE id = ?`,
            [row.id],
          );
        }
      });
    });
  } catch (error) {
    console.warn("[Outbox] markRejected failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Does this device hold writes the server has never seen?
 *
 * ⚠️ Load-bearing for more than a status badge. `forbiddenTables()` in
 * lib/db/policy.ts will PURGE `orders`, `table_sessions` and `outbox` when a
 * POS tablet is switched to kiosk or KDS mode. Before v12 that was always safe
 * — every row was a projection. It is not safe now: purging a non-empty outbox
 * destroys a guest's check with no way back. Check this first and refuse.
 */
export async function hasUnsyncedWrites(): Promise<boolean> {
  return (await pendingOpCount()) > 0;
}

export async function pendingOpCount(): Promise<number> {
  const db = getReadDb();
  if (!db) return 0;
  try {
    // Every row, failed included — this answers "does this device hold writes
    // the server has not seen?", and a parked op is still one of those.
    // Callers that need the split use failedOpCount() / failedOpReasons().
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox`,
    );
    return row?.n ?? 0;
  } catch {
    // Fail CLOSED: if we cannot prove the outbox is empty, assume it is not.
    // The cost of a false positive is a blocked station switch; the cost of a
    // false negative is a destroyed order.
    return 1;
  }
}

/**
 * Drop ops that can NEVER succeed because their entity id is not a uuid.
 *
 * Rows written before the id fix carry `order_<ts>_<rand>` / composite cart
 * keys, which `create_order_v4` and `add_order_item_v5` reject with 22P02 on
 * every attempt. They are unsyncable by construction — the server cannot
 * accept that identity and the identity is immutable — so parking them as
 * "failed" would leave permanent noise in the health counters for orders the
 * operator has long since finished.
 *
 * Runs once at startup. The LOCAL rows are left alone: they are still the
 * device's record of those orders, they simply stop trying to sync.
 */
export async function purgeUnsyncableOps(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  // GLOB, not LIKE: `?` is the single-character wildcard here. `_` is a
  // LITERAL underscore in GLOB, so the underscore form matched only strings
  // that actually contain underscores — purging the valid uuids and keeping
  // the broken ones, precisely backwards.
  const UUID = "????????-????-????-????-????????????";
  try {
    return await dbWriteMutex.runExclusive(async () => {
      // Checks BOTH ids, not just entity_id.
      //
      // An `add_item` op can have a perfectly valid uuid entity_id while its
      // order_id is a legacy `order_<ts>_<rand>` — the item is fine, the order
      // it hangs off can never exist server-side, so the push fails with 22P02
      // on p_order_id forever. Purging on entity_id alone left exactly those
      // behind, which is why the parked count stayed at 22 across restarts.
      const res = await db.runAsync(
        `DELETE FROM outbox
          WHERE entity_id NOT GLOB ?
             OR (order_id IS NOT NULL AND order_id NOT GLOB ?)`,
        [UUID, UUID],
      );
      const n = res.changes ?? 0;
      if (n > 0) {
        console.warn(
          `[LF] purged ${n} unsyncable op(s) with non-uuid entity ids ` +
            `(written before the id fix). Their local rows are untouched.`,
        );
      }
      return n;
    });
  } catch (error) {
    console.warn("[LF] purgeUnsyncableOps failed:", error);
    return 0;
  }
}

/**
 * Give permanently-failed ops one more chance, once per app start.
 *
 * A rejection means "retrying with the same code cannot help" — which is true
 * right up until a fix ships. Every bug found this way (the non-uuid item id,
 * the un-flattened modifier payload) strands the ops that hit it, and without
 * this they would sit as `failed` forever even though the very next build
 * would push them successfully.
 *
 * Running at startup and ONLY at startup is what bounds it: a genuinely
 * permanent rejection (an order locked for payment) is re-attempted once per
 * launch rather than every 30 seconds, which is cheap and self-limiting. The
 * attempt counter and last_error are preserved so the history stays visible.
 */
const REQUEUE_ATTEMPT_CEILING = 3;

export async function requeueFailedOps(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    return await dbWriteMutex.runExclusive(async () => {
      // Only ops that have not already burned their retries.
      //
      // A shipped fix can rescue an op whose failure was in the CODE. It can
      // do nothing for one whose failure is in its own stored PAYLOAD — the
      // two modifier ops written before the flatten fix carry the old nested
      // cart shape, so they reproduce `null value in column
      // "modifier_group_name"` on every single launch. Requeueing those
      // forever is noise that hides real failures.
      const res = await db.runAsync(
        `UPDATE outbox SET status = 'pending', next_at = NULL
          WHERE status = 'failed' AND attempts < ?`,
        [REQUEUE_ATTEMPT_CEILING],
      );
      const n = res.changes ?? 0;
      if (n > 0) {
        console.warn(
          `[LF] requeued ${n} previously-failed op(s) for one retry ` +
            `(a fix may have shipped since they were parked)`,
        );
      } else {
        const exhausted = await failedOpCount();
        if (exhausted > 0) {
          console.warn(
            `[LF] ${exhausted} parked op(s) have exhausted their retries — ` +
              `their stored payload is malformed, not their code path. ` +
              `discardFailedOps() is the only way out.`,
          );
        }
      }
      return n;
    });
  } catch (error) {
    console.warn("[LF] requeueFailedOps failed:", error);
    return 0;
  }
}

/**
 * Ops for one order that the server does NOT have yet — 'pending' AND
 * 'failed'.
 *
 * Counting only 'pending' was wrong in the way that matters: a REJECTED op is
 * moved to 'failed', so the pending count drops to zero and any barrier built
 * on it concludes "the server has everything" — while that item is, in fact,
 * permanently absent server-side. That is precisely how
 * `KITCHEN_ITEMS_UNRESOLVED requestedCount: 3, updatedCount: 2` happens: the
 * barrier passed, and one item was never routed to the kitchen.
 *
 * "Not synced" is the question being asked, and failed is not synced.
 */
export async function unsyncedOpCountForOrder(
  orderId: string,
): Promise<{ pending: number; failed: number }> {
  const db = getReadDb();
  if (!db) return { pending: 0, failed: 0 };
  try {
    const row = await db.getFirstAsync<{ pending: number; failed: number }>(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed
       FROM outbox
       WHERE order_id = ? OR entity_id = ?`,
      [orderId, orderId],
    );
    return { pending: row?.pending ?? 0, failed: row?.failed ?? 0 };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/**
 * Which of these item ids does the local DB NOT have as synced rows?
 *
 * The definitive answer to "why did the kitchen only resolve 4 of 6": an id
 * present on the cart line but absent (or unsynced) here is an item the server
 * cannot possibly route.
 */
export async function unsyncedItemIds(itemIds: string[]): Promise<string[]> {
  const db = getReadDb();
  if (!db || itemIds.length === 0) return [];
  try {
    const placeholders = itemIds.map(() => "?").join(",");
    const rows = await db.getAllAsync<{ id: string; _sync_status: string }>(
      `SELECT id, _sync_status FROM order_items WHERE id IN (${placeholders})`,
      itemIds,
    );
    const byId = new Map(rows.map((r) => [r.id, r._sync_status]));
    return itemIds.filter((id) => byId.get(id) !== "synced");
  } catch {
    return [];
  }
}

/**
 * The distinct reasons ops are parked, with counts.
 *
 * `last_error` is already stored on every failed op — it just was never read
 * back. Without this, a parked op from an earlier session is invisible: it is
 * correctly NOT retried, so it produces no fresh error line, and the only
 * symptom is a count that never goes down.
 */
export async function failedOpReasons(): Promise<
  { reason: string; count: number; op: string }[]
> {
  const db = getReadDb();
  if (!db) return [];
  try {
    return await db.getAllAsync<{ reason: string; count: number; op: string }>(
      `SELECT COALESCE(last_error, '(no reason recorded)') AS reason,
              COUNT(*) AS count,
              op
         FROM outbox
        WHERE status = 'failed'
        GROUP BY reason, op
        ORDER BY count DESC`,
    );
  } catch {
    return [];
  }
}

/**
 * Delete every parked op. RECOVERY ONLY — this discards writes.
 *
 * The rows stay in the local DB; only the intent to sync them is dropped. Use
 * when the parked ops were produced by a bug that has since been fixed and the
 * orders they belong to are already finished, so replaying them is pointless
 * and their presence blocks unrelated work (send-to-kitchen waits on any
 * unsynced item for its order).
 *
 * NOT called automatically anywhere: the difference between "these are stale
 * debris" and "these are a guest's unsent check" is a judgement only a person
 * can make.
 */
export async function discardFailedOps(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    return await dbWriteMutex.runExclusive(async () => {
      const res = await db.runAsync(`DELETE FROM outbox WHERE status = 'failed'`);
      const n = res.changes ?? 0;
      console.warn(`[LF] discarded ${n} parked op(s) — their rows remain local`);
      return n;
    });
  } catch (error) {
    console.warn("[LF] discardFailedOps failed:", error);
    return 0;
  }
}

/** Ops parked as permanently failed — these need a human. */
export async function failedOpCount(): Promise<number> {
  const db = getReadDb();
  if (!db) return 0;
  try {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox WHERE status = 'failed'`,
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
