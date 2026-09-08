/**
 * THE DRAIN — pushes locally-committed writes to the server.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §7.2
 *
 * ── Ordering rules, and why they are not the same rule ─────────────────────
 *
 * SERIAL PER ORDER. A check's operations are causally dependent: an
 * `add_item` must land before the `update_item_quantity` that adjusts it, and
 * both before the `void_item` that removes it. Draining them concurrently
 * would let the server see a quantity update for an item it does not have yet.
 *
 * PARALLEL ACROSS ORDERS. Two different checks share nothing, and serializing
 * the whole outbox behind one slow order is how a station with a stuck ticket
 * stops syncing everything else.
 *
 * ── The failure taxonomy, which is the important part ──────────────────────
 *
 * Every op ends in exactly one of three states, and conflating any two of them
 * is how writes get silently lost:
 *
 *   synced   — the server has it. Delete the op.
 *   retry    — TRANSIENT (network, timeout, 5xx). Back off, never drop.
 *   rejected — PERMANENT (validation, auth, order locked for payment).
 *              Retrying cannot help. Park it as 'failed', flag the row
 *              'conflict', and SURFACE IT. Never delete it: an operator has to
 *              be able to see what did not apply.
 *
 * The historical bug this guards against is treating a rejection as a retry
 * (an op that spins forever, invisible) or a retry as a rejection (a write
 * dropped because the wifi blinked).
 */
import { Mutex } from "async-mutex";

import {
  claimBatch,
  markRejected,
  markRetry,
  markSynced,
  unsyncedOpCountForOrder,
  type ClaimedOp,
  type OutboxOp,
} from "@/lib/db/outbox";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export type DrainOutcome =
  | { kind: "synced"; syncVersion?: number | null }
  | { kind: "retry"; error: string }
  | { kind: "rejected"; reason: string };

/** One handler per op type. Injected, so the drain is testable without Supabase. */
export type OpHandlers = Partial<Record<OutboxOp, (op: ClaimedOp) => Promise<DrainOutcome>>>;

export interface DrainStats {
  attempted: number;
  synced: number;
  retried: number;
  rejected: number;
  skipped: number;
}

/** Which table an op's entity lives in, so markSynced can clear its flag. */
const ENTITY_TABLE: Record<string, string> = {
  order: "orders",
  order_item: "order_items",
  table_session: "table_sessions",
  order_seat: "order_seats",
};

// One mutex per order id. Held only for that order's ops.
const orderLocks = new Map<string, Mutex>();

function lockFor(orderId: string): Mutex {
  let m = orderLocks.get(orderId);
  if (!m) {
    m = new Mutex();
    orderLocks.set(orderId, m);
  }
  return m;
}

/**
 * Ops with no `order_id` (a session created before its order, say) are keyed
 * by entity id instead. They still need SOME serialization key — two drains
 * racing the same session would double-seat a table.
 */
function serializationKey(op: ClaimedOp): string {
  return op.orderId ?? `entity:${op.entityId}`;
}

// ---------------------------------------------------------------------------
// The drain
// ---------------------------------------------------------------------------

let draining = false;

/**
 * Drain one batch. Safe to call repeatedly; overlapping calls are ignored.
 *
 * Returns stats rather than throwing — a drain failure is a normal condition
 * on a POS behind bad wifi, not an exception. The caller decides whether to
 * schedule another pass.
 */
export async function drainOnce(
  handlers: OpHandlers,
  options: { limit?: number } = {},
): Promise<DrainStats> {
  const stats: DrainStats = {
    attempted: 0,
    synced: 0,
    retried: 0,
    rejected: 0,
    skipped: 0,
  };

  // Re-entrancy guard. Two concurrent drains would claim the same rows (claim
  // is a read, not a lock) and push every op twice. The RPCs are idempotent on
  // the row id so that would not corrupt data — but it doubles the traffic on
  // exactly the connection that is already struggling.
  if (draining) return stats;
  draining = true;

  try {
    const ops = await claimBatch(options.limit ?? 50);
    if (ops.length === 0) return stats;
    console.log(
      `[LF] drain claimed ${ops.length}:`,
      ops.map((o) => `${o.op}:${o.entityId.slice(0, 8)}(a${o.attempts})`).join(" "),
    );

    // Group by serialization key, preserving the claim's oldest-first order
    // WITHIN each group. That order is the causal order.
    const groups = new Map<string, ClaimedOp[]>();
    for (const op of ops) {
      const key = serializationKey(op);
      const list = groups.get(key);
      if (list) list.push(op);
      else groups.set(key, [op]);
    }

    await Promise.all(
      [...groups.entries()].map(([key, groupOps]) =>
        lockFor(key).runExclusive(async () => {
          for (const op of groupOps) {
            const handler = handlers[op.op];
            if (!handler) {
              // An op type with no handler is a programming error, not a
              // transient failure. Retrying forever would hide it, so park it
              // where a human will see it.
              stats.skipped++;
              await markRejected(op.id, `no handler for op "${op.op}"`, {
                table: ENTITY_TABLE[op.entity] ?? "orders",
                id: op.entityId,
              });
              continue;
            }

            stats.attempted++;
            let outcome: DrainOutcome;
            try {
              outcome = await handler(op);
            } catch (error) {
              // A THROWN handler is treated as transient. This direction is
              // deliberate: an unexpected exception is more likely a network
              // or serialization fault than a permanent server refusal, and
              // retrying a write we are unsure about is safe precisely because
              // every RPC is idempotent on the client-minted row id. The
              // opposite default would drop writes on a transient bug.
              outcome = { kind: "retry", error: String(error) };
            }

            const table = ENTITY_TABLE[op.entity] ?? "orders";

            if (outcome.kind === "synced") {
              stats.synced++;
              await markSynced(op.id, {
                table,
                id: op.entityId,
                syncVersion: outcome.syncVersion ?? null,
              });
            } else if (outcome.kind === "rejected") {
              stats.rejected++;
              await markRejected(op.id, outcome.reason, {
                table,
                id: op.entityId,
              });
            } else {
              stats.retried++;
              await markRetry(op.id, op.attempts, outcome.error);
              // STOP this order's group on a transient failure. Continuing
              // would push later ops for the same check while an earlier one
              // is still unsent — the server would see them out of causal
              // order, which is the one thing per-order serialization exists
              // to prevent.
              break;
            }
          }
        }),
      ),
    );

    console.log(
      `[LF] drain done synced=${stats.synced} retried=${stats.retried} ` +
        `rejected=${stats.rejected} skipped=${stats.skipped}`,
    );
    return stats;
  } finally {
    draining = false;
  }
}

/**
 * Classify a Supabase/PostgREST error as transient or permanent.
 *
 * Getting this wrong in either direction loses data or hides bugs, so the
 * rule is explicit rather than a heuristic on the message string:
 *
 *   PERMANENT — the server understood us and said no. Retrying is pointless
 *   and the operator needs to know: RLS denial, a typed guard like
 *   ORDER_OWNED_BY_OTHER_STATION, a locked order, a constraint violation.
 *
 *   TRANSIENT — everything else, INCLUDING an unrecognised error. Defaulting
 *   unknown failures to "retry" is the safe direction: the cost is a redundant
 *   idempotent call, versus a silently discarded order.
 */
const PERMANENT_PATTERNS = [
  /ORDER_OWNED_BY_OTHER_STATION/i,
  /access denied/i,
  /permission denied/i,
  /violates row-level security/i,
  /is_order_locked|order is locked|locked for payment/i,
  /not found or access denied/i,
  /invalid input syntax/i,
  /violates (check|foreign key|not-null) constraint/i,
];

export function classifyError(message: string): "retry" | "rejected" {
  return PERMANENT_PATTERNS.some((re) => re.test(message)) ? "rejected" : "retry";
}

/**
 * Flatten anything throwable-or-returnable into text we can classify.
 *
 * ── Why this is not just `String(error)` ───────────────────────────────────
 *
 * Supabase/PostgREST return errors as PLAIN OBJECTS (`{ message, code,
 * details, hint }`), not `Error` instances. `String()` on one of those yields
 * `"[object Object]"`, which matches no permanent pattern — so EVERY server
 * refusal would have been classified transient and retried forever, invisibly.
 * A test asserting `ORDER_OWNED_BY_OTHER_STATION` is a rejection caught it.
 *
 * `code` and `details` are included because a PostgREST refusal often carries
 * the useful part there rather than in `message` (`42501` for
 * insufficient_privilege, the constraint name in `details`).
 */
export function errorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.code, e.details, e.hint]
      .filter((v) => typeof v === "string" && v.length > 0)
      .join(" | ");
    if (parts) return parts;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Convenience: turn an error into the matching outcome. */
export function outcomeFromError(error: unknown): DrainOutcome {
  const message = errorText(error);
  return classifyError(message) === "rejected"
    ? { kind: "rejected", reason: message }
    : { kind: "retry", error: message };
}

/** Test seam — module-level locks and the re-entrancy flag outlive a test. */
export function __resetDrainForTests(): void {
  orderLocks.clear();
  draining = false;
}

// ---------------------------------------------------------------------------
// Prompt drain after a local write
// ---------------------------------------------------------------------------

/**
 * A local write is durable the instant it commits, but it is not VISIBLE to
 * the rest of the building until it drains — the KDS, the other stations and
 * the online-orders board all read the server.
 *
 * Relying on the 30s interval alone would mean a ticket taking up to half a
 * minute to reach the kitchen when the network is perfectly fine. That is a
 * regression against the old online-first path, which fired the RPC
 * immediately, and it is not what "local-first" is supposed to cost.
 *
 * So a write NUDGES the drain. The nudge is off the hot path — the caller does
 * not await it — so the tap still returns as soon as SQLite commits.
 *
 * ── Debounce, with a max-wait ─────────────────────────────────────────────
 *
 * Ringing in a round of drinks fires one nudge per item. Coalescing them into
 * one drain avoids a burst of overlapping pushes.
 *
 * But a plain trailing debounce STARVES under sustained input: while items
 * keep arriving faster than the delay, every nudge reschedules the previous
 * one and the drain never runs — reintroducing exactly the latency it was
 * added to remove, hidden behind code that looks like it fixed it. MAX_WAIT
 * forces a drain after that much continuous deferral regardless.
 */
const NUDGE_DEBOUNCE_MS = 300;
const NUDGE_MAX_WAIT_MS = 2000;

/**
 * Is there a network worth pushing over?
 *
 * Lazily required rather than imported at the top: `offlineSyncService` is a
 * large module with its own NetInfo subscription and lifecycle registration,
 * and pulling it into every consumer of the outbox (including the tests that
 * exercise the drain with a fake Supabase) would drag all of that along.
 * Missing it is not fatal — an unknown network is treated as usable, which is
 * the pre-existing behaviour.
 */
function isNetworkUsable(): boolean {
  try {
    const {
      getIsOnline,
    } = require("@/services/offlineSyncService") as typeof import("@/services/offlineSyncService");
    return getIsOnline();
  } catch {
    return true;
  }
}

let drainRunner: (() => Promise<void>) | null = null;
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
let firstNudgeAt = 0;

/** The drain hook registers its bound runner here. */
export function registerDrainRunner(fn: (() => Promise<void>) | null): void {
  drainRunner = fn;
}

/**
 * Ask for a drain soon. Never throws, never blocks the caller.
 *
 * ── Why this refuses to run while offline ─────────────────────────────────
 *
 * `commitLocalWrite` nudges after EVERY local write, which is right: online,
 * a ticket should reach the kitchen in milliseconds, not on the 30s interval.
 *
 * Offline it was actively harmful. Every tap ran a full drain, every RPC in it
 * failed on the network, and `markRetry` incremented `attempts` and pushed
 * `next_at` out exponentially for every op in the batch. Ringing in ten items
 * during an outage left the FIRST op at ten attempts — past
 * REQUEUE_ATTEMPT_CEILING, and scheduled at the 5-minute backoff ceiling.
 *
 * So the punishment for being offline was: nothing syncs for up to five
 * minutes AFTER the network comes back, and the ops are no longer eligible for
 * the startup requeue that exists to rescue them. That is the "orders don't
 * sync when we get signal back" report, manufactured entirely by the retry
 * accounting of pushes that never had any chance of succeeding.
 *
 * A write while offline is durable the moment SQLite commits. There is
 * nothing to gain by proving the network is still down, so we don't ask.
 * `useOutboxDrain` runs the drain on reconnect (after clearing the backoff)
 * and on its interval.
 */
export function nudgeDrain(): void {
  if (!drainRunner) return;
  if (!isNetworkUsable()) return;

  const now = Date.now();
  if (firstNudgeAt === 0) firstNudgeAt = now;

  const fire = () => {
    nudgeTimer = null;
    firstNudgeAt = 0;
    void drainRunner?.().catch(() => {
      // A drain failure is a normal condition behind bad wifi; the ops stay
      // queued with backoff and the interval will try again.
    });
  };

  if (now - firstNudgeAt >= NUDGE_MAX_WAIT_MS) {
    if (nudgeTimer) clearTimeout(nudgeTimer);
    fire();
    return;
  }

  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(fire, NUDGE_DEBOUNCE_MS);
}

/** Test seam. */
export function __resetNudgeForTests(): void {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = null;
  firstNudgeAt = 0;
  drainRunner = null;
}

// ---------------------------------------------------------------------------
// Sync barrier
// ---------------------------------------------------------------------------

/**
 * Wait until one order's queued writes have reached the server.
 *
 * ── The race this closes ───────────────────────────────────────────────────
 *
 * Local-first writes return as soon as SQLite commits, and the drain pushes
 * them a moment later. Anything that asks the SERVER to act on those rows must
 * not run in between.
 *
 * Send-to-kitchen is the case that found this: `send_items_to_kitchen`
 * resolves the cart's items against `order_items` server-side, so items still
 * sitting in the outbox simply are not there —
 *
 *     KITCHEN_ITEMS_UNRESOLVED  requestedCount: 6, updatedCount: 4
 *
 * i.e. two items never reached the kitchen. Silent, and exactly the class of
 * failure ("items don't make it") this project exists to remove.
 *
 * Not a general "wait for sync": it is scoped to ONE order, so a stuck ticket
 * on another check cannot block this one. Bounded by `timeoutMs`, and returns
 * `false` rather than throwing on timeout — the caller decides whether to
 * proceed degraded (offline, where queueing is correct) or to stop.
 */
export async function waitForOrderSynced(
  orderId: string,
  timeoutMs = 5000,
): Promise<boolean> {
  // Static import, not a dynamic one: this module already depends on
  // lib/db/outbox at the top, so there is no cycle to dodge — and a dynamic
  // import fails outright under Jest's default VM
  // ("A dynamic import callback was invoked without --experimental-vm-modules"),
  // which would make the barrier untestable.
  const initial = await unsyncedOpCountForOrder(orderId);
  if (initial.pending === 0 && initial.failed === 0) return true;

  // A FAILED op will never clear on its own, so waiting out the timeout is
  // pure delay for the operator. Report immediately and let the caller decide.
  if (initial.pending === 0 && initial.failed > 0) {
    console.error(
      `[LF] ✗ order ${orderId} has ${initial.failed} op(s) the server REJECTED. ` +
        `Those rows are NOT on the server and will not arrive without a fix — ` +
        `expect KITCHEN_ITEMS_UNRESOLVED for them.`,
    );
    return false;
  }

  // Offline there is nothing to wait FOR: the drain cannot run, so the count
  // cannot fall. Polling out the full timeout would just freeze the gesture
  // for five seconds before the caller proceeds degraded — which is the
  // correct outcome, and is available immediately.
  if (!isNetworkUsable()) return false;

  nudgeDrain();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    const now = await unsyncedOpCountForOrder(orderId);
    if (now.pending === 0 && now.failed === 0) return true;
    if (now.pending === 0 && now.failed > 0) {
      console.error(
        `[LF] ✗ order ${orderId}: ${now.failed} op(s) rejected during drain — ` +
          `those items are missing server-side.`,
      );
      return false;
    }
  }

  const left = await unsyncedOpCountForOrder(orderId);
  console.warn(
    `[LF] waitForOrderSynced timed out for ${orderId} — ` +
      `${left.pending} pending, ${left.failed} failed`,
  );
  return false;
}
