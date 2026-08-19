/**
 * AUD-10 — confirmed local echo suppression.
 *
 * Every order mutation this station performs comes back to it as a realtime
 * broadcast, and the station re-processes a write it already applied
 * optimistically. Telemetry showed those local echoes are a significant share
 * of realtime handler work; the cost scales with rush volume on the busiest
 * register.
 *
 * The DB half stamps each write with an origin id (see
 * dexapos-website/supabase/migrations/20260816130000_aud10_broadcast_origin_id.sql):
 * the `_v4`/`_v3`/`_v2` mutation RPCs take `p_origin_id`, call
 * `set_broadcast_origin()` in the same transaction, and
 * `broadcast_order_changes()` echoes it back as `data.order.origin_id`.
 * Verified at runtime on staging: a write stamped with a known uuid produced a
 * payload carrying exactly that uuid, `_broadcast_version` 4, `card_subtotal`
 * intact.
 *
 * ── Why this is a registry and not a boolean ────────────────────────────────
 * Suppressing on "did I write recently?" would drop CROSS-STATION events during
 * the same window. Suppression must be tied to a specific write, which is why
 * each mutation gets its own id and is only suppressed once the RPC that
 * carried it has been CONFIRMED.
 *
 * ── Why entries expire ─────────────────────────────────────────────────────
 * If an RPC never returns (deadline, dropped socket) the entry lapses and the
 * echo is applied normally. The failure mode this protects against is a station
 * silently ignoring its own write forever and diverging from the server — far
 * worse than processing one redundant echo.
 */

import { isEchoSuppressionEnabled } from "@/lib/network/killSwitch";

/**
 * Read the flag defensively.
 *
 * This module sits on the cart-mutation hot path, which many existing suites
 * exercise with a partial mock of @/lib/network/killSwitch. A mock predating
 * this feature has no isEchoSuppressionEnabled, and a bare call would throw
 * INSIDE a cart write — turning an optional optimisation into a failed order.
 *
 * The same reasoning holds at runtime: if the flag cannot be read for any
 * reason, the correct answer is OFF (apply every event), never a crash.
 */
function suppressionOn(): boolean {
  try {
    return isEchoSuppressionEnabled?.() === true;
  } catch {
    return false;
  }
}

/** How long an unconfirmed mutation stays eligible for suppression. */
const PENDING_TTL_MS = 15_000;

/**
 * Grace period after confirmation. The broadcast is emitted by a DEFERRABLE
 * INITIALLY DEFERRED constraint trigger, so it fires at COMMIT — after the RPC
 * has already returned to us. The echo therefore arrives slightly AFTER
 * confirmation, never before, and the entry has to outlive the ack to catch it.
 */
const CONFIRMED_TTL_MS = 10_000;

type Entry = {
  op: string;
  orderId?: string;
  confirmed: boolean;
  expiresAt: number;
};

const pending = new Map<string, Entry>();

/** Test seam. */
export function __resetMutationOrigins(): void {
  pending.clear();
}

/** Visible for tests/telemetry. */
export function __pendingCount(): number {
  return pending.size;
}

function sweep(now: number): void {
  for (const [id, e] of pending) {
    if (e.expiresAt <= now) pending.delete(id);
  }
}

function uuid(): string {
  // Avoids a uuid dependency in a hot path; collision risk is irrelevant here
  // because ids are short-lived and only ever compared against our own map.
  const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
}

/**
 * Begin tracking a mutation. Returns the origin id to pass as `p_origin_id`,
 * or null when the feature is off — callers then send no origin at all and the
 * server behaves exactly as it does today.
 */
export function beginMutation(op: string, orderId?: string): string | null {
  if (!suppressionOn()) return null;
  const now = Date.now();
  sweep(now);
  const id = uuid();
  pending.set(id, {
    op,
    orderId,
    confirmed: false,
    expiresAt: now + PENDING_TTL_MS,
  });
  return id;
}

/**
 * Mark the write acknowledged by the server. ONLY confirmed mutations are ever
 * suppressed: an echo we cannot match to a completed write of our own must be
 * applied, because it might be someone else's.
 */
export function confirmMutation(originId: string | null | undefined): void {
  if (!originId) return;
  const e = pending.get(originId);
  if (!e) return;

  // An entry that has ALREADY lapsed must not be revived by a late ack. On a
  // slow link an RPC can exceed PENDING_TTL_MS; by then its echo has most
  // likely already arrived and been applied, so re-arming the entry would let
  // it suppress some LATER event instead — silent divergence, the exact failure
  // this feature must never cause. Drop it and let everything through.
  const now = Date.now();
  if (e.expiresAt <= now) {
    pending.delete(originId);
    return;
  }

  e.confirmed = true;
  e.expiresAt = now + CONFIRMED_TTL_MS;
}

/** Drop a mutation that failed — its echo, if any, must be applied. */
export function abandonMutation(originId: string | null | undefined): void {
  if (!originId) return;
  pending.delete(originId);
}

/**
 * True only when this payload is the confirmed echo of a write WE made.
 *
 * Deliberately conservative: unknown id, unconfirmed id, expired id, missing
 * id, or feature off all return false → the event is applied. Every ambiguous
 * case resolves toward doing the work twice rather than missing it once.
 */
export function isConfirmedLocalEcho(
  originId: string | null | undefined,
): boolean {
  if (!suppressionOn()) return false;
  if (!originId) return false;
  const now = Date.now();
  sweep(now);
  const e = pending.get(originId);
  if (!e) return false;
  if (!e.confirmed) return false;
  if (e.expiresAt <= now) {
    pending.delete(originId);
    return false;
  }
  // One echo per mutation. Consuming the entry means a genuine second event
  // for the same order (a follow-up server write) is never swallowed.
  pending.delete(originId);
  return true;
}
