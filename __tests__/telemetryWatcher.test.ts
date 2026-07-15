/**
 * Long-task watcher tests: drift math, threshold, pause/resume re-anchoring,
 * and attribution wiring. Uses modern fake timers (which also fake Date).
 */
import {
  DRIFT_THRESHOLD_MS,
  TICK_MS,
  __tickForTests,
  isWatcherRunning,
  startWatcher,
  stopWatcher,
} from "@/lib/telemetry/longTaskWatcher";
import {
  noteStringifyEnd,
  resetSessionForTests,
  setCurrentRoute,
  setTelemetryEnabled,
  setTelemetryHooksMuted,
  snapshot,
} from "@/lib/telemetry/registry";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1_700_000_000_000);
  setTelemetryEnabled(true);
  setTelemetryHooksMuted(false);
  resetSessionForTests();
});

afterEach(() => {
  stopWatcher();
  jest.useRealTimers();
});

const longTaskEntries = () =>
  snapshot().ring.entries.filter((e) => e.k === "longtask");

describe("drift detection", () => {
  it("records no sample when ticks run on time", () => {
    startWatcher();
    // startWatcher anchors expected = now + TICK_MS; simulate an on-time tick.
    jest.setSystemTime(Date.now() + TICK_MS);
    __tickForTests();
    jest.setSystemTime(Date.now() + TICK_MS);
    __tickForTests();
    expect(longTaskEntries()).toHaveLength(0);
  });

  it("records drift when a tick is starved past the threshold", () => {
    startWatcher();
    // Tick fires 250ms after start instead of 50ms -> drift = 200ms.
    jest.setSystemTime(Date.now() + TICK_MS + 200);
    __tickForTests();
    const entries = longTaskEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].v).toBe(200);
  });

  it("ignores drift at or below the threshold", () => {
    startWatcher();
    jest.setSystemTime(Date.now() + TICK_MS + DRIFT_THRESHOLD_MS);
    __tickForTests();
    expect(longTaskEntries()).toHaveLength(0);
  });

  it("re-anchors after each tick (no drift accumulation)", () => {
    startWatcher();
    jest.setSystemTime(Date.now() + TICK_MS + 200);
    __tickForTests(); // one 200ms drift sample
    // Next tick is on time relative to the re-anchored schedule.
    jest.setSystemTime(Date.now() + TICK_MS);
    __tickForTests();
    expect(longTaskEntries()).toHaveLength(1);
  });
});

describe("pause / resume", () => {
  it("start/stop toggles the interval and re-anchors on resume", () => {
    startWatcher();
    expect(isWatcherRunning()).toBe(true);
    stopWatcher();
    expect(isWatcherRunning()).toBe(false);

    // Long background gap while stopped must not fabricate a sample.
    jest.setSystemTime(Date.now() + 60_000);
    startWatcher(); // re-anchors expected = now + TICK_MS
    jest.setSystemTime(Date.now() + TICK_MS);
    __tickForTests();
    expect(longTaskEntries()).toHaveLength(0);
  });

  it("startWatcher is idempotent", () => {
    startWatcher();
    startWatcher();
    stopWatcher();
    expect(isWatcherRunning()).toBe(false);
  });
});

describe("attribution", () => {
  it("tags samples with route and stringify overlap inside the window", () => {
    setCurrentRoute("/order-processing");
    startWatcher();
    // Stringify ends mid-block, then the starved tick fires.
    jest.setSystemTime(Date.now() + TICK_MS + 100);
    noteStringifyEnd();
    jest.setSystemTime(Date.now() + 100); // drift = 200 total
    __tickForTests();
    const entries = longTaskEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].route).toBe("/order-processing");
    expect(entries[0].stringifyOverlap).toBe(true);
  });

  it("does not tag stringify that ended before the blocked window", () => {
    setCurrentRoute("/tables");
    noteStringifyEnd(); // long before the block
    jest.setSystemTime(Date.now() + 10_000);
    startWatcher();
    jest.setSystemTime(Date.now() + TICK_MS + 200);
    __tickForTests();
    const entries = longTaskEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].stringifyOverlap).toBe(false);
  });

  it("records nothing while disabled", () => {
    setTelemetryEnabled(false);
    startWatcher();
    jest.setSystemTime(Date.now() + TICK_MS + 500);
    __tickForTests();
    setTelemetryEnabled(true);
    expect(longTaskEntries()).toHaveLength(0);
  });
});
