import {
    dayKeyOf,
    getDayLabel,
    groupOrdersByDay,
} from "@/lib/orderDayGrouping";
import { OrderProfile } from "@/lib/types";

const makeOrder = (id: string, openedAt?: string): OrderProfile =>
  ({
    id,
    opened_at: openedAt,
    items: [],
  }) as OrderProfile;

describe("orderDayGrouping", () => {
  describe("getDayLabel", () => {
    it("labels today as Today", () => {
      expect(getDayLabel(new Date())).toBe("Today");
    });

    it("labels yesterday as Yesterday", () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expect(getDayLabel(d)).toBe("Yesterday");
    });

    it("labels older dates with a weekday + month + day", () => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      // date-fns "EEEE, MMMM d" — e.g. "Monday, August 25"
      expect(getDayLabel(d)).toMatch(/^[A-Za-z]+, [A-Za-z]+ \d+$/);
    });

    it("includes the year for dates in a different year", () => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      d.setMonth(0);
      d.setDate(15);
      expect(getDayLabel(d)).toMatch(/\d{4}$/);
    });
  });

  describe("dayKeyOf", () => {
    it("normalizes any time within the same day to one key", () => {
      const a = new Date(2026, 7, 28, 1, 0, 0).getTime(); // 1am
      const b = new Date(2026, 7, 28, 23, 59, 0).getTime(); // 11:59pm
      expect(dayKeyOf(a)).toBe(dayKeyOf(b));
    });

    it("differs across days", () => {
      const a = new Date(2026, 7, 28).getTime();
      const b = new Date(2026, 7, 29).getTime();
      expect(dayKeyOf(a)).not.toBe(dayKeyOf(b));
    });
  });

  describe("groupOrdersByDay", () => {
    it("groups consecutive same-day runs and preserves input order", () => {
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const older = new Date(Date.now() - 3 * 86400000).toISOString();

      const groups = groupOrdersByDay([
        makeOrder("a", today),
        makeOrder("b", today),
        makeOrder("c", yesterday),
        makeOrder("d", older),
      ]);

      expect(groups.map((g) => g.orders.length)).toEqual([2, 1, 1]);
      expect(groups[0].title).toBe("Today");
      expect(groups[1].title).toBe("Yesterday");
      expect(groups.map((g) => g.orders[0].id)).toEqual(["a", "c", "d"]);
    });

    it("inserts a new header for each distinct day run", () => {
      const d1 = new Date(2026, 0, 5, 10).toISOString(); // Mon Jan 5
      const d2 = new Date(2026, 0, 6, 10).toISOString(); // Tue Jan 6
      const groups = groupOrdersByDay([makeOrder("a", d1), makeOrder("b", d2)]);
      expect(groups).toHaveLength(2);
      expect(groups[0].title).toBe("Monday, January 5");
      expect(groups[1].title).toBe("Tuesday, January 6");
    });

    it("treats orders without opened_at as now (Today)", () => {
      const groups = groupOrdersByDay([makeOrder("no-ts")]);
      expect(groups).toHaveLength(1);
      expect(groups[0].title).toBe("Today");
    });

    it("returns an empty array for no orders", () => {
      expect(groupOrdersByDay([])).toEqual([]);
    });
  });
});
