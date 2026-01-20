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

  // Get order from order store (O(1) lookup)
  const order = useOrderStore((state) =>
    sessionOrderId ? state.ordersById[sessionOrderId] ?? null : null
  );

  return {
    table,
    session,
    order,
    hasOrder: !!order,
    hasSession: !!session,
    orderId: sessionOrderId,
  };
}

/**
 * Hook to get multiple tables and their orders
 *
 * @param tableIds - Array of table IDs to look up
 * @returns Array of table/order data
 */
export function useTablesOrders(tableIds: string[]): UseTableOrderResult[] {
  // Get tables from floor plan store
  const tablesById = useFloorPlanStore((state) => state.tablesById);

  // Get orders from order store
  const ordersById = useOrderStore((state) => state.ordersById);

  return tableIds.map((tableId) => {
    const table = tablesById[tableId] ?? null;
    const session = table?.session ?? null;
    const sessionOrderId = session?.order_id ?? null;
    const order = sessionOrderId ? ordersById[sessionOrderId] ?? null : null;

    return {
      table,
      session,
      order,
      hasOrder: !!order,
      hasSession: !!session,
      orderId: sessionOrderId,
    };
  });
}

/**
 * Hook to find a table by its order ID
 *
 * @param orderId - The order ID to find the table for
 * @returns Table data if found, or null values if not
 */
export function useTableByOrderId(orderId: string | null | undefined): UseTableOrderResult {
  // Get all tables and find the one with matching order_id in session
  const tables = useFloorPlanStore((state) => state.tables);
  const ordersById = useOrderStore((state) => state.ordersById);

  const table = orderId
    ? tables.find((t) => t.session?.order_id === orderId) ?? null
    : null;

  const session = table?.session ?? null;
  const order = orderId ? ordersById[orderId] ?? null : null;

  return {
    table,
    session,
    order,
    hasOrder: !!order,
    hasSession: !!session,
    orderId: orderId ?? null,
  };
}

export default useTableOrder;
