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
 */
const cachedSequences = new Map<string, number>();

function nextSequence(key: string): number {
  let current = cachedSequences.get(key);

  if (current === undefined) {
    // First use this process: seed from disk, tolerating a failed read.
    try {
      current = storage.getNumber(key) ?? 0;
    } catch {
      current = 0;
    }
  }

  const next = current + 1;
  cachedSequences.set(key, next);

  try {
    storage.set(key, next);
  } catch {
    // Durability lost, uniqueness kept. The next boot reseeds from whatever
    // did persist; a collision there is caught and renumbered server-side.
  }

  return next;
}

/** Test seam — the module cache outlives a cleared storage mock otherwise. */
export function __resetLocalSequencesForTests(): void {
  cachedSequences.clear();
}

/**
 * Generate a local display number matching the SQL format.
 * With station: #S1-0008
 * Without station: #0008
 */
export function generateLocalDisplayNumber(
  locationId: string,
  stationNumber?: number | null,
): string {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  const seq = nextSequence(key);
  const padded = String(seq).padStart(4, "0");

  if (stationNumber != null) {
    return `#S${stationNumber}-${padded}`;
  }
  return `#${padded}`;
}

/**
 * Generate both display_number and order_number atomically (single increment).
 * This is the preferred method — ensures both values use the same sequence number.
 */
export function generateLocalOrderNumbers(
  locationId: string,
  stationNumber?: number | null,
): { displayNumber: string; orderNumber: string } {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  const seq = nextSequence(key);
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
  const current = storage.getNumber(key) ?? 0;
  if (highestKnownSeq > current) {
    storage.set(key, highestKnownSeq);
  }
}

/**
 * Force-set the local sequence counter to match the DB-assigned value.
 * Unlike seedLocalSequence (which only goes up), this corrects downward drift
 * caused by abandoned drafts that consumed local numbers without DB creation.
 * Called after every successful DB order creation.
 */
export function forceSetLocalSequence(
  locationId: string,
  stationNumber: number | null,
  dbSequence: number,
): void {
  const dateStr = getTodayDateStr();
  const key = getSequenceKey(locationId, dateStr, stationNumber);
  const current = storage.getNumber(key) ?? 0;
  if (dbSequence !== current) {
    storage.set(key, dbSequence);
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
    }
  }
}
