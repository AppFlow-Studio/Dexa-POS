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

function nextSequence(key: string): number {
  const current = storage.getNumber(key) ?? 0;
  const next = current + 1;
  storage.set(key, next);
  return next;
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
