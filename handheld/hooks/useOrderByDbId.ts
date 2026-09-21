import type { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";

/**
 * The local order profile for a backend order id (what a table session
 * carries as `order_id`), via the store's reverse index. Narrow selector:
 * re-renders only when that one profile changes.
 */
export function useOrderByDbId(
  dbOrderId: string | null | undefined,
): OrderProfile | null {
  return useOrderStore((s) => {
    if (!dbOrderId) return null;
    const localId = s.dbOrderIdIndex[dbOrderId];
    return localId ? (s.ordersById[localId] ?? null) : null;
  });
}
