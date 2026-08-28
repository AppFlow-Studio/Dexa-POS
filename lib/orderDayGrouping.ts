import { OrderProfile } from "@/lib/types";
import { format, isToday, isYesterday, startOfDay } from "date-fns";

/**
 * Day-separated grouping for the Previous Orders list (both the full screen and
 * the order-processing section). Orders arrive server-sorted (default: newest
 * first), so groups are CONSECUTIVE same-day runs — a day header is inserted
 * whenever the day changes between two rows. We never re-arrange rows into day
 * buckets because that would fight the user's chosen sort (e.g. amount); we
 * only delimit runs.
 */

export interface DayGroup {
  /** Start-of-day epoch ms for this group — stable React key. */
  dayStart: number;
  /** "Today", "Yesterday", or "EEEE, MMMM d[, yyyy]". */
  title: string;
  orders: OrderProfile[];
}

export function dayKeyOf(ts: number | string | Date): number {
  return startOfDay(new Date(ts)).getTime();
}

export function getDayLabel(ts: number | string | Date): string {
  const date = new Date(ts);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? "EEEE, MMMM d" : "EEEE, MMMM d, yyyy");
}

/** Orders without an `opened_at` are treated as "now" so live/offline orders
 *  land under today's header. */
export function groupOrdersByDay(orders: OrderProfile[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const order of orders) {
    const ts = order.opened_at ?? Date.now();
    const key = dayKeyOf(ts);
    const last = groups[groups.length - 1];
    if (last && last.dayStart === key) {
      last.orders.push(order);
    } else {
      groups.push({ dayStart: key, title: getDayLabel(ts), orders: [order] });
    }
  }
  return groups;
}
