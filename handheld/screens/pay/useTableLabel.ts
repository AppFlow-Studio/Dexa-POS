import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { tableIdOf } from "../../lib/sendCourse";
import { tableTitle } from "../../lib/tableName";

/**
 * "Table 12" for a check that sits on a table, else null — a takeout check
 * has nothing to close, so the done screen's button becomes a plain "Done".
 */
export function useTableLabel(orderId: string): string | null {
  const tableId = useOrderStore((s) => {
    const order = s.ordersById[orderId];
    return order ? tableIdOf(order) : null;
  });
  return useFloorPlanStore((s) => {
    if (!tableId) return null;
    const name = s.tables.find((t) => t.id === tableId)?.name;
    return name ? tableTitle(name, []) : null;
  });
}
