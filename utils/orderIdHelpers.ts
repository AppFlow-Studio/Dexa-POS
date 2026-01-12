/**
 * Order ID Helpers for Station-Based Order Management
 *
 * Phase 1 Foundation: Provides utilities for identifying order ownership:
 * - Local orders: Created on this device (order_xxx or local_order_xxx)
 * - Remote orders: Received from other stations (remote_xxx)
 * - Adopted orders: Taken over from other stations (adopted_xxx)
 */

// Prefixes for different order types
export const REMOTE_ORDER_PREFIX = "remote_";
export const ADOPTED_ORDER_PREFIX = "adopted_";

// Legacy prefixes from offlineIdRegistry (used by useOrderStore)
const LEGACY_ORDER_PREFIX = "order_";
const LOCAL_ORDER_PREFIX = "local_order_";

// UUID regex for detecting backend IDs (Supabase uses standard UUIDs)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a remote order ID from a database UUID.
 * Used when receiving order broadcasts from other stations.
 *
 * @param dbId - The database UUID of the order
 * @returns A prefixed remote order ID (e.g., "remote_abc-123-xyz")
 */
export function generateRemoteOrderId(dbId: string): string {
  return `${REMOTE_ORDER_PREFIX}${dbId}`;
}

/**
 * Generate an adopted order ID from a database UUID.
 * Used when taking over an order from another station.
 *
 * @param dbId - The database UUID of the order
 * @returns A prefixed adopted order ID (e.g., "adopted_abc-123-xyz")
 */
export function generateAdoptedOrderId(dbId: string): string {
  return `${ADOPTED_ORDER_PREFIX}${dbId}`;
}

/**
 * Check if an order ID represents a local order.
 * Local orders are created on this device (not yet or already synced).
 *
 * Detection strategy:
 * 1. If it's a valid UUID, it's a backend ID (return false)
 * 2. If it starts with known local prefixes, it's a local ID (return true)
 *
 * @param orderId - The order ID to check
 * @returns true if this is a local order, false otherwise
 */
export function isLocalOrder(orderId: string): boolean {
  // If it's a UUID, it's a backend ID (not local)
  if (UUID_REGEX.test(orderId)) {
    return false;
  }
  // Check for local prefixes
  return (
    orderId.startsWith(LEGACY_ORDER_PREFIX) ||
    orderId.startsWith(LOCAL_ORDER_PREFIX)
  );
}

/**
 * Check if an order ID represents a remote order.
 * Remote orders are received from other stations via broadcast.
 *
 * @param orderId - The order ID to check
 * @returns true if this is a remote order, false otherwise
 */
export function isRemoteOrder(orderId: string): boolean {
  return orderId.startsWith(REMOTE_ORDER_PREFIX);
}

/**
 * Check if an order ID represents an adopted order.
 * Adopted orders were taken over from another station.
 *
 * @param orderId - The order ID to check
 * @returns true if this is an adopted order, false otherwise
 */
export function isAdoptedOrder(orderId: string): boolean {
  return orderId.startsWith(ADOPTED_ORDER_PREFIX);
}

/**
 * Extract the database ID from a remote or adopted order ID.
 *
 * @param orderId - The remote or adopted order ID
 * @returns The database UUID, or null if not a valid remote/adopted ID
 *
 * @example
 * extractDbIdFromRemoteId("remote_abc-123-xyz") // returns "abc-123-xyz"
 * extractDbIdFromRemoteId("adopted_def-456-uvw") // returns "def-456-uvw"
 * extractDbIdFromRemoteId("order_12345") // returns null
 */
export function extractDbIdFromRemoteId(orderId: string): string | null {
  if (orderId.startsWith(REMOTE_ORDER_PREFIX)) {
    return orderId.slice(REMOTE_ORDER_PREFIX.length);
  }
  if (orderId.startsWith(ADOPTED_ORDER_PREFIX)) {
    return orderId.slice(ADOPTED_ORDER_PREFIX.length);
  }
  return null;
}

/**
 * Check if an order ID is a valid UUID (backend ID format).
 * Supabase uses standard UUIDs for all entity IDs.
 *
 * @param id - The ID to check
 * @returns true if this is a valid UUID, false otherwise
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}
