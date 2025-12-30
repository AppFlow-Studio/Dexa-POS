/**
 * Offline ID Registry
 *
 * Manages mapping between local UUIDs and backend UUIDs for offline-first operations.
 * Persists mappings to AsyncStorage for crash recovery.
 *
 * Key concepts:
 * - Local IDs: Generated client-side UUIDs (format: `local_order_xxx` or `local_item_xxx`)
 * - Backend IDs: UUIDs returned from Supabase after successful sync
 * - Pending: Local IDs that haven't been synced yet
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = "order" | "item" | "payment" | "session";

export interface IdMapping {
  localId: string;
  backendId: string | null;
  entityType: EntityType;
  parentLocalId?: string; // For items, this is the order's local ID
  createdAt: string;
  syncedAt?: string;
}

interface IdRegistryState {
  mappings: Record<string, IdMapping>; // keyed by localId
  backendToLocal: Record<string, string>; // reverse lookup: backendId -> localId
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = "offline_id_registry";
const LOCAL_ORDER_PREFIX = "local_order_";
const LOCAL_ITEM_PREFIX = "local_item_";
const LOCAL_PAYMENT_PREFIX = "local_payment_";
const LOCAL_SESSION_PREFIX = "local_session_";

// Legacy prefixes used by useOrderStore - need to recognize these as local IDs
const LEGACY_ORDER_PREFIX = "order_";
const LEGACY_ITEM_PREFIX = "item_";

// UUID regex for detecting backend IDs (Supabase uses standard UUIDs)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// STATE
// ============================================================================

let state: IdRegistryState = {
  mappings: {},
  backendToLocal: {},
};

let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the ID registry from AsyncStorage.
 * Call this at app startup.
 */
export async function initIdRegistry(): Promise<void> {
  if (initialized) return;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      state = JSON.parse(stored);
      console.log(
        `[IdRegistry] Loaded ${Object.keys(state.mappings).length} mappings`
      );
    }
    initialized = true;
  } catch (error) {
    console.error("[IdRegistry] Failed to load from storage:", error);
    state = { mappings: {}, backendToLocal: {} };
    initialized = true;
  }
}

/**
 * Persist current state to AsyncStorage.
 */
async function persistState(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("[IdRegistry] Failed to persist state:", error);
  }
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique local ID for an entity.
 */
export function generateLocalId(entityType: EntityType): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);

  switch (entityType) {
    case "order":
      return `${LOCAL_ORDER_PREFIX}${timestamp}_${random}`;
    case "item":
      return `${LOCAL_ITEM_PREFIX}${timestamp}_${random}`;
    case "payment":
      return `${LOCAL_PAYMENT_PREFIX}${timestamp}_${random}`;
    case "session":
      return `${LOCAL_SESSION_PREFIX}${timestamp}_${random}`;
  }
}

/**
 * Check if an ID is a local ID (not yet synced to backend).
 * 
 * Detection strategy:
 * 1. If it's a valid UUID, it's a backend ID (return false)
 * 2. If it starts with known local prefixes, it's a local ID (return true)
 * 3. If it starts with legacy prefixes (order_, item_), it's a local ID (return true)
 * 
 * This handles both new format (local_order_xxx) and legacy format (order_xxx).
 */
export function isLocalId(id: string): boolean {
  // First check: If it's a valid UUID, it's definitely a backend ID
  if (UUID_REGEX.test(id)) {
    return false;
  }

  // Check for standard local prefixes
  if (
    id.startsWith(LOCAL_ORDER_PREFIX) ||
    id.startsWith(LOCAL_ITEM_PREFIX) ||
    id.startsWith(LOCAL_PAYMENT_PREFIX) ||
    id.startsWith(LOCAL_SESSION_PREFIX)
  ) {
    return true;
  }

  // Check for legacy prefixes used by useOrderStore
  // These are IDs like "order_1767113883512" or "item_abc123"
  if (
    id.startsWith(LEGACY_ORDER_PREFIX) ||
    id.startsWith(LEGACY_ITEM_PREFIX)
  ) {
    return true;
  }

  // If none of the above, assume it's NOT a local ID
  // (could be some other backend format)
  return false;
}

/**
 * Check if an ID is a valid UUID (backend ID format).
 * Supabase uses standard UUIDs for all entity IDs.
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Get the entity type from a local ID.
 */
export function getEntityTypeFromLocalId(localId: string): EntityType | null {
  if (localId.startsWith(LOCAL_ORDER_PREFIX)) return "order";
  if (localId.startsWith(LOCAL_ITEM_PREFIX)) return "item";
  if (localId.startsWith(LOCAL_PAYMENT_PREFIX)) return "payment";
  if (localId.startsWith(LOCAL_SESSION_PREFIX)) return "session";
  return null;
}

// ============================================================================
// REGISTRATION & MAPPING
// ============================================================================

/**
 * Register a new local ID (before sync).
 */
export async function registerLocalId(
  localId: string,
  entityType: EntityType,
  parentLocalId?: string
): Promise<void> {
  const mapping: IdMapping = {
    localId,
    backendId: null,
    entityType,
    parentLocalId,
    createdAt: new Date().toISOString(),
  };

  state.mappings[localId] = mapping;
  await persistState();

  console.log(`[IdRegistry] Registered local ID: ${localId} (${entityType})`);
}

/**
 * Map a local ID to a backend ID after successful sync.
 */
export async function mapLocalToBackend(
  localId: string,
  backendId: string
): Promise<void> {
  const mapping = state.mappings[localId];

  if (mapping) {
    mapping.backendId = backendId;
    mapping.syncedAt = new Date().toISOString();
    state.backendToLocal[backendId] = localId;
    await persistState();

    console.log(`[IdRegistry] Mapped ${localId} -> ${backendId}`);
  } else {
    // Create mapping even if not pre-registered
    const entityType = getEntityTypeFromLocalId(localId) || "order";
    state.mappings[localId] = {
      localId,
      backendId,
      entityType,
      createdAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    };
    state.backendToLocal[backendId] = localId;
    await persistState();

    console.log(`[IdRegistry] Created mapping ${localId} -> ${backendId}`);
  }
}

// ============================================================================
// ID RESOLUTION
// ============================================================================

/**
 * Resolve a local ID to its backend ID.
 * Returns the backend ID if mapped, otherwise returns the original ID.
 */
export function resolveToBackendId(localId: string): string | null {
  const mapping = state.mappings[localId];
  return mapping?.backendId || null;
}

/**
 * Resolve a backend ID to its local ID.
 */
export function resolveToLocalId(backendId: string): string | null {
  return state.backendToLocal[backendId] || null;
}

/**
 * Resolve an ID to backend ID, returning the original if not a local ID
 * or if already a backend ID.
 */
export function resolveId(id: string): string {
  if (!isLocalId(id)) {
    return id; // Already a backend ID
  }

  const backendId = resolveToBackendId(id);
  return backendId || id; // Return original if not yet mapped
}

/**
 * Check if a local ID has been synced (has a backend ID).
 */
export function isSynced(localId: string): boolean {
  const mapping = state.mappings[localId];
  return mapping?.backendId !== null && mapping?.backendId !== undefined;
}

/**
 * Get all pending (unsynced) IDs of a given type.
 */
export function getPendingIds(entityType: EntityType): string[] {
  return Object.values(state.mappings)
    .filter((m) => m.entityType === entityType && !m.backendId)
    .map((m) => m.localId);
}

/**
 * Get the mapping for a local ID.
 */
export function getMapping(localId: string): IdMapping | null {
  return state.mappings[localId] || null;
}

/**
 * Get all mappings for items belonging to an order.
 */
export function getItemMappingsForOrder(orderLocalId: string): IdMapping[] {
  return Object.values(state.mappings).filter(
    (m) => m.entityType === "item" && m.parentLocalId === orderLocalId
  );
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Remove a mapping (e.g., when order is archived).
 */
export async function removeMapping(localId: string): Promise<void> {
  const mapping = state.mappings[localId];

  if (mapping) {
    if (mapping.backendId) {
      delete state.backendToLocal[mapping.backendId];
    }
    delete state.mappings[localId];
    await persistState();

    console.log(`[IdRegistry] Removed mapping: ${localId}`);
  }
}

/**
 * Remove all mappings for an order and its items.
 */
export async function removeOrderMappings(orderLocalId: string): Promise<void> {
  // Remove item mappings first
  const itemMappings = getItemMappingsForOrder(orderLocalId);
  for (const itemMapping of itemMappings) {
    if (itemMapping.backendId) {
      delete state.backendToLocal[itemMapping.backendId];
    }
    delete state.mappings[itemMapping.localId];
  }

  // Remove order mapping
  const orderMapping = state.mappings[orderLocalId];
  if (orderMapping?.backendId) {
    delete state.backendToLocal[orderMapping.backendId];
  }
  delete state.mappings[orderLocalId];

  await persistState();
  console.log(
    `[IdRegistry] Removed order and ${itemMappings.length} item mappings for: ${orderLocalId}`
  );
}

/**
 * Clean up old synced mappings (older than specified days).
 * Call periodically to prevent unbounded growth.
 */
export async function cleanupOldMappings(daysOld: number = 7): Promise<number> {
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (const [localId, mapping] of Object.entries(state.mappings)) {
    // Only remove if synced and old enough
    if (mapping.syncedAt) {
      const syncedTime = new Date(mapping.syncedAt).getTime();
      if (syncedTime < cutoff) {
        if (mapping.backendId) {
          delete state.backendToLocal[mapping.backendId];
        }
        delete state.mappings[localId];
        removedCount++;
      }
    }
  }

  if (removedCount > 0) {
    await persistState();
    console.log(`[IdRegistry] Cleaned up ${removedCount} old mappings`);
  }

  return removedCount;
}

/**
 * Clear all mappings (for testing or reset).
 */
export async function clearAllMappings(): Promise<void> {
  state = { mappings: {}, backendToLocal: {} };
  await persistState();
  console.log("[IdRegistry] Cleared all mappings");
}

// ============================================================================
// DEBUG & STATS
// ============================================================================

/**
 * Get statistics about current mappings.
 */
export function getStats(): {
  total: number;
  synced: number;
  pending: number;
  byType: Record<EntityType, { synced: number; pending: number }>;
} {
  const mappings = Object.values(state.mappings);

  const stats = {
    total: mappings.length,
    synced: mappings.filter((m) => m.backendId).length,
    pending: mappings.filter((m) => !m.backendId).length,
    byType: {
      order: { synced: 0, pending: 0 },
      item: { synced: 0, pending: 0 },
      payment: { synced: 0, pending: 0 },
      session: { synced: 0, pending: 0 },
    },
  };

  for (const mapping of mappings) {
    if (mapping.backendId) {
      stats.byType[mapping.entityType].synced++;
    } else {
      stats.byType[mapping.entityType].pending++;
    }
  }

  return stats;
}

/**
 * Export all mappings for debugging.
 */
export function exportMappings(): IdMapping[] {
  return Object.values(state.mappings);
}


