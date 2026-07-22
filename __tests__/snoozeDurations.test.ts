import {
  computeSnoozeUntil,
  formatSnoozeCountdown,
  isActivelySnoozed,
  SNOOZE_INFINITY,
} from "@/lib/snoozeDurations";
import { DateTime } from "luxon";

describe("computeSnoozeUntil", () => {
  it("returns 'infinity' for until_manual", () => {
    expect(computeSnoozeUntil({ kind: "until_manual" }, "America/New_York")).toBe(
      SNOOZE_INFINITY,
    );
  });

  it("returns a future UTC ISO string ~N hours out for the hours option", () => {
    const iso = computeSnoozeUntil({ kind: "hours", hours: 4 }, "America/New_York");
    const diffMin = (DateTime.fromISO(iso).toMillis() - Date.now()) / 60000;
    // ~240 minutes, allow a little slack for execution time.
    expect(diffMin).toBeGreaterThan(239);
    expect(diffMin).toBeLessThan(241);
    // Must be UTC (round-trips through toUTC()).
    expect(iso).toMatch(/(Z|\+00:00)$/);
  });

  it("passes a custom Date through as UTC ISO", () => {
    const target = new Date(Date.now() + 90 * 60 * 1000);
    const iso = computeSnoozeUntil({ kind: "custom", date: target }, "UTC");
    expect(DateTime.fromISO(iso).toMillis()).toBe(target.getTime());
  });

  it("resolves end_of_day to a future boundary in the store's timezone", () => {
    const iso = computeSnoozeUntil(
      { kind: "end_of_day" },
      "America/New_York",
      4, // 4am business-day rollover
    );
    expect(DateTime.fromISO(iso).toMillis()).toBeGreaterThan(Date.now());
  });
});

describe("isActivelySnoozed", () => {
  it("is false for null/undefined", () => {
    expect(isActivelySnoozed(null)).toBe(false);
    expect(isActivelySnoozed(undefined)).toBe(false);
  });

  it("is true for infinity", () => {
    expect(isActivelySnoozed(SNOOZE_INFINITY)).toBe(true);
  });

  it("is true for a future timestamp and false for a past one", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isActivelySnoozed(future)).toBe(true);
    expect(isActivelySnoozed(past)).toBe(false);
  });
});

describe("formatSnoozeCountdown", () => {
  it("returns null when not actively snoozed", () => {
    expect(formatSnoozeCountdown(null)).toBeNull();
    expect(formatSnoozeCountdown(new Date(Date.now() - 1000).toISOString())).toBeNull();
  });

  it("returns '86' for infinity", () => {
    expect(formatSnoozeCountdown(SNOOZE_INFINITY)).toBe("86");
  });

  it("formats hours and minutes", () => {
    const in2h14m = new Date(Date.now() + (2 * 60 + 14) * 60_000).toISOString();
    expect(formatSnoozeCountdown(in2h14m)).toBe("2h 14m");
  });

  it("formats minutes only when under an hour", () => {
    const in45m = new Date(Date.now() + 45 * 60_000).toISOString();
    expect(formatSnoozeCountdown(in45m)).toBe("45m");
  });
});
