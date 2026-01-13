/**
 * Order ID Helpers for Station-Based Order Management
 *
 * Phase 5: Simplified helpers for order ID identification.
 * - Local orders: Created on this device (order_xxx or local_order_xxx)
 * - Backend orders: UUIDs from the database
 */

// Legacy prefixes from offlineIdRegistry (used by useOrderStore)
const LEGACY_ORDER_PREFIX = "order_";
const LOCAL_ORDER_PREFIX = "local_order_";

// UUID regex for detecting backend IDs (Supabase uses standard UUIDs)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Check if an order ID is a valid UUID (backend ID format).
 * Supabase uses standard UUIDs for all entity IDs.
 *
 * @param id - The ID to check
 * @returns true if this is a valid UUID, false otherwise
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}
