import { useOrderStore } from "@/stores/useOrderStore";
import { useMemo } from "react";
import { isOpenCheck, openedAtMs } from "../../lib/checks";

export interface MergeCandidates {
  /** Other open checks on the same table — the usual merge. */
  sameTable: string[];
  /** Every other open check, newest first. */
  others: string[];
}

/**
 * The checks that could fold into `orderId`: open, not this one, the same
 * table first. Whether a given merge is allowed (ownership, payments already
 * taken) is decided when merging is wired, not here.
 */
export function useMergeCandidates(orderId: string): MergeCandidates {
  const ordersById = useOrderStore((s) => s.ordersById);
  return useMemo(() => {
    const target = ordersById[orderId];
    const table = target?.service_location_id ?? null;
    const open = Object.values(ordersById)
      .filter((o) => o.id !== orderId && isOpenCheck(o))
      .sort((a, b) => openedAtMs(b) - openedAtMs(a));
    const sameTable: string[] = [];
    const others: string[] = [];
    for (const o of open) {
      if (table && o.service_location_id === table) sameTable.push(o.id);
      else others.push(o.id);
    }
    return { sameTable, others };
  }, [ordersById, orderId]);
}
