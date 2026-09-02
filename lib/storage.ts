/**
 * MMKV Storage Module
 *
 * Central storage module using MMKV for blazing-fast synchronous storage.
 * Provides three storage instances:
 * - storage: General unencrypted storage (orders, settings, floor plans)
 * - secureStorage: Encrypted storage (employee PINs, device ID)
 * - syncStorage: Sync queue operations (offline operations queue)
 *
 * Benefits over AsyncStorage:
 * - Synchronous read/write (10-30x faster)
 * - AES-256 encryption for sensitive data
 * - Atomic writes for crash safety
 * - Memory-mapped files for instant access
 */

import { debounce } from "lodash";
import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { StateStorage } from "zustand/middleware";
// Constants-only leaf (imports nothing) — safe on the module-load boot path
// that reconcileEnvironmentOnBoot() runs on.
import { DB_PURGE_PENDING_KEY } from "@/lib/db/purgeFlag";
import {
  computeEnvSignature,
  ENV_SIGNATURE_KEY,
  isEnvSignatureWellFormed,
} from "@/lib/envSignature";
// Wave-0 telemetry. Leaf modules (registry imports only react-native-mmkv;
// keys imports only registry) — no cycle back into lib/storage.
import {
  bootHydrateKeyIds,
  KEY_FLUSH_ALL_MS,
  persistKeyIds,
} from "@/lib/telemetry/keys";
import {
  noteFlushAllEnd,
  noteStringifyEnd,
  recordCount,
  recordSample,
} from "@/lib/telemetry/registry";

// ============================================================================
// MMKV INSTANCES
// ============================================================================

/**
 * General storage for non-sensitive data.
 * Used for: orders, store settings, floor plans, time clock data
 */
export const storage = createMMKV({
  id: "dexa-pos-general",
});

/**
 * Encrypted storage for sensitive data.
 * Used for: employee PIN hashes, device ID
 * Uses AES-256 encryption with a secure key.
 */
export const secureStorage = createMMKV({
  id: "dexa-pos-secure",
  // MMKV's web backend (the CFD WebView bundle, web/cfd-entry.tsx) throws
  // `'encryptionKey' is not supported on Web!` at module-eval and takes the
  // whole CFD display down. Native keeps AES-256; web — the CFD display, which
  // stores no PINs / sensitive data — falls back to the plain localStorage
  // shim. This makes the module web-safe regardless of any transitive-import
  // leak into the web bundle (belt-and-suspenders with the lazy-require guards
  // in lib/uiScale.ts and contexts/CFDDisplayDataContext.base.ts).
  ...(Platform.OS === "web"
    ? {}
    : { encryptionKey: "dexa-pos-secure-key-v1" }), // In production, derive from device-specific key
});

/**
 * Sync queue storage for offline operations.
 * Separate instance to avoid conflicts during heavy sync operations.
 * Used for: offline operations queue, ID registry, order item cache
 */
export const syncStorage = createMMKV({
  id: "dexa-pos-sync",
});

// ============================================================================
// ENVIRONMENT GUARD (staging <-> production isolation)
// ============================================================================

/**
 * Secure-storage keys that survive an environment switch. Only hardware /
 * device identity belongs here — it is env-agnostic. Everything else in secure
 * storage (Clerk session JWT, staff PIN hashes) is scoped to a specific
 * backend + Clerk instance and must be dropped on a switch.
 *
 * Kept in sync with lib/deviceId.ts (DEVICE_ID_KEY). Duplicated as a literal
 * here to avoid an import cycle (lib/deviceId imports from lib/storage).
 */
const ENV_SWITCH_PRESERVED_SECURE_KEYS = ["dexa-pos-device-id"] as const;

export interface EnvReconcileResult {
  /** True only when the signature actually changed (a real staging<->prod switch). */
  switched: boolean;
  from: string | null;
  to: string;
  /**
   * True when boot saw a malformed/half-injected ("unknown") signature and
   * REFUSED to reconcile — it cleared nothing and left the stored baseline
   * untouched. Surfaced to Sentry from app/_layout.tsx (Sentry isn't yet
   * initialized when this runs at module load).
   */
  refusedUnknownSignature?: boolean;
}

let lastEnvReconcile: EnvReconcileResult | null = null;

/** Result of the boot-time environment reconciliation (for logging / breadcrumbs). */
export function getEnvReconcileResult(): EnvReconcileResult | null {
  return lastEnvReconcile;
}

/**
 * Detect a staging<->production switch and purge persisted state belonging to
 * the previous environment.
 *
 * Runs at module init — BEFORE any zustand persist store hydrates — because
 * stores import this module, so its body executes first. That ordering means
 * cleared MMKV keys are gone before any store reads them, avoiding in-memory
 * desync (no need to reset live store state).
 *
 * Safety: a MISSING signature (fresh install, or first upgrade to a build that
 * has this guard) records the current signature and clears NOTHING. Only an
 * actual change in signature triggers a purge — existing devices are never
 * wiped by simply shipping this code.
 *
 * See lib/envSignature.ts for why the un-namespaced persistence causes the
 * "Cannot coerce the result to a single JSON object" RLS error after a switch.
 */
function reconcileEnvironmentOnBoot(): EnvReconcileResult {
  const current = computeEnvSignature();
  const stored = storage.getString(ENV_SIGNATURE_KEY) ?? null;

  // Guardrail: never reconcile on a malformed/half-injected env. A blank
  // EXPO_PUBLIC_SUPABASE_URL or an unrecognized Clerk key prefix at boot yields
  // an "unknown" component; treating that as a backend switch would wipe a
  // healthy production session and every tablet's Clerk token for nothing.
  // Refuse, clear nothing, and leave the stored baseline untouched so the next
  // fully-resolved boot reconciles normally.
  if (!isEnvSignatureWellFormed(current)) {
    console.error(
      `[EnvGuard] Refusing to reconcile on malformed env signature "${current}" ` +
        `(stored="${stored ?? "<none>"}"). Clearing nothing.`,
    );
    return (lastEnvReconcile = {
      switched: false,
      from: stored,
      to: current,
      refusedUnknownSignature: true,
    });
  }

  if (stored === null) {
    // First run with the guard present — record baseline, clear nothing.
    storage.set(ENV_SIGNATURE_KEY, current);
    return (lastEnvReconcile = { switched: false, from: null, to: current });
  }

  // A malformed stored baseline (storage corruption, or a pre-guard build that
  // stamped an "unknown" half) must not be mistaken for the previous
  // environment — re-baseline to the current resolved signature without purging.
  if (!isEnvSignatureWellFormed(stored)) {
    console.warn(
      `[EnvGuard] Stored signature "${stored}" was malformed — re-baselining to ` +
        `"${current}" without purging.`,
    );
    storage.set(ENV_SIGNATURE_KEY, current);
    return (lastEnvReconcile = { switched: false, from: stored, to: current });
  }

  if (stored === current) {
    return (lastEnvReconcile = { switched: false, from: stored, to: current });
  }

  // Real environment switch — both signatures well-formed and genuinely
  // different. Wipe state from the previous backend.
  console.warn(
    `[EnvGuard] Backend environment changed (${stored} -> ${current}). ` +
      `Clearing persisted state from the previous environment.`,
  );

  // General + sync stores are entirely env-specific — wipe wholesale. Every
  // persisted zustand store (orders, settings, floor plan, employees, KDS,
  // table sessions, etc.) lives in `storage`; offline queues/caches in `syncStorage`.
  storage.clearAll();
  syncStorage.clearAll();

  // Secure store: keep hardware identity, drop the rest (Clerk session forces a
  // re-login against the new instance; stale staff PIN hashes belong to the
  // other DB and get re-synced after login).
  try {
    const preserved: Record<string, string> = {};
    for (const key of ENV_SWITCH_PRESERVED_SECURE_KEYS) {
      const v = secureStorage.getString(key);
      if (v != null) preserved[key] = v;
    }
    secureStorage.clearAll();
    for (const [key, value] of Object.entries(preserved)) {
      secureStorage.set(key, value);
    }
  } catch (e) {
    console.error("[EnvGuard] Failed to reset secure storage:", e);
  }

  // clearAll() above removed the old signature from general storage — re-stamp.
  storage.set(ENV_SIGNATURE_KEY, current);

  // The local SQLite DB carries customer names, phones and emails from the
  // PREVIOUS environment. Deleting the file is async and this function runs
  // synchronously at module load, so record the intent instead — initLocalDb()
  // honours it before it opens anything, which is race-free and survives a
  // crash in between. Written after clearAll() for the same reason the
  // signature re-stamp is.
  try {
    syncStorage.set(DB_PURGE_PENDING_KEY, "env_switch");
  } catch (e) {
    console.error("[EnvGuard] Failed to flag local DB purge:", e);
  }

  return (lastEnvReconcile = { switched: true, from: stored, to: current });
}

// Run once at module load, before any persisted store hydrates.
reconcileEnvironmentOnBoot();

// ============================================================================
// SECURE STORAGE INTEGRITY PROBE
// ============================================================================

const SECURE_PROBE_KEY = "__secure_probe_v1";
let secureStorageProbeFailed = false;

/**
 * Whether the boot-time secure-storage read/write probe failed. A failure means
 * the encrypted MMKV bucket can't be written/decrypted this boot — every Clerk
 * token read then returns null and the merchant is silently logged out
 * fleet-wide. Surfaced to Sentry from app/_layout.tsx (Sentry isn't initialized
 * when this runs at module load).
 *
 * Note: the encryption key (`dexa-pos-secure-key-v1`) is intentionally NEVER
 * rotated — rotating it would make the existing bucket undecryptable and log
 * every device out at once. This probe only OBSERVES decrypt health; it never
 * changes the key.
 */
export function didSecureStorageProbeFail(): boolean {
  return secureStorageProbeFailed;
}

function probeSecureStorage(): void {
  try {
    const sentinel = "ok";
    secureStorage.set(SECURE_PROBE_KEY, sentinel);
    if (secureStorage.getString(SECURE_PROBE_KEY) !== sentinel) {
      secureStorageProbeFailed = true;
      console.error(
        "[SecureStorage] Decrypt/read-back probe MISMATCH — encrypted bucket may be unreadable; Clerk tokens at risk.",
      );
    }
  } catch (e) {
    secureStorageProbeFailed = true;
    console.error("[SecureStorage] Decrypt probe threw:", e);
  }
}

probeSecureStorage();

// ============================================================================
// ZUSTAND STORAGE ADAPTERS
// ============================================================================

/**
 * Debounced write to prevent redundant MMKV serialization during rapid mutations.
 * Uses per-key debouncing so different stores don't interfere.
 */
const debouncedWriters: Record<string, ReturnType<typeof debounce>> = {};

function debouncedSetItem(name: string, value: string): void {
  const delay = 300;
  if (!debouncedWriters[name]) {
    debouncedWriters[name] = debounce((v: string) => {
      storage.set(name, v);
    }, delay);
  }
  debouncedWriters[name](value);
}

/**
 * Flush all pending debounced writes immediately.
 * Call this on app background/inactive to prevent data loss if the app is killed.
 */
export function flushAllPendingWrites(): void {
  const flushStart = performance.now();
  for (const key of Object.keys(debouncedWriters)) {
    debouncedWriters[key]?.flush();
  }
  // Flush lazy writers synchronously — the app may be about to suspend.
  isFlushing = true;
  for (const key of Object.keys(lazyWriters)) {
    lazyWriters[key]?.flush();
  }
  isFlushing = false;
  recordSample(KEY_FLUSH_ALL_MS, performance.now() - flushStart);
  noteFlushAllEnd();
}

/**
 * Flush a single pending debounced write immediately.
 * Call this right after a critical store mutation (e.g. CFD pairing commit)
 * when you need durability before a navigation or app kill.
 */
export function flushPendingWrite(name: string): void {
  debouncedWriters[name]?.flush();
  isFlushing = true;
  lazyWriters[name]?.flush();
  isFlushing = false;
}

// ============================================================================
// LAZY PERSIST STORAGE (deferred stringify)
// ============================================================================

/**
 * Debounced writers that accept raw objects (not pre-stringified).
 * JSON.stringify happens inside the debounce — only once per debounce window
 * instead of on every state mutation.
 *
 * Why this matters: createJSONStorage calls JSON.stringify on EVERY state change
 * before passing to our debounced setItem. For useOrderStore (50-300KB payload),
 * 10 rapid item additions produce 10 stringifies (~150ms of JS thread blocking)
 * even though only 1 MMKV write fires. This adapter eliminates those 9 wasted
 * stringifies.
 */
const lazyWriters: Record<string, ReturnType<typeof debounce>> = {};

/**
 * Per-key persist debounce tuning. The default 300ms is right for small
 * stores, but for the order store it sits exactly inside a rapid-ordering tap
 * cadence (~400ms/item): every add re-armed the writer and the debounce
 * expired between taps, so EVERY item paid the full 50-300KB stringify on the
 * JS thread mid-burst. 900ms rides out the burst; maxWait caps how long a
 * sustained burst can defer durability (a stringify lands at least every 3s).
 * flushAllPendingWrites / flushPendingWrite still force synchronous writes on
 * app-background and critical commits, so the crash-loss window only grows
 * for the case where the process dies mid-burst with no background signal —
 * and every non-draft item is already on the backend via its add RPC.
 */
const PERSIST_DEBOUNCE_OVERRIDES: Record<
  string,
  { delay: number; maxWait: number }
> = {
  "order-store-storage": { delay: 900, maxWait: 3000 },
};

/**
 * Last persisted slice reference per key. If the next setItem carries the
 * *same* partialized-slice reference (Immer structural sharing means an
 * unchanged slice keeps its identity), we can skip JSON.stringify entirely —
 * the previous write already covered this value.
 *
 * INVARIANT: this skip is only sound for immutably-updated slices (Immer /
 * spread-on-change). A partialize that returns a stable reference to a slice
 * mutated in place would skip while dirty — never do that.
 *
 * Any path that deletes or clears a persisted key outside the PersistStorage
 * adapter MUST call invalidatePersistCache(name), or a later identical-ref
 * setItem skips the rewrite and the key stays empty on disk (data loss on
 * next boot).
 */
const lastPersistedValue: Record<string, unknown> = {};

/** When true, lazy writers skip setImmediate and write synchronously. */
let isFlushing = false;

function lazyDebouncedWrite(name: string, value: unknown): void {
  // Reference-equality short-circuit: if the partialized slice is the exact
  // same object as the last write, the stringified payload is identical too.
  // Skip the stringify (50–150ms saved on hot mutations that don't touch
  // persistable orders, e.g. payment-only flows).
  //
  // zustand's persist middleware wraps every write in a FRESH `{state,
  // version}` object, so the comparison must target the inner partialized
  // slice — comparing the wrapper itself never matches (W1-1).
  const slice = (value as { state?: unknown } | null)?.state ?? value;
  if (lastPersistedValue[name] === slice) {
    recordCount(persistKeyIds(name).skip);
    return;
  }
  lastPersistedValue[name] = slice;
  recordCount(persistKeyIds(name).arm);

  const override = PERSIST_DEBOUNCE_OVERRIDES[name];
  const delay = override?.delay ?? 300;
  if (!lazyWriters[name]) {
    const writer = (v: unknown) => {
      const stringifyStart = performance.now();
      const str = JSON.stringify(v);
      // Prime suspect in the rush-lag model: full-slice stringify wall time
      // and payload bytes per fire. Sample always rings (never downsampled).
      const ids = persistKeyIds(name);
      recordSample(ids.stringifyMs, performance.now() - stringifyStart);
      recordCount(ids.bytes, str.length);
      noteStringifyEnd();
      if (isFlushing) {
        // Synchronous write during flush (app backgrounding) — must complete
        // before the OS suspends the process.
        storage.set(name, str);
      } else {
        // Yield to the JS thread between stringify and MMKV write.
        // This lets pending React renders and Reanimated worklet callbacks
        // complete, preventing the "batch commit on unmounted view" crash.
        setImmediate(() => {
          storage.set(name, str);
        });
      }
    };
    lazyWriters[name] = override
      ? debounce(writer, delay, { maxWait: override.maxWait })
      : debounce(writer, delay);
  }
  lazyWriters[name](value);
}

/**
 * Drop all in-memory persist state for a key: the identity-skip cache and any
 * pending debounced writers. Must be called by every path that removes or
 * clears a persisted key outside the adapter (see lastPersistedValue
 * invariant above). Pending writes are cancelled, not flushed — a delete
 * means the caller wants the data gone, and a timer firing after the delete
 * would resurrect stale state.
 */
export function invalidatePersistCache(name: string): void {
  delete lastPersistedValue[name];
  lazyWriters[name]?.cancel();
  delete lazyWriters[name];
  debouncedWriters[name]?.cancel();
  delete debouncedWriters[name];
}

/**
 * Create a lazy PersistStorage that defers JSON.stringify into the debounce.
 *
 * Unlike createJSONStorage(() => mmkvStorage) which stringifies on EVERY
 * state change, this only stringifies once per debounce window.
 *
 * Usage: storage: createLazyPersistStorage()  (replaces createJSONStorage(() => mmkvStorage))
 */
export function createLazyPersistStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name: string): StorageValue<S> | null => {
      const str = storage.getString(name);
      if (!str) return null;
      // Boot-hydration measurement (SQLite Track A, Phase 1). This is the
      // synchronous JSON.parse that every persisted store pays on the cold
      // start path — 31 keys, largest first. The ranking these counters
      // produce is what decides whether, and in what order, any store is
      // worth moving to rows in a later phase. Measure before moving: a 2 KB
      // settings blob is not worth a migration no matter how tidy it would be.
      const ids = bootHydrateKeyIds(name);
      recordCount(ids.bytes, str.length);
      const parseStart = performance.now();
      try {
        const parsed = JSON.parse(str) as StorageValue<S>;
        recordSample(ids.parseMs, performance.now() - parseStart);
        return parsed;
      } catch {
        recordSample(ids.parseMs, performance.now() - parseStart);
        return null;
      }
    },
    setItem: (name: string, value: StorageValue<S>): void => {
      lazyDebouncedWrite(name, value);
    },
    removeItem: (name: string): void => {
      invalidatePersistCache(name);
      storage.remove(name);
    },
  };
}

// ============================================================================
// ZUSTAND STORAGE ADAPTERS (legacy — used by stores not yet migrated)
// ============================================================================

/**
 * Zustand-compatible storage adapter for general storage.
 * Use with: createJSONStorage(() => mmkvStorage)
 * @deprecated Use createLazyPersistStorage() instead for better performance.
 */
export const mmkvStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: debouncedSetItem,
  removeItem: (name: string): void => {
    // Flush any pending debounced write before removing
    debouncedWriters[name]?.flush();
    delete debouncedWriters[name];
    storage.remove(name);
  },
};

/**
 * Zustand-compatible storage adapter for encrypted storage.
 * Use with: createJSONStorage(() => secureMMKVStorage)
 */
export const secureMMKVStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = secureStorage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    secureStorage.set(name, value);
  },
  removeItem: (name: string): void => {
    secureStorage.remove(name);
  },
};

/**
 * Zustand-compatible storage adapter for sync queue storage.
 * Use with: createJSONStorage(() => syncMMKVStorage)
 */
export const syncMMKVStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = syncStorage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    syncStorage.set(name, value);
  },
  removeItem: (name: string): void => {
    syncStorage.remove(name);
  },
};

// ============================================================================
// DIRECT STORAGE HELPERS - GENERAL STORAGE
// ============================================================================

/**
 * Get a string value from general storage.
 */
export function getString(key: string): string | undefined {
  return storage.getString(key);
}

/**
 * Set a string value in general storage.
 */
export function setString(key: string, value: string): void {
  storage.set(key, value);
}

/**
 * Get a JSON value from general storage.
 */
export function getJSON<T>(key: string): T | null {
  const value = storage.getString(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value in general storage.
 */
export function setJSON<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

/**
 * remove a key from general storage.
 */
export function removeKey(key: string): void {
  invalidatePersistCache(key);
  storage.remove(key);
}

/**
 * Check if a key exists in general storage.
 */
export function hasKey(key: string): boolean {
  return storage.contains(key);
}

/**
 * Get all keys from general storage.
 */
export function getAllKeys(): string[] {
  return storage.getAllKeys();
}

/**
 * Clear all data from general storage.
 */
export function clearStorage(): void {
  // Drop identity caches + pending writers for every tracked key first, so a
  // later identical-ref setItem can't skip the rewrite (empty-disk-on-boot)
  // and a pending debounce timer can't resurrect cleared data.
  for (const key of [
    ...Object.keys(lastPersistedValue),
    ...Object.keys(lazyWriters),
    ...Object.keys(debouncedWriters),
  ]) {
    invalidatePersistCache(key);
  }
  storage.clearAll();
}

// ============================================================================
// DIRECT STORAGE HELPERS - SECURE STORAGE
// ============================================================================

/**
 * Get a string value from secure (encrypted) storage.
 */
export function getSecureString(key: string): string | undefined {
  return secureStorage.getString(key);
}

/**
 * Set a string value in secure (encrypted) storage.
 */
export function setSecureString(key: string, value: string): void {
  secureStorage.set(key, value);
}

/**
 * Get a JSON value from secure (encrypted) storage.
 */
export function getSecureJSON<T>(key: string): T | null {
  const value = secureStorage.getString(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value in secure (encrypted) storage.
 */
export function setSecureJSON<T>(key: string, value: T): void {
  secureStorage.set(key, JSON.stringify(value));
}

/**
 * remove a key from secure storage.
 */
export function removeSecureKey(key: string): void {
  secureStorage.remove(key);
}

/**
 * Check if a key exists in secure storage.
 */
export function hasSecureKey(key: string): boolean {
  return secureStorage.contains(key);
}

// ============================================================================
// DIRECT STORAGE HELPERS - SYNC STORAGE
// ============================================================================

/**
 * Get a string value from sync storage.
 */
export function getSyncString(key: string): string | undefined {
  return syncStorage.getString(key);
}

/**
 * Set a string value in sync storage.
 */
export function setSyncString(key: string, value: string): void {
  syncStorage.set(key, value);
}

/**
 * Get a JSON value from sync storage.
 */
export function getSyncJSON<T>(key: string): T | null {
  const value = syncStorage.getString(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value in sync storage.
 */
export function setSyncJSON<T>(key: string, value: T): void {
  syncStorage.set(key, JSON.stringify(value));
}

/**
 * remove a key from sync storage.
 */
export function removeSyncKey(key: string): void {
  syncStorage.remove(key);
}

/**
 * Check if a key exists in sync storage.
 */
export function hasSyncKey(key: string): boolean {
  return syncStorage.contains(key);
}

/**
 * Get all keys from sync storage.
 */
export function getAllSyncKeys(): string[] {
  return syncStorage.getAllKeys();
}

/**
 * Clear all data from sync storage.
 */
export function clearSyncStorage(): void {
  syncStorage.clearAll();
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Keys that can be cleared during cache reset.
 * Does NOT include device ID or store settings.
 */
export const CLEARABLE_STORAGE_KEYS = [
  "order-store-storage",
  "floor-plan-db-storage",
  "dexa-pos-timeclock",
  "online-order-drawer-storage",
] as const;

export const CLEARABLE_SYNC_KEYS = [
  "offline_operations_queue",
  "order_item_operations_queue",
  "order_items_cache",
  "offline_orders",
  "offline_id_registry",
] as const;

/**
 * Clear transient/operational data while preserving device ID and settings.
 */
export function clearCacheData(): { clearedKeys: string[]; errors: string[] } {
  const clearedKeys: string[] = [];
  const errors: string[] = [];

  // Clear general storage clearable keys
  for (const key of CLEARABLE_STORAGE_KEYS) {
    try {
      // This path bypasses the PersistStorage adapter, so the identity-skip
      // cache and pending writers must be invalidated explicitly (see
      // lastPersistedValue invariant).
      invalidatePersistCache(key);
      if (storage.contains(key)) {
        storage.remove(key);
        clearedKeys.push(key);
      }
    } catch (error) {
      errors.push(`Failed to clear ${key}: ${error}`);
    }
  }

  // Clear sync storage keys
  for (const key of CLEARABLE_SYNC_KEYS) {
    try {
      if (syncStorage.contains(key)) {
        syncStorage.remove(key);
        clearedKeys.push(key);
      }
    } catch (error) {
      errors.push(`Failed to clear ${key}: ${error}`);
    }
  }

  // Evict the Previous Orders + menu offline-fallback snapshots (one per
  // location), plus any legacy `today_orders:*` keys from a prior build. All
  // are best-effort caches, safe to drop on a full cache clear — the menu
  // snapshot is rewritten by the next successful pos_sync.
  try {
    for (const key of syncStorage.getAllKeys()) {
      if (
        key.startsWith("prev_orders_offline:") ||
        key.startsWith("menu_offline:") ||
        key.startsWith("today_orders:")
      ) {
        syncStorage.remove(key);
        clearedKeys.push(key);
      }
    }
  } catch (error) {
    errors.push(`Failed to clear offline fallback caches: ${error}`);
  }

  // The local SQLite DB is operational cache data too, and it carries PII
  // (customer names, phones, emails). Flag it for destruction on next open —
  // the same race-free mechanism the env switch uses — and let the caller
  // trigger the immediate async delete via purgeLocalDbNow() if it can await.
  try {
    syncStorage.set(DB_PURGE_PENDING_KEY, "cache_clear");
    clearedKeys.push(DB_PURGE_PENDING_KEY);
  } catch (error) {
    errors.push(`Failed to flag local DB purge: ${error}`);
  }

  return { clearedKeys, errors };
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Get storage statistics for debugging.
 */
export function getStorageStats(): {
  general: { keyCount: number; keys: string[] };
  secure: { keyCount: number; keys: string[] };
  sync: { keyCount: number; keys: string[] };
} {
  return {
    general: {
      keyCount: storage.getAllKeys().length,
      keys: storage.getAllKeys(),
    },
    secure: {
      keyCount: secureStorage.getAllKeys().length,
      keys: secureStorage.getAllKeys(),
    },
    sync: {
      keyCount: syncStorage.getAllKeys().length,
      keys: syncStorage.getAllKeys(),
    },
  };
}

/**
 * The three storage buckets, addressable by name for monitoring/diagnostics.
 */
const BUCKETS = {
  general: storage,
  secure: secureStorage,
  sync: syncStorage,
} as const;

export type StorageBucketName = keyof typeof BUCKETS;

/**
 * Allocated size of each bucket, in bytes.
 *
 * Reads MMKV's native `size` — an O(1) property read of the memory-mapped
 * file, not a key/value enumeration. This runs on the boot path (the storage
 * monitor in PosSyncProvider), so it must not scale with accumulated
 * operational data.
 *
 * Note this is *allocated* size, not the sum of live values: MMKV grows in
 * pages and does not shrink when keys are deleted (hence `trim()`), so it
 * reads at or above the live total. That is the right number for a growth
 * alarm — unreclaimed space is precisely the failure mode worth alerting on.
 */
export function getStorageSizeStats(): Record<StorageBucketName, number> {
  return {
    general: storage.size,
    secure: secureStorage.size,
    sync: syncStorage.size,
  };
}

/**
 * Number of keys in a single bucket.
 *
 * Enumerates keys but reads no values, so it is far cheaper than a full scan —
 * still O(keys) though, so call it on demand (e.g. to annotate an alarm that
 * has already fired) rather than on the boot path.
 */
export function getBucketKeyCount(name: StorageBucketName): number {
  return BUCKETS[name].getAllKeys().length;
}
