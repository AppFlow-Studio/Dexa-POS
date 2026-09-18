/**
 * MERGE SEMANTICS — the heart of local-first convergence.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §5, §7.3, §9.4
 *
 * ── The promise these functions have to keep ───────────────────────────────
 *
 * Two writers on a network partition cannot be identical at all times — that
 * is CAP, not a design choice. What IS achievable, and what every rule here
 * exists to deliver:
 *
 *   CONVERGENCE. Given no further writes and restored connectivity, every
 *   device and the server reach identical state, DETERMINISTICALLY, regardless
 *   of the order updates arrived in.
 *
 * Which requires three properties, and each is tested:
 *
 *   1. COMMUTATIVE — merge(a, b) === merge(b, a). If arrival order changes the
 *      result, two devices settle differently and neither is "wrong", which is
 *      undebuggable in the field.
 *   2. IDEMPOTENT — merge(a, a) === a. Replaying an update that already landed
 *      is a no-op, so a retry is always safe.
 *   3. ASSOCIATIVE — three-way merges do not depend on grouping.
 *
 * ── Why whole-row last-writer-wins is WRONG here ───────────────────────────
 *
 * Two servers adding items to the same table offline would lose one server's
 * items entirely. Merge is per-field and per-entity, and every rule below is
 * chosen to fail in the direction that loses the LEAST and is SAFEST FOR THE
 * GUEST. Those two are not always the same thing, and where they conflict the
 * guest wins.
 */

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

export interface Versioned {
  /** Lamport counter — causality. Compared FIRST. */
  _lamport?: number | null;
  /** Deterministic tiebreak when lamports collide. */
  _device_id?: string | null;
  /** Wall clock — for humans, and only a last resort here. */
  updated_at?: string | null;
}

/**
 * Total order over two versions of the same entity.
 * Returns > 0 when `a` wins, < 0 when `b` wins, 0 only when truly identical.
 *
 * ── Why lamport before wall clock ──────────────────────────────────────────
 * Tablet clocks drift. A device 10 minutes fast would otherwise win EVERY
 * last-writer-wins merge forever, and a device 10 minutes slow would lose
 * every one — silently, with no error anywhere. Wall-clock time is for
 * humans; causality is for merges.
 *
 * ── Why device_id is not optional ──────────────────────────────────────────
 * Two devices can produce the same lamport (they are per-device counters that
 * only synchronise on observation). Without a deterministic tiebreak the merge
 * is NOT commutative — a and b would each consider themselves the winner, and
 * the two sides settle differently. String comparison is arbitrary but it is
 * *consistent*, which is the only property that matters here.
 */
export function compareVersion(a: Versioned, b: Versioned): number {
  const la = a._lamport ?? 0;
  const lb = b._lamport ?? 0;
  if (la !== lb) return la - lb;

  const da = a._device_id ?? "";
  const db = b._device_id ?? "";
  if (da !== db) return da < db ? -1 : 1;

  // Same lamport AND same device: the same write, or a clock we cannot
  // distinguish. Fall back to wall clock purely so the result is stable.
  const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
  const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  return 0;
}

/**
 * Stable serialization with sorted keys — the LAST-RESORT tiebreak.
 *
 * Not a hash: the full string, so two genuinely different rows can never
 * collide into "equal".
 */
function canonicalKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([x], [y]) =>
            x < y ? -1 : x > y ? 1 : 0,
          ),
        )
      : v,
  );
}

/**
 * The winner under `compareVersion`, with a CONTENT tiebreak when the version
 * metadata cannot separate them.
 *
 * ── Why the content tiebreak is not paranoia ───────────────────────────────
 *
 * `_lamport` defaults to 0 and `_device_id` to NULL in the schema, so EVERY
 * row ingested from the server carries the same version metadata. Two such
 * rows with different content therefore tie on `compareVersion` — and
 * "ties resolve to `a`" is not commutative: merge(a,b) would keep a's fields
 * and merge(b,a) would keep b's, so two devices settle differently with no
 * error anywhere.
 *
 * A property test over 2000 generated pairs found this at seed 66. It is the
 * exact class of bug that makes a local-first system diverge in the field and
 * is undebuggable afterwards, which is why the merge is tested as a property
 * rather than by example.
 *
 * Comparing canonical content is arbitrary but CONSISTENT — the only thing
 * that matters. Identical content makes the choice irrelevant, which is also
 * what makes merge idempotent.
 */
export function pickNewer<T extends Versioned>(a: T, b: T): T {
  const cmp = compareVersion(a, b);
  if (cmp !== 0) return cmp > 0 ? a : b;
  const ka = canonicalKey(a);
  const kb = canonicalKey(b);
  if (ka === kb) return a; // identical content: either is correct
  return ka < kb ? a : b;
}

// ---------------------------------------------------------------------------
// Order items
// ---------------------------------------------------------------------------

export interface MergeableItem extends Versioned {
  id: string;
  quantity?: number | null;
  /** Tombstone. Remote column, already exists: order_items.is_voided. */
  is_voided?: boolean | number | null;
  voided_at?: string | null;
  modifiers?: unknown;
  [key: string]: unknown;
}

function isVoided(item: MergeableItem): boolean {
  return item.is_voided === true || item.is_voided === 1 || !!item.voided_at;
}

/**
 * Merge two views of one item.
 *
 * REMOVE-WINS: a void beats a concurrent edit, regardless of lamport.
 *
 * This is the one rule that deliberately breaks last-writer-wins, and the
 * reasoning is asymmetric on purpose: un-voiding an item a manager voided
 * sends food to a table that should not get it and charges a guest for it.
 * Losing a concurrent re-add just means someone rings it in again. The first
 * failure is invisible until the guest complains; the second is obvious
 * immediately.
 *
 * Remove-wins is also trivially commutative — "voided if EITHER side voided"
 * does not care about order.
 */
export function mergeItem(
  a: MergeableItem,
  b: MergeableItem,
): MergeableItem {
  // ── The merge is a MAX over a total order, which is what makes it
  //    commutative, idempotent AND associative:
  //
  //        (is_voided asc, lamport asc, device asc, updated_at asc, content desc)
  //
  //    Crucially it always returns one of the INPUTS verbatim, never a blend.
  //
  //    An earlier version built `{...other, ...base}` plus the tombstone's void
  //    metadata. When one side was voided and the other was the newer write,
  //    that produced an object equal to NEITHER input — so a three-way merge's
  //    intermediate value differed by grouping, and the content tiebreak then
  //    resolved differently. merge(merge(a,b),c) !== merge(a,merge(b,c)).
  //    Found by the associativity property test at seed 34.
  //
  //    Discarding the live side's field edits when the other side voided the
  //    item is correct, not a compromise: the item is voided, so its quantity
  //    and modifiers are moot. What must survive is the VOID.
  const aVoided = isVoided(a);
  const bVoided = isVoided(b);
  if (aVoided !== bVoided) return aVoided ? a : b; // remove-wins
  if (aVoided && bVoided) return pickNewer(a, b);

  // QUANTITY IS NOT A COUNTER. The UI sets an ABSOLUTE quantity from a picker,
  // so LWW is faithful to the gesture. Treating it as an increment and summing
  // would turn "set to 2" on two devices into 4 — an over-charge, and exactly
  // the kind of "clever" merge that produces wrong money.
  //
  // Modifiers replace wholesale on the parent's version, matching
  // replace_order_item_modifiers_v2's server-side semantics. Keeping client
  // and server aligned matters more than a cleverer per-modifier merge.
  return pickNewer(a, b);
}

/**
 * ADD-WINS UNION over the item set, keyed by the item's stable UUID.
 *
 * Two stations each adding items offline → the guest gets BOTH. An extra line
 * a manager can void is a recoverable annoyance; a missing ordered item is a
 * remake, a comped check and an unhappy table.
 *
 * This is only sound because item ids are client-minted and stable (§6). Under
 * the old scheme the "same" item had different ids on each side and a union
 * would duplicate it — which is precisely the reported duplicate-items bug.
 */
export function mergeItemSets(
  local: MergeableItem[],
  remote: MergeableItem[],
): MergeableItem[] {
  const byId = new Map<string, MergeableItem>();

  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? mergeItem(existing, item) : item);
  }

  // Sorted by id so the OUTPUT ORDER is deterministic too. Without this,
  // merge(a,b) and merge(b,a) could produce equal sets in different orders,
  // and any consumer that hashes or diffs the array would see them as
  // different — a commutativity bug one level up.
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Order status — monotonic advance
// ---------------------------------------------------------------------------

/**
 * Rank in the order lifecycle. Merge takes the FURTHER-ADVANCED state; status
 * never regresses.
 *
 * `paid`/`completed` must never fall back to `open` because a stale device
 * reconnected — that would re-open a settled check and invite a double charge.
 *
 * Terminal states rank highest so nothing can drag an order back out of them.
 */
const ORDER_STATUS_RANK: Record<string, number> = {
  draft: 0,
  pending: 1,
  accepted: 2,
  sent_to_kitchen: 3,
  preparing: 4,
  ready: 5,
  completed: 6,
  // Terminal / exceptional. Above completed: a void or refund is a deliberate
  // human act and must not be undone by a late-arriving "preparing".
  declined: 7,
  cancelled: 7,
  refunded: 8,
  void: 9,
};

export function mergeOrderStatus(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ra = ORDER_STATUS_RANK[a] ?? -1;
  const rb = ORDER_STATUS_RANK[b] ?? -1;
  if (ra === rb) return a < b ? a : b; // deterministic on unknown values
  return ra > rb ? a : b;
}

// ---------------------------------------------------------------------------
// Table session status
// ---------------------------------------------------------------------------

/**
 * Local-only statuses (`seating`, `ordering`, `paying`, `closing`) exist purely
 * to drive this device's UI and MUST NOT participate in a merge — they are not
 * facts about the world, they are facts about one operator's screen.
 * `isLocalOnlyStatus()` in lib/tableStateMachine.ts already guards the sync
 * direction; this keeps the merge direction consistent with it.
 */
const LOCAL_ONLY = new Set(["seating", "ordering", "paying", "closing"]);

const SESSION_STATUS_RANK: Record<string, number> = {
  available: 0,
  reserved: 1,
  seated: 2,
  ordered: 3,
  served: 4,
  check_presented: 5,
  paid: 6,
  cleaning: 7,
  blocked: 8,
  not_in_service: 9,
};

export function mergeSessionStatus(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  // A local-only status yields to any real one. If BOTH are local-only there is
  // nothing to converge on — neither is a shared fact — so keep `a`.
  const aLocal = a ? LOCAL_ONLY.has(a) : false;
  const bLocal = b ? LOCAL_ONLY.has(b) : false;
  // Both local-only: neither is a shared fact, so the choice is arbitrary —
  // but it must still be DETERMINISTIC. Returning `a` was not: merging
  // ("seating","paying") and ("paying","seating") gave different answers.
  if (aLocal && bLocal) return (a! < b! ? a : b) ?? null;
  if (aLocal) return b ?? null;
  if (bLocal) return a ?? null;

  if (!a) return b ?? null;
  if (!b) return a;
  const ra = SESSION_STATUS_RANK[a] ?? -1;
  const rb = SESSION_STATUS_RANK[b] ?? -1;
  if (ra === rb) return a < b ? a : b;
  return ra > rb ? a : b;
}

// ---------------------------------------------------------------------------
// Order header
// ---------------------------------------------------------------------------

/**
 * Fields merged INDEPENDENTLY, last-writer-wins per field.
 *
 * Per-field rather than per-row so a name edit on one device and a table move
 * on another BOTH survive. Whole-row LWW would silently discard one of them,
 * and the operator who lost would have no way to know.
 */
export const MERGEABLE_HEADER_FIELDS = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_id",
  "table_number",
  "special_instructions",
  "order_type",
  "assigned_server_id",
  "session_id",
  "guest_count",
] as const;

/**
 * Money and derived totals are DELIBERATELY absent from that list.
 *
 * Merging a computed total against its own inputs is how money goes wrong:
 * you can end up with a total that matches neither side's item set. Totals are
 * recomputed from the merged items afterwards, on both sides, with the same
 * calculator — see §3.4. `amount_paid`, `payments` and the lock flags are
 * server-authoritative and never merged at all (§7.4).
 */
export function mergeOrderHeader<T extends Versioned & Record<string, unknown>>(
  a: T,
  b: T,
): T {
  const winner = pickNewer(a, b);
  const loser = winner === a ? b : a;
  const out: Record<string, unknown> = { ...loser, ...winner };

  // Per-field resolution: a field the winner has no value for should not erase
  // a value the loser does have. This is what makes the merge per-FIELD rather
  // than "the newer row wins and everything else is collateral".
  for (const field of MERGEABLE_HEADER_FIELDS) {
    const wv = (winner as Record<string, unknown>)[field];
    const lv = (loser as Record<string, unknown>)[field];
    out[field] = wv === undefined || wv === null ? lv : wv;
  }

  out.status = mergeOrderStatus(
    a.status as string | undefined,
    b.status as string | undefined,
  );

  return out as T;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface MergeableSession extends Versioned {
  id: string;
  status?: string | null;
  order_id?: string | null;
  party_size?: number | null;
  closed_at?: string | null;
  [key: string]: unknown;
}

/**
 * Session merge. Close-wins, then monotonic status, then per-field LWW.
 *
 * Close-wins for the same reason void-wins on items: re-opening a session a
 * manager closed puts a table back into service that staff believe is free.
 */
export function mergeSession(
  a: MergeableSession,
  b: MergeableSession,
): MergeableSession {
  const winner = pickNewer(a, b);
  const loser = winner === a ? b : a;
  const out: MergeableSession = { ...loser, ...winner };

  const closedAt = a.closed_at ?? b.closed_at ?? null;
  if (closedAt) {
    out.closed_at = closedAt;
    out.is_active = 0;
    out.status = mergeSessionStatus(a.status, b.status);
    return out;
  }

  out.status = mergeSessionStatus(a.status, b.status);
  // An order link, once made, is never unmade by a merge — a session that
  // forgot its order is a check nobody can find.
  out.order_id = a.order_id ?? b.order_id ?? null;
  return out;
}

/**
 * ADD-WINS union of the tables a session occupies, keyed by (session, table).
 * A merged table is additive; un-merging is an explicit action that carries its
 * own op, never an absence in a payload.
 */
export function mergeTableSets(
  a: readonly string[],
  b: readonly string[],
): string[] {
  return [...new Set([...a, ...b])].sort();
}
