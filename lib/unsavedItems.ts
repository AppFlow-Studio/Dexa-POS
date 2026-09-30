import type { CartItem, OrderProfile } from "@/lib/types";

/**
 * Local-first safety net: cart lines whose LOCAL save never happened.
 *
 * A line is written to SQLite (row + outbox op, one transaction) right after
 * it is added; the commit binds `item_row_id`, and the drain later sets
 * `db_order_item_id`. A line with neither was never written — typically the
 * write failed with "database is locked". The server has never heard of it, no
 * kitchen send can route it, and the order it sits on can look empty to every
 * other screen. It exists only in this tablet's memory until it is saved again.
 */
export function isUnsavedLine(item: CartItem): boolean {
  return (
    !item.isDraft &&
    !item.is_voided &&
    !item.item_row_id &&
    !item.db_order_item_id
  );
}

const FINAL_ORDER_STATUSES = new Set(["completed", "void", "voided", "cancelled"]);

/** The startup sweep only repairs orders opened within this window. */
export const STARTUP_REPAIR_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Lines on `order` that should be saved again.
 *
 * During a session only lines this session SAW fail (`isFailed`) qualify: a
 * line without a row id may simply not have been written YET, and saving it
 * twice would put two rows on the server. At startup nothing can be in flight,
 * so every unsaved line on a recent open order qualifies — that is how lines
 * whose failure happened before a restart (status is in memory only) come back.
 */
export function selectUnsavedLineIds(
  order: Pick<OrderProfile, "items" | "order_status" | "opened_at">,
  {
    startup,
    now,
    onlyIds,
    isFailed,
    isInFlight,
  }: {
    startup: boolean;
    now: number;
    onlyIds?: ReadonlySet<string> | null;
    isFailed: (lineId: string) => boolean;
    isInFlight: (lineId: string) => boolean;
  },
): string[] {
  if (FINAL_ORDER_STATUSES.has(order.order_status ?? "")) return [];
  if (startup) {
    const openedAt = order.opened_at ? new Date(order.opened_at).getTime() : NaN;
    if (!Number.isFinite(openedAt) || now - openedAt > STARTUP_REPAIR_WINDOW_MS) {
      return [];
    }
  }
  const ids: string[] = [];
  for (const item of order.items ?? []) {
    if (onlyIds && !onlyIds.has(item.id)) continue;
    if (!isUnsavedLine(item) || isInFlight(item.id)) continue;
    if (!startup && !isFailed(item.id)) continue;
    ids.push(item.id);
  }
  return ids;
}

/**
 * Does this order carry lines the server doesn't have yet? Previous Orders is
 * server-fetched while online, so such an order must be surfaced from the
 * device or it vanishes from the list.
 */
export function hasLinesNotOnServer(order: Pick<OrderProfile, "items">): boolean {
  return (order.items ?? []).some(
    (item) => !item.isDraft && !item.is_voided && !item.db_order_item_id,
  );
}
