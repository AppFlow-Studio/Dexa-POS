import { useOrderStore } from "@/stores/useOrderStore";
import { useMemo } from "react";
import {
  checkNeedsYou,
  closedAtMs,
  isClosedCheck,
  isOpenCheck,
  openedAtMs,
} from "../../lib/checks";

export type ChecksScope = "open" | "closed";

export interface Checks {
  open: string[];
  closed: string[];
  /** Open checks the kitchen is waiting on — the Checks tab badge. */
  needsYou: number;
}

/**
 * Screen S1's data from the shared order store: open checks newest first,
 * and whatever closed checks the store still holds from this shift. The one
 * broad subscription on the handheld; rows subscribe to their own profile.
 */
export function useChecks(): Checks {
  const ordersById = useOrderStore((s) => s.ordersById);
  return useMemo(() => {
    const all = Object.values(ordersById);
    const open = all.filter(isOpenCheck).sort((a, b) => openedAtMs(b) - openedAtMs(a));
    const closed = all.filter(isClosedCheck).sort((a, b) => closedAtMs(b) - closedAtMs(a));
    return {
      open: open.map((o) => o.id),
      closed: closed.map((o) => o.id),
      needsYou: open.filter(checkNeedsYou).length,
    };
  }, [ordersById]);
}
