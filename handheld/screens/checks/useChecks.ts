import type { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
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

const EMPTY: Checks = { open: [], closed: [], needsYou: 0 };
let cachedMap: Record<string, OrderProfile> | null = null;
let cached: Checks = EMPTY;

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Screen S1's lists and the tab badge, from ONE pass over the order map per
 * map change. The store notifies on every `set` (sync counters, the active
 * order…), so the pass is skipped unless `ordersById` itself changed; and
 * when it did but the lists and badge came out the same — most broadcasts
 * update an order already listed — the previous object is returned, so the
 * Checks tab and the shell do not re-render. Rows subscribe to their own
 * profile for the per-order detail.
 */
export function checksIndex(ordersById: Record<string, OrderProfile>): Checks {
  if (ordersById === cachedMap) return cached;
  cachedMap = ordersById;

  const all = Object.values(ordersById);
  const openOrders = all.filter(isOpenCheck).sort((a, b) => openedAtMs(b) - openedAtMs(a));
  const open = openOrders.map((o) => o.id);
  const closed = all
    .filter(isClosedCheck)
    .sort((a, b) => closedAtMs(b) - closedAtMs(a))
    .map((o) => o.id);
  const needsYou = openOrders.filter(checkNeedsYou).length;

  if (needsYou !== cached.needsYou || !sameIds(open, cached.open) || !sameIds(closed, cached.closed)) {
    cached = { open, closed, needsYou };
  }
  return cached;
}

/** Screen S1's data from the shared order store; re-renders only when a list or the badge changes. */
export function useChecks(): Checks {
  return useOrderStore((s) => checksIndex(s.ordersById));
}
