/**
 * Order Classification Helpers for Station-Based Order Management
 *
 * Phase 1 Foundation: Determines order ownership and modification permissions
 * based on station context and order metadata.
 */

import type { OrderProfile } from "@/lib/types";
import type { StationCapabilities } from "@/types/station";

/**
 * Order ownership classification relative to the current station.
 *
 * - 'own': Order was created by this station
 * - 'remote': Order was created by another station (view only)
 * - 'adopted': Order was taken over from another station
 * - 'transferred': Order was transferred away from this station
 */
export type OrderOwnership = "own" | "remote" | "adopted" | "transferred";

/**
 * Classify who owns/controls an order relative to the current station.
 *
 * Priority order for classification:
 * 1. Check explicit flags (_isAdopted, _isTransferred, _isRemoteOrder)
 * 2. Fall back to station_id comparison
 * 3. Default to 'own' for legacy orders without station context
 *
 * @param order - The order to classify
 * @param currentStationId - The ID of the current station (or null if no station context)
 * @returns The ownership classification
 */
export function classifyOrderOwnership(
  order: OrderProfile,
  currentStationId: string | null
): OrderOwnership {
  // Check explicit flags first (set during order operations)
  if (order._isAdopted) return "adopted";
  if (order._isTransferred) return "transferred";
  if (order._isRemoteOrder) return "remote";

  // Fall back to station_id comparison
  if (!currentStationId) return "own"; // No station context = assume own
  if (!order.station_id) return "own"; // Legacy order without station = assume own

  return order.station_id === currentStationId ? "own" : "remote";
}

/**
 * Determine if the current station can modify an order.
 *
 * Rules:
 * - Orders with explicit _canModify flag: use that value
 * - Transferred orders: cannot modify
 * - Remote orders: cannot modify (view only)
 * - Own and adopted orders: can modify (subject to capability checks)
 *
 * @param order - The order to check
 * @param currentStationId - The ID of the current station (or null if no station context)
 * @param capabilities - Optional station capabilities for fine-grained permission checks
 * @returns true if the order can be modified, false otherwise
 */
export function canModifyOrder(
  order: OrderProfile,
  currentStationId: string | null,
  capabilities?: StationCapabilities
): boolean {
  // If order has explicit _canModify flag, use it
  if (order._canModify !== undefined) {
    return order._canModify;
  }

  const ownership = classifyOrderOwnership(order, currentStationId);

  // Transferred orders cannot be modified
  if (ownership === "transferred") return false;

  // Remote orders cannot be modified (view only)
  if (ownership === "remote") return false;

  // Own and adopted orders can be modified (if capabilities allow)
  // Future: Add capability checks here (e.g., can_create_orders, can_void_orders)
  return true;
}

/**
 * Check if an order is from this station (own or adopted).
 * Useful for filtering orders that this station can act on.
 *
 * @param order - The order to check
 * @param currentStationId - The ID of the current station
 * @returns true if this station owns or has adopted the order
 */
export function isOwnedByStation(
  order: OrderProfile,
  currentStationId: string | null
): boolean {
  const ownership = classifyOrderOwnership(order, currentStationId);
  return ownership === "own" || ownership === "adopted";
}

/**
 * Check if an order is from another station (remote or transferred).
 * Useful for filtering orders from other stations.
 *
 * @param order - The order to check
 * @param currentStationId - The ID of the current station
 * @returns true if this order is from another station
 */
export function isFromOtherStation(
  order: OrderProfile,
  currentStationId: string | null
): boolean {
  const ownership = classifyOrderOwnership(order, currentStationId);
  return ownership === "remote" || ownership === "transferred";
}

/**
 * Get display text for the order's source station.
 * Useful for showing where an order came from in the UI.
 *
 * @param order - The order to get source info for
 * @param currentStationId - The ID of the current station
 * @returns Display text like "Station 1" or "This Station" or null if unknown
 */
export function getOrderSourceDisplay(
  order: OrderProfile,
  currentStationId: string | null
): string | null {
  if (order._sourceStationName) {
    // Check if it's this station
    if (order._sourceStationId === currentStationId) {
      return "This Station";
    }
    return order._sourceStationName;
  }

  // Fall back to station_id comparison
  if (order.station_id === currentStationId) {
    return "This Station";
  }

  return null; // Unknown source (legacy order)
}
