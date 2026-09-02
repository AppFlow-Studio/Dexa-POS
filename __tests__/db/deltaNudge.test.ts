/**
 * The nudge — "the backend moved, pull now" (lib/db/deltaNudge.ts).
 *
 * What this protects: an order created on this station arrives as an own-echo
 * broadcast whose mirror write is deliberately skipped, and an order from
 * another station arrives as a TRIMMED payload with no items embed. Both are
 * only complete once the delta re-fetches them, which without a nudge means
 * waiting up to the full 30 s interval.
 *
 * The two properties that matter are opposite in direction and both easy to
 * get wrong: the pull must be debounced (an ordering burst is dozens of
 * broadcasts and must not be dozens of pulls), while invalidation must NOT be
 * debounced (a cached "the mirror is current" verdict has to die the instant
 * we learn otherwise, not 1.2 s later).
 */
import {
    __resetDeltaNudgeForTests,
    nudgeDeltaSync,
    onDeltaNudge,
    registerDeltaCycle,
} from "@/lib/db/deltaNudge";

beforeEach(() => {
  jest.useFakeTimers();
  __resetDeltaNudgeForTests();
});

afterEach(() => {
  __resetDeltaNudgeForTests();
  jest.useRealTimers();
});

describe("nudgeDeltaSync", () => {
  it("pulls once for a burst of broadcasts", async () => {
    const cycle = jest.fn(async () => {});
    registerDeltaCycle(cycle);

    for (let i = 0; i < 20; i++) nudgeDeltaSync("burst");
    expect(cycle).not.toHaveBeenCalled(); // debounced, not per-broadcast

    jest.advanceTimersByTime(2000);
    expect(cycle).toHaveBeenCalledTimes(1);
  });

  it("pulls again for a later, separate broadcast", async () => {
    const cycle = jest.fn(async () => {});
    registerDeltaCycle(cycle);

    nudgeDeltaSync("first");
    jest.advanceTimersByTime(2000);
    nudgeDeltaSync("second");
    jest.advanceTimersByTime(2000);

    expect(cycle).toHaveBeenCalledTimes(2);
  });

  it("does not starve under sustained traffic — the max-wait fires it", () => {
    // Peak measured churn (B4) is ~1 order/second: broadcasts arrive closer
    // together than the debounce window, so a pure trailing debounce would
    // reschedule forever and never pull.
    const cycle = jest.fn(async () => {});
    registerDeltaCycle(cycle);

    for (let i = 0; i < 30; i++) {
      nudgeDeltaSync("sustained");
      jest.advanceTimersByTime(1000); // < NUDGE_DEBOUNCE_MS
    }

    expect(cycle.mock.calls.length).toBeGreaterThanOrEqual(4);
    // ...and it still coalesces: 30 broadcasts is not 30 pulls.
    expect(cycle.mock.calls.length).toBeLessThan(10);
  });

  it("fires listeners IMMEDIATELY — invalidation cannot be debounced", () => {
    const invalidate = jest.fn();
    onDeltaNudge(invalidate);
    registerDeltaCycle(jest.fn(async () => {}));

    nudgeDeltaSync("order-broadcast");

    // No timer advance: a stale "mirror is current" verdict must be gone
    // before the next read, which can happen in the same tick.
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("still fires listeners when no cycle is registered", () => {
    const invalidate = jest.fn();
    onDeltaNudge(invalidate);

    expect(() => nudgeDeltaSync("no-cycle")).not.toThrow();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(() => jest.advanceTimersByTime(2000)).not.toThrow();
  });

  it("does not call a cycle that has been unregistered", () => {
    const cycle = jest.fn(async () => {});
    registerDeltaCycle(cycle);

    nudgeDeltaSync("then-unmount");
    registerDeltaCycle(null); // the effect tore down mid-debounce
    jest.advanceTimersByTime(2000);

    expect(cycle).not.toHaveBeenCalled();
  });

  it("survives a throwing listener — a broadcast handler must not die", () => {
    const bad = jest.fn(() => {
      throw new Error("boom");
    });
    const good = jest.fn();
    onDeltaNudge(bad);
    onDeltaNudge(good);

    expect(() => nudgeDeltaSync("throwing-listener")).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
