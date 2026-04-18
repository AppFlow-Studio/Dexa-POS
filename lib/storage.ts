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
import { createMMKV } from "react-native-mmkv";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { StateStorage } from "zustand/middleware";

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
  encryptionKey: "dexa-pos-secure-key-v1", // In production, derive from device-specific key
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
// ZUSTAND STORAGE ADAPTERS
// ============================================================================

/**
 * Debounced write to prevent redundant MMKV serialization during rapid mutations.
 * Uses per-key debouncing so different stores don't interfere.
 */
const debouncedWriters: Record<string, ReturnType<typeof debounce>> = {};

const ORDER_STORE_KEY = "order-store-storage";

function debouncedSetItem(name: string, value: string): void {
  // Use longer debounce for the order store (large payload)
  const delay = name === ORDER_STORE_KEY ? 1500 : 300;
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
  for (const key of Object.keys(debouncedWriters)) {
    debouncedWriters[key]?.flush();
  }
  // Flush lazy writers synchronously — the app may be about to suspend.
  isFlushing = true;
  for (const key of Object.keys(lazyWriters)) {
    lazyWriters[key]?.flush();
  }
  isFlushing = false;
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

/** When true, lazy writers skip setImmediate and write synchronously. */
let isFlushing = false;

function lazyDebouncedWrite(name: string, value: unknown): void {
  const delay = name === ORDER_STORE_KEY ? 1500 : 300;
  if (!lazyWriters[name]) {
    lazyWriters[name] = debounce((v: unknown) => {
      const str = JSON.stringify(v);
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
    }, delay);
  }
  lazyWriters[name](value);
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
      try {
        return JSON.parse(str) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: StorageValue<S>): void => {
      lazyDebouncedWrite(name, value);
    },
    removeItem: (name: string): void => {
      lazyWriters[name]?.flush();
      delete lazyWriters[name];
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
] as const;

export const CLEARABLE_SYNC_KEYS = [
  "offline_operations_queue",
  "order_item_operations_queue",
  "order_items_cache",
  "offline_orders",
  "offline_id_registry",
  // today_orders:* keys are cleared per-location via todayOrdersCache.clearLocation()
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
