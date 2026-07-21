/**
 * W1-1: Stable partialize for useOrderStore — the write-amplification fix.
 *
 * zustand's persist middleware calls partialize on EVERY set(), and the
 * order-store partialize builds a fresh slice object each time, so the
 * referential-identity skip in lib/storage.ts never fires: every set() arms
 * a 150–300 KB JSON.stringify even when nothing in the persisted subset
 * changed (e.g. remote broadcast merges of orders this station doesn't own).
 *
 * Fix: shallow-compare the freshly built slice against the last one and
 * return the CACHED object reference when byte-identical. Same ref →
 * lazyDebouncedWrite's identity skip fires → no stringify, no MMKV write.
 *
 * Correctness derives from Immer structural sharing (the store never mutates
 * committed state in place, so ref-change ⇔ content-change): the cached
 * object is returned only when every ref/value it would serialize is
 * identical, i.e. the payload is provably byte-identical. There is no stale
 * cache hazard on hydration, runtime rehydrate(), or flag flips, because
 * equality is re-derived from content on every call.
 *
 * Rollback: `persist.memo_gate_v1` flag (lib/network/featureFlags.ts,
 * default ON, env kill EXPO_PUBLIC_PERSIST_MEMO_GATE=0). Gate OFF keeps the
 * compare running in shadow mode (persist.memo.would_skip counter) but
 * always returns the fresh object — byte-identical to pre-W1-1 behavior.
 *
 * Leaf module: imports only featureFlags + telemetry. Do not import stores.
 */
import { isPersistMemoEnabled } from "@/lib/network/featureFlags";
import {
  KEY_PERSIST_MEMO_HIT,
  KEY_PERSIST_MEMO_MISS,
  KEY_PERSIST_MEMO_WOULD_SKIP,
} from "@/lib/telemetry/keys";
import { recordCount } from "@/lib/telemetry/registry";

/**
 * Shape of the order-store persisted slice (mirrors the partialize return in
 * stores/useOrderStore.ts). Values are opaque here — the memo only compares
 * references, never reads into orders.
 */
export interface PersistedOrderSlice {
  ordersById: Record<string, unknown>;
  orderIds: string[];
  activeOrderId: string | null;
  workingSetOrderIds: string[];
  unsyncedOrderIds: string[];
  currentLocationId: string | null;
}

/**
 * True iff the two slices would serialize to identical bytes, established
 * via shallow ref/value compares (~dozens of pointer compares — O(subset),
 * not O(payload)):
 * - scalars by value
 * - workingSetOrderIds / unsyncedOrderIds by ref (state arrays, Immer-stable
 *   when untouched)
 * - orderIds element-wise (rebuilt fresh each partialize)
 * - ordersById per-key by ref (Immer: an untouched order keeps its identity)
 */
export function shallowSliceEqual(
  a: PersistedOrderSlice,
  b: PersistedOrderSlice,
): boolean {
  if (a === b) return true;
  if (a.activeOrderId !== b.activeOrderId) return false;
  if (a.currentLocationId !== b.currentLocationId) return false;
  if (a.workingSetOrderIds !== b.workingSetOrderIds) return false;
  if (a.unsyncedOrderIds !== b.unsyncedOrderIds) return false;

  const aIds = a.orderIds;
  const bIds = b.orderIds;
  if (aIds.length !== bIds.length) return false;
  for (let i = 0; i < aIds.length; i++) {
    if (aIds[i] !== bIds[i]) return false;
  }

  const aOrders = a.ordersById;
  const bOrders = b.ordersById;
  const aKeys = Object.keys(aOrders);
  if (aKeys.length !== Object.keys(bOrders).length) return false;
  for (const k of aKeys) {
    if (aOrders[k] !== bOrders[k]) return false;
  }
  return true;
}

let lastSlice: PersistedOrderSlice | null = null;

/**
 * Wrap the freshly built partialize output. Returns the cached slice (same
 * ref → downstream identity skip fires) when content is unchanged and the
 * gate is ON; otherwise returns (and caches) the fresh slice.
 */
export function memoizePersistedSlice<T extends PersistedOrderSlice>(
  fresh: T,
): T {
  if (lastSlice !== null && shallowSliceEqual(lastSlice, fresh)) {
    if (isPersistMemoEnabled()) {
      recordCount(KEY_PERSIST_MEMO_HIT);
      return lastSlice as T;
    }
    // Shadow mode: gate OFF — count the skip we WOULD have taken, then fall
    // through to today's always-fresh behavior.
    recordCount(KEY_PERSIST_MEMO_WOULD_SKIP);
    lastSlice = fresh;
    return fresh;
  }
  recordCount(KEY_PERSIST_MEMO_MISS);
  lastSlice = fresh;
  return fresh;
}

/** Test-only: clear the module-level cache between cases. */
export function _resetPersistMemoForTests(): void {
  lastSlice = null;
}
