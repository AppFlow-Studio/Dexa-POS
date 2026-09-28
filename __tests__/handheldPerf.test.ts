import { act, renderHook } from "@testing-library/react-native";
import { useMinuteTick } from "@/handheld/hooks/useMinuteTick";
import { checksIndex } from "@/handheld/screens/checks/useChecks";

const order = (id: string, over: object = {}) =>
  ({ id, check_status: "Opened", order_status: "pending", items: [{}], opened_at: `2026-09-28T1${id}:00:00Z`, ...over }) as never;

describe("checksIndex", () => {
  it("returns the same object when a broadcast changes an order but not the lists", () => {
    const first = checksIndex({ "1": order("1"), "2": order("2") });
    // A new map (every store update makes one) with the same checks in the same order.
    const second = checksIndex({ "1": order("1", { notes: "no ice" }), "2": order("2") });
    expect(second).toBe(first);
  });

  it("returns a new object when a check opens, closes or the badge moves", () => {
    const before = checksIndex({ "1": order("1") });
    const opened = checksIndex({ "1": order("1"), "3": order("3") });
    expect(opened).not.toBe(before);
    expect(opened.open).toEqual(["3", "1"]);
    const ready = checksIndex({ "1": order("1"), "3": order("3", { order_status: "ready" }) });
    expect(ready.needsYou).toBe(1);
  });
});

describe("useMinuteTick", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-28T12:00:30Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("ticks every subscriber together on the minute boundary", () => {
    const a = renderHook(() => useMinuteTick());
    const b = renderHook(() => useMinuteTick());
    const start = a.result.current;
    expect(b.result.current).toBe(start);

    act(() => jest.advanceTimersByTime(29_000)); // 12:00:59 — not yet
    expect(a.result.current).toBe(start);

    act(() => jest.advanceTimersByTime(1_000)); // 12:01:00
    expect(a.result.current).toBe(start + 60_000);
    expect(b.result.current).toBe(a.result.current);
    a.unmount();
    b.unmount();
  });
});
