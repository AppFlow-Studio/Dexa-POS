import { useOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useMemo } from "react";
import { MAX_WAYS, MIN_WAYS, openLines, type OpenLine } from "../../lib/split";

export interface SplitData {
  /** Card balance due — what the even split divides. */
  due: number;
  /** Unpaid lines, for by seat and by item. */
  lines: OpenLine[];
  taxRatesMap: Record<string, number>;
  /** Where the even split starts: the party size, clamped to the stepper's range. */
  defaultWays: number;
}

/** Everything the three split tabs read, from one order subscription. */
export function useSplitData(orderId: string): SplitData {
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const totals = useOrderTotals(orderId);
  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);
  const lines = useMemo(() => openLines(order), [order]);
  const guests = order?.guest_count ?? 0;
  return {
    due: totals?.amountDue ?? order?.amount_due ?? 0,
    lines,
    taxRatesMap,
    defaultWays: Math.min(MAX_WAYS, Math.max(MIN_WAYS, guests)),
  };
}
