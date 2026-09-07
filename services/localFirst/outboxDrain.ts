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
