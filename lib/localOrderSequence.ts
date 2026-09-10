/**
 * Local Order Sequence Generator
 *
 * Mirrors the SQL generate_order_number format exactly so offline-created
 * orders show meaningful station-aware numbers like #S1-0008 instead of #e8c0.
 *
 * MMKV key format: local_order_seq:{locationId}:{YYYY-MM-DD}:s{stationNumber}
 * Uses raw MMKV (NOT the debounced Zustand adapter) for atomic read-increment-write.
 */

import { storage } from "@/lib/storage";

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getSequenceKey(
  locationId: string,
  dateStr: string,
  stationNumber?: number | null,
): string {
  const suffix =
    stationNumber != null ? `:s${stationNumber}` : `:global`;
  return `local_order_seq:${locationId}:${dateStr}${suffix}`;
}

/**
 * In-process high-water mark per sequence key.
 *
 * ── Why MMKV alone is not enough ───────────────────────────────────────────
 *
 * This used to be a bare `storage.getNumber(key) ?? 0` read-increment-write.
 * If that read ever fails or returns nothing — a cleared bucket, a storage
 * error, a partially-mocked environment — the counter silently RESTARTS at 1,
 * and every order that day gets number 0001.
 *
 * That mattered little while these numbers were a cosmetic fallback for
 * offline orders. It matters a lot now: under Decision 0.1 the locally minted
 * number is FINAL and is what the server stores. A reset means every order
 * collides on `orders_order_number_merchant_key`, `create_order_v4` renumbers
 * every single one, and the number printed on the guest's receipt stops
 * matching the number in the system — the exact reconciliation problem that
 * decision was taken to avoid.
 *
 * Same fix as the Lamport clock in lib/db/outbox.ts: the in-memory value is
 * authoritative once seeded, MMKV is write-through durability. A failed read
 * then costs ordering across a restart, never uniqueness within a session.
 * Caught by a test that generated 25 orders and got 25 copies of number 1.
 *
 * ── Why every write goes through writeSequence ─────────────────────────────
 *
 * The cache used to be write-only from `nextSequence`, while
 * `seedLocalSequence` / `forceSetLocalSequence` wrote MMKV alone. Because the
 * read below prefers the cache, that made both of them DEAD after the first
 * number of the session: every "heal the counter to N" call site in the app
 * wrote a value nothing would ever read again.
 *
 * The visible symptom was the opposite of what those callers intended. The
 * reused-empty-draft path exists to hand a draft back its own low number; with
 * the seed inert it fell through to `cached + 1` and issued a BRAND NEW higher
 * one instead, stranding the old number and skipping the day's numbering.
 * There must be exactly one value, so both paths now go through
 * `writeSequence`.
 */
const cachedSequences = new Map<string, number>();

function readSequence(key: string): number {
  const cached = cachedSequences.get(key);
  if (cached !== undefined) return cached;

  // First use this process: seed from disk, tolerating a failed read.
  try {
    return storage.getNumber(key) ?? 0;
  } catch {
    return 0;
  }
}

function writeSequence(key: string, value: number): void {
  cachedSequences.set(key, value);

  try {
    storage.set(key, value);
  } catch {
    // Durability lost, uniqueness kept. The next boot reseeds from whatever
    // did persist; a collision there is caught and renumbered server-side.
  }
}

/**
 * Take the next number for `key`, never below `floor`.
 *
 * `floor` is what the caller can SEE — the highest sequence held by an order
 * still on this device today (see getTodaySequenceFloor). It only ever pushes
 * the counter up, which is what heals drift after a reinstall or a cleared
 * MMKV bucket without ever handing out a number some order already carries.
 */
function nextSequence(key: string, floor = 0): number {
  const next = Math.max(readSequence(key), floor) + 1;
  writeSequence(key, next);
  return next;
}

/** Test seam — the module cache outlives a cleared storage mock otherwise. */
export function __resetLocalSequencesForTests(): void {
  cachedSequences.clear();
}

/**
 * Generate both display_number and order_number atomically (single increment).
 *
 * `floor` is the highest sequence still visible on this device for the same
 * location/station/day. Pass it whenever the caller can compute it — it is the
 * only thing that stops a cleared MMKV bucket from re-issuing numbers that
 * orders on screen already carry. Callers with store access should go through
 * `allocateOrderNumbers` in lib/reusableEmptyDraft.ts, which computes it.
 */
export function generateLocalOrderNumbers(
  locationId: string,
  stationNumber?: number | null,
  floor = 0,
): { displayNumber: string; orderNumber: string } {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  const seq = nextSequence(key, floor);
  const padded = String(seq).padStart(4, "0");

  if (stationNumber != null) {
    const prefix = `S${stationNumber}`;
    return {
      displayNumber: `#${prefix}-${padded}`,
      orderNumber: `ORD-${dateStr}-${prefix}-${padded}`,
    };
  }
  return {
    displayNumber: `#${padded}`,
    orderNumber: `ORD-${dateStr}-${padded}`,
  };
}

/**
 * Seed the local sequence counter from backend data.
 * Call at startup after fetching active orders to avoid counter drift.
 */
export function seedLocalSequence(
  locationId: string,
  stationNumber: number | null,
  highestKnownSeq: number,
): void {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  if (highestKnownSeq > readSequence(key)) {
    writeSequence(key, highestKnownSeq);
  }
}

/**
 * Force-set the local sequence counter to a value the SERVER assigned.
 *
 * Unlike seedLocalSequence (which only goes up) this may rewind, so it is only
 * ever correct when the caller is echoing a number the database itself just
 * minted — the legacy `create_order_v3` reply and the offline-queue drain of
 * the same op. Under local-first writes the device owns the number and there
 * is nothing to echo, so nothing on that path calls this.
 *
 * NEVER use it to "reclaim" a number from an abandoned draft. Rewinding under
 * Decision 0.1 hands out a number another order already carries, which the
 * server catches as `orders_order_number_merchant_key` and renumbers — and the
 * receipt in the guest's hand stops matching the system.
 */
export function forceSetLocalSequence(
  locationId: string,
  stationNumber: number | null,
  dbSequence: number,
): void {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  if (dbSequence !== readSequence(key)) {
    writeSequence(key, dbSequence);
  }
}

/**
 * Parse the sequence number from a display_number string.
 * #S1-0008 → 8, #0008 → 8, null/undefined → 0
 */
export function parseSequenceFromDisplayNumber(
  displayNumber: string | null | undefined,
): number {
  if (!displayNumber) return 0;
  // Match last group of digits (works for both #S1-0008 and #0008)
  const match = displayNumber.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Parse the station prefix from a display_number string.
 * #S1-0008 → "S1", #0008 → null
 */
export function parseStationFromDisplayNumber(
  displayNumber: string | null | undefined,
): string | null {
  if (!displayNumber) return null;
  const match = displayNumber.match(/#(S\d+)-/);
  return match ? match[1] : null;
}

/**
 * Remove stale sequence keys for dates other than today.
 */
export function cleanupOldSequenceKeys(locationId: string): void {
  const todayStr = getTodayDateStr();
  const prefix = `local_order_seq:${locationId}:`;
  const allKeys = storage.getAllKeys();
  for (const key of allKeys) {
    if (key.startsWith(prefix) && !key.includes(todayStr)) {
      storage.remove(key);
      // The cache is read-preferred, so leaving yesterday's entry behind would
      // resurrect the counter this call just deleted.
      cachedSequences.delete(key);
    }
  }
}
