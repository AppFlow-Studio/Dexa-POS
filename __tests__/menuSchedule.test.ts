/**
 * Menu / category schedule mapping + evaluation — the single evaluator every
 * POS and kiosk surface reads. The rules under test:
 *
 *   - wire `day_of_week` is 0=Sunday (website convention) → identity to getDay()
 *   - inactive schedules / slots are dropped; a v2 payload (no is_active) too
 *   - end is exclusive; an end at/after 23:59:00 means midnight, so the
 *     website's split overnight window (Fri 22:00–23:59, Sat 00:00–02:00) has
 *     no hole at 23:59
 *   - `end <= start` is overnight and its tail belongs to the previous day
 */
import {
  formatScheduleSummary,
  isWithinSchedules,
  mapApiSchedules,
  parseScheduleTime,
} from "@/lib/menu/menuSchedule";
import type { Schedule } from "@/lib/types";
import type { MenuScheduleEntry } from "@/types/menu";

// Week of 2026-09-20: Sun 20, Mon 21, … Fri 25, Sat 26, Sun 27.
const at = (day: number, h: number, m = 0, s = 0) =>
  new Date(2026, 8, day, h, m, s);
const SUN = 20;
const MON = 21;
const FRI = 25;
const SAT = 26;

const slot = (day_of_week: number, start_time: string, end_time: string) => ({
  id: `slot-${day_of_week}-${start_time}`,
  day_of_week,
  start_time,
  end_time,
  is_active: true,
});

const entry = (
  slots: ReturnType<typeof slot>[],
  isActive: boolean | "omit" = true,
): MenuScheduleEntry => ({
  id: "junction-1",
  schedule: {
    id: "schedule-1",
    name: "Lunch",
    description: null,
    // "omit" = the v2 wire shape, which never carried is_active.
    ...(isActive === "omit" ? {} : { is_active: isActive }),
    time_slots: slots,
  },
});

const rule = (overrides: Partial<Schedule>): Schedule => ({
  id: "r",
  name: "r",
  startTime: "11:00:00",
  endTime: "14:00:00",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  isActive: true,
  ...overrides,
});

describe("mapApiSchedules", () => {
  it("maps day_of_week 0=Sunday straight onto day keys", () => {
    const [mapped] = mapApiSchedules([
      entry([1, 2, 3, 4, 5].map((d) => slot(d, "11:00:00", "14:00:00"))),
    ]);
    expect(mapped.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);

    const [sunday] = mapApiSchedules([entry([slot(0, "09:00:00", "12:00:00")])]);
    expect(sunday.days).toEqual(["Sun"]);
  });

  it("groups slots by window, one rule per distinct start/end", () => {
    const mapped = mapApiSchedules([
      entry([
        slot(1, "11:00:00", "14:00:00"),
        slot(2, "11:00:00", "14:00:00"),
        slot(6, "10:00:00", "15:00:00"),
      ]),
    ]);
    expect(mapped).toHaveLength(2);
    expect(mapped.map((r) => r.days)).toEqual([["Mon", "Tue"], ["Sat"]]);
    expect(mapped.every((r) => r.isActive && r.name === "Lunch")).toBe(true);
  });

  it("drops inactive schedules, inactive slots, and v2 payloads without is_active", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapApiSchedules([entry([slot(1, "11:00", "14:00")], false)])).toEqual(
      [],
    );
    expect(
      mapApiSchedules([entry([slot(1, "11:00", "14:00")], "omit")]),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    const partial = entry([
      slot(1, "11:00:00", "14:00:00"),
      { ...slot(2, "11:00:00", "14:00:00"), is_active: false },
    ]);
    expect(mapApiSchedules([partial])[0].days).toEqual(["Mon"]);
  });

  it("tolerates missing / malformed input", () => {
    expect(mapApiSchedules(undefined)).toEqual([]);
    expect(mapApiSchedules(null)).toEqual([]);
    expect(mapApiSchedules([entry([slot(9, "11:00", "14:00")])])).toEqual([]);
  });
});

describe("isWithinSchedules", () => {
  it("is open inside the window and closed outside, end exclusive", () => {
    const lunch = [rule({})];
    expect(isWithinSchedules(lunch, at(MON, 11, 0))).toBe(true);
    expect(isWithinSchedules(lunch, at(MON, 13, 59, 59))).toBe(true);
    expect(isWithinSchedules(lunch, at(MON, 14, 0))).toBe(false);
    expect(isWithinSchedules(lunch, at(MON, 10, 59))).toBe(false);
    expect(isWithinSchedules(lunch, at(SAT, 12, 0))).toBe(false);
  });

  it("uses the corrected day mapping end to end (Mon–Fri stays Mon–Fri)", () => {
    const mapped = mapApiSchedules([
      entry([1, 2, 3, 4, 5].map((d) => slot(d, "11:00:00", "14:00:00"))),
    ]);
    expect(isWithinSchedules(mapped, at(MON, 12))).toBe(true);
    expect(isWithinSchedules(mapped, at(FRI, 12))).toBe(true);
    expect(isWithinSchedules(mapped, at(SAT, 12))).toBe(false);
    expect(isWithinSchedules(mapped, at(SUN, 12))).toBe(false);
  });

  it("keeps a split overnight window continuous across midnight", () => {
    // How the dashboard stores Fri 22:00 → Sat 02:00.
    const mapped = mapApiSchedules([
      entry([slot(5, "22:00:00", "23:59:00"), slot(6, "00:00:00", "02:00:00")]),
    ]);
    expect(isWithinSchedules(mapped, at(FRI, 21, 59))).toBe(false);
    expect(isWithinSchedules(mapped, at(FRI, 23, 30))).toBe(true);
    expect(isWithinSchedules(mapped, at(FRI, 23, 59, 30))).toBe(true);
    expect(isWithinSchedules(mapped, at(SAT, 1, 30))).toBe(true);
    expect(isWithinSchedules(mapped, at(SAT, 2, 0))).toBe(false);
    expect(isWithinSchedules(mapped, at(SAT, 3, 0))).toBe(false);
  });

  it("treats a 23:59:59 end as midnight", () => {
    const late = [rule({ startTime: "18:00:00", endTime: "23:59:59" })];
    expect(isWithinSchedules(late, at(MON, 23, 59, 59))).toBe(true);
  });

  it("gives an end<=start window's tail to the previous day", () => {
    const weekdayNights = [rule({ startTime: "22:00", endTime: "02:00" })];
    // Friday night runs into Saturday morning…
    expect(isWithinSchedules(weekdayNights, at(FRI, 23, 30))).toBe(true);
    expect(isWithinSchedules(weekdayNights, at(SAT, 1, 30))).toBe(true);
    expect(isWithinSchedules(weekdayNights, at(SAT, 3, 0))).toBe(false);
    // …but Sunday night is not scheduled, so Monday 01:30 is closed.
    expect(isWithinSchedules(weekdayNights, at(MON, 1, 30))).toBe(false);
    expect(isWithinSchedules(weekdayNights, at(SAT, 23, 0))).toBe(false);
  });

  it("ignores inactive and dayless rules; empty list is closed", () => {
    expect(isWithinSchedules([rule({ isActive: false })], at(MON, 12))).toBe(
      false,
    );
    expect(isWithinSchedules([rule({ days: [] })], at(MON, 12))).toBe(false);
    expect(isWithinSchedules([], at(MON, 12))).toBe(false);
  });
});

describe("parseScheduleTime", () => {
  it("parses HH:MM and HH:MM:SS, rejects junk", () => {
    expect(parseScheduleTime("11:30")).toBe(11 * 3600 + 30 * 60);
    expect(parseScheduleTime("23:59:59")).toBe(86399);
    expect(parseScheduleTime("2026-09-24T11:00:00Z")).toBeNull();
    expect(parseScheduleTime("")).toBeNull();
  });
});

describe("formatScheduleSummary", () => {
  it("collapses day runs and formats 12-hour times", () => {
    expect(formatScheduleSummary([rule({})])).toBe(
      "Mon–Fri 11:00 AM–2:00 PM",
    );
    expect(
      formatScheduleSummary([
        rule({ days: ["Sat", "Sun"], startTime: "10:00:00", endTime: "15:30:00" }),
      ]),
    ).toBe("Sat, Sun 10:00 AM–3:30 PM");
    expect(
      formatScheduleSummary([
        rule({ days: ["Mon", "Wed", "Fri"] }),
        rule({
          days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          startTime: "00:00:00",
          endTime: "23:59:59",
        }),
      ]),
    ).toBe("Mon, Wed, Fri 11:00 AM–2:00 PM · Every day 12:00 AM–11:59 PM");
  });

  it("is empty with no active rules", () => {
    expect(formatScheduleSummary([])).toBe("");
    expect(formatScheduleSummary([rule({ isActive: false })])).toBe("");
  });
});
