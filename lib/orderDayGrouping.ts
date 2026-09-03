import {
    getBusinessDayBounds,
    getBusinessDayForTimestamp,
    getCurrentBusinessDay,
    type BusinessDayConfig,
} from "@/lib/businessDay";
import { OrderProfile } from "@/lib/types";
import { format, isToday, isYesterday, startOfDay } from "date-fns";
import { DateTime } from "luxon";

/**
 * Day-separated grouping for the Previous Orders list (both the full screen and
 * the order-processing section). Orders arrive server-sorted (default: newest
 * first), so groups are CONSECUTIVE same-day runs — a day header is inserted
 * whenever the day changes between two rows. We never re-arrange rows into day
 * buckets because that would fight the user's chosen sort (e.g. amount); we
 * only delimit runs.
 *
 * "Day" means BUSINESS day whenever a BusinessDayConfig is supplied — the same
 * merchant-timezone + rollover-hour semantics the date-window filter uses
 * (get_business_day_bounds / getBusinessDayForTimestamp). That keeps the
 * "Today" / "Yesterday" headers in lockstep with what the date pill fetched:
 * an order placed after midnight but before the rollover hour belongs to
 * yesterday's business day and must sit under "Yesterday", not "Today".
 * Without a config (cold start before a store is selected, tests) the helpers
 * fall back to device-local calendar days.
 */

export interface DayGroup {
  /** Start-of-business-day epoch ms for this group — stable React key. */
  dayStart: number;
  /** "Today", "Yesterday", or "EEEE, MMMM d[, yyyy]". */
  title: string;
  orders: OrderProfile[];
}

/**
 * getBusinessDayForTimestamp only takes ISO strings / Dates, so epoch ms
 * (the shape our day keys use) has to be wrapped first.
 */
function toBusinessDayInput(ts: number | string | Date): string | Date {
  return typeof ts === "number" ? new Date(ts) : ts;
}

export function dayKeyOf(
  ts: number | string | Date,
  config?: BusinessDayConfig | null,
): number {
  if (config) {
    try {
      const day = getBusinessDayForTimestamp(toBusinessDayInput(ts), config);
      const bounds = getBusinessDayBounds(day, config);
      return new Date(bounds.startUtc).getTime();
    } catch {
      // Invalid timezone etc. — fall through to the calendar-day key.
    }
  }
  return startOfDay(new Date(ts)).getTime();
}

export function getDayLabel(
  ts: number | string | Date,
  config?: BusinessDayConfig | null,
): string {
  if (config) {
    try {
      const day = getBusinessDayForTimestamp(toBusinessDayInput(ts), config);
      const current = getCurrentBusinessDay(config);
      if (day === current) return "Today";
      const previous = DateTime.fromISO(current, { zone: config.timezone })
        .minus({ days: 1 })
        .toISODate();
      if (previous && day === previous) return "Yesterday";
      const dt = DateTime.fromISO(day, { zone: config.timezone });
      const nowYear = DateTime.now().setZone(config.timezone).year;
      return dt.isValid
        ? dt.toFormat(
            dt.year === nowYear ? "cccc, LLLL d" : "cccc, LLLL d, yyyy",
          )
        : day;
    } catch {
      // Invalid timezone etc. — fall through to the calendar-day label.
    }
  }
  const date = new Date(ts);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? "EEEE, MMMM d" : "EEEE, MMMM d, yyyy");
}

/** Orders without an `opened_at` are treated as "now" so live/offline orders
 *  land under today's header. */
export function groupOrdersByDay(
  orders: OrderProfile[],
  config?: BusinessDayConfig | null,
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const order of orders) {
    const ts = order.opened_at ?? Date.now();
    const key = dayKeyOf(ts, config);
    const last = groups[groups.length - 1];
    if (last && last.dayStart === key) {
      last.orders.push(order);
    } else {
      groups.push({
        dayStart: key,
        title: getDayLabel(ts, config),
        orders: [order],
      });
    }
  }
  return groups;
}
