/**
 * useTableOrder - Clean hook for table→order lookup
 *
 * Phase 9: Table Integration Hook
 *
 * Provides a clean interface for components to get table and associated order data
 * without directly coupling to store implementation details.
 */

import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { FloorPlanObject, TableSession } from "@/types/db-floor-plan-types";
import { OrderProfile } from "@/lib/types";

export interface UseTableOrderResult {
  /** The table object (null if not found) */
  table: FloorPlanObject | null;
  /** The active session on the table (null if no session) */
  session: TableSession | null;
  /** The order associated with the session (null if no order) */
  order: OrderProfile | null;
  /** Whether the table has an active order */
  hasOrder: boolean;
  /** Whether the table has an active session */
  hasSession: boolean;
  /** The order ID from the session (for direct DB lookups if needed) */
  orderId: string | null;
}

/**
 * Hook to get table and associated order data
 *
 * @param tableId - The table ID to look up
 * @returns Table, session, and order data
 *
 * @example
 * ```tsx
 * const { table, order, hasOrder } = useTableOrder(tableId);
 *
 * if (hasOrder) {
 *   console.log(`Table ${table.name} has order #${order.display_number}`);
 * }
 * ```
 */
export function useTableOrder(tableId: string | null | undefined): UseTableOrderResult {
  // Get table from floor plan store (O(1) lookup)
  const table = useFloorPlanStore((state) =>
    tableId ? state.tablesById[tableId] ?? null : null
  );

  // Extract session and order_id from table
  const session = table?.session ?? null;
  const sessionOrderId = session?.order_id ?? null;

  // Get order from order store (O(1) lookup via dbOrderIdIndex)
  const order = useOrderStore((state) => {
    if (!sessionOrderId) return null
    const localKey = state.dbOrderIdIndex[sessionOrderId] ?? sessionOrderId
    return state.ordersById[localKey] ?? null
  });

  return {
    table,
    session,
    order,
    hasOrder: !!order,
    hasSession: !!session,
    orderId: sessionOrderId,
  };
}

export default useTableOrder;
