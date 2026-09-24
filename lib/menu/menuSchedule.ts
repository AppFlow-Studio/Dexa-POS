import type { Schedule } from "@/lib/types";
import type { MenuScheduleEntry } from "@/types/menu";

/**
 * Menu / category time schedules — the ONE mapper and the ONE evaluator. The
 * store getters (`isMenuAvailableNow`, `isCategoryAvailableNow`), POS search
 * and every kiosk surface go through here, so "is this open right now" has a
 * single answer on every screen.
 *
 * WIRE CONTRACT (get_pos_bootstrap_v3):
 *   - `day_of_week` is 0=Sunday..6=Saturday — the website writes it that way
 *     everywhere (ScheduleCard DAYS_OF_WEEK, `slot.day_of_week === getDay()`),
 *     so it maps 1:1 onto JS `Date#getDay()`. Earlier POS code assumed
 *     0=Monday and shifted every window by a day.
 *   - `schedule.is_active` is the location-effective flag (location override
 *     wins). A schedule without it is dropped — v2 payloads never carried it.
 *   - Times are `time without time zone` ("HH:MM:SS"). The DB enforces
 *     end > start, so the dashboard stores an overnight window as two slots:
 *     `start → 23:59:00` on day D and `00:00:00 → end` on D+1. A midnight end
 *     is stored as `23:59:59`.
 *
 * EVALUATION:
 *   - End is exclusive, compared to the second.
 *   - Any end at or after 23:59:00 means "until midnight", so a split
 *     overnight window has no one-minute hole at 23:59.
 *   - `end <= start` (not producible by the website, kept defensively) is an
 *     overnight window; its after-midnight tail belongs to the PREVIOUS day's
 *     entry, so Fri 22:00–02:00 is open Sat 01:30 and closed Mon 01:30.
 *   - Time source is the device clock.
 *
 * An entity with no active schedule is always available — callers check
 * `schedules.length` before evaluating.
 */

/** `Schedule.days` keys, indexed by `Date#getDay()`. */
export const SCHEDULE_DAY_KEYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Display order for summaries — Monday-first so weekends read "Sat–Sun". */
const DISPLAY_DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SECONDS_PER_DAY = 24 * 60 * 60;
const END_OF_DAY_FROM = 23 * 60 * 60 + 59 * 60;

/** "HH:MM" / "HH:MM:SS" → seconds since midnight; null when unparseable. */
export function parseScheduleTime(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (hours > 24 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Bootstrap schedule entries → store `Schedule` rules. Slots sharing a time
 * window collapse into one rule listing their days.
 */
export function mapApiSchedules(
  entries: readonly MenuScheduleEntry[] | null | undefined,
): Schedule[] {
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => {
    const schedule = entry?.schedule;
    if (!schedule) return [];
    if (schedule.is_active !== true) {
      if (__DEV__ && schedule.is_active === undefined) {
        console.warn(
          "[menuSchedule] schedule without is_active dropped — payload is not get_pos_bootstrap_v3",
          { scheduleId: schedule.id },
        );
      }
      return [];
    }

    const groups = new Map<
      string,
      { startTime: string; endTime: string; days: Set<string> }
    >();
    for (const slot of schedule.time_slots ?? []) {
      if (!slot || slot.is_active === false) continue;
      const day = SCHEDULE_DAY_KEYS[slot.day_of_week];
      if (!day) continue;
      const startTime = slot.start_time || "00:00:00";
      const endTime = slot.end_time || "23:59:59";
      const key = `${startTime}-${endTime}`;
      let group = groups.get(key);
      if (!group) {
        group = { startTime, endTime, days: new Set() };
        groups.set(key, group);
      }
      group.days.add(day);
    }

    return Array.from(groups.values()).map((group) => ({
      id: `${entry.id}-${group.startTime}-${group.endTime}`,
      name: schedule.name,
      startTime: group.startTime,
      endTime: group.endTime,
      days: SCHEDULE_DAY_KEYS.filter((d) => group.days.has(d)),
      isActive: true,
    }));
  });
}

/** True when `at` falls inside any active rule. Empty list → false. */
export function isWithinSchedules(
  schedules: readonly Schedule[] | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!schedules?.length) return false;

  const dayIndex = at.getDay();
  const today = SCHEDULE_DAY_KEYS[dayIndex];
  const yesterday = SCHEDULE_DAY_KEYS[(dayIndex + 6) % 7];
  const now = at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();

  return schedules.some((rule) => {
    if (!rule.isActive || !rule.days?.length) return false;
    const start = parseScheduleTime(rule.startTime);
    let end = parseScheduleTime(rule.endTime);
    if (start === null || end === null) return false;
    if (end >= END_OF_DAY_FROM) end = SECONDS_PER_DAY;

    if (end > start) {
      return rule.days.includes(today) && now >= start && now < end;
    }
    // Overnight: open from `start` on a listed day until `end` the next day.
    return (
      (rule.days.includes(today) && now >= start) ||
      (rule.days.includes(yesterday) && now < end)
    );
  });
}

function formatScheduleTime(value: string): string {
  const seconds = parseScheduleTime(value);
  if (seconds === null) return value;
  const totalMinutes = Math.floor(seconds / 60) % (24 * 60);
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatScheduleDays(days: readonly string[]): string {
  const ordered = DISPLAY_DAY_ORDER.filter((d) => days.includes(d));
  if (ordered.length === 7) return "Every day";

  // Collapse consecutive runs (Mon..Sun order): Mon, Tue, Wed → "Mon–Wed".
  const runs: string[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (
      prev &&
      DISPLAY_DAY_ORDER.indexOf(day) === DISPLAY_DAY_ORDER.indexOf(prev) + 1
    ) {
      last.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs
    .map((run) =>
      run.length >= 3 ? `${run[0]}–${run[run.length - 1]}` : run.join(", "),
    )
    .join(", ");
}

/** "Mon–Fri 11:00 AM–2:00 PM · Sat, Sun 10:00 AM–3:00 PM"; "" when none. */
export function formatScheduleSummary(
  schedules: readonly Schedule[] | null | undefined,
): string {
  return (schedules ?? [])
    .filter((rule) => rule.isActive && rule.days?.length)
    .map(
      (rule) =>
        `${formatScheduleDays(rule.days)} ${formatScheduleTime(rule.startTime)}–${formatScheduleTime(rule.endTime)}`,
    )
    .join(" · ");
}
