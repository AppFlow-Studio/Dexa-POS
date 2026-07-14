/**
 * Wave-0 telemetry registry tests: interning, counters, ring wrap ordering,
 * span threshold, toggle gating, hooks-muted gating, MMKV flush/hydrate
 * round-trip, and an overhead microbench.
 */

import {
  RING_SLOTS,
  SPAN_RING_THRESHOLD_MS,
  buildLongTaskAttr,
  flushToMMKV,
  getPrevSessionSnapshot,
  hydrateFromMMKV,
  internKey,
  noteStringifyEnd,
  recordCount,
  recordSample,
  recordSpan,
  recordWatcherSample,
  resetSessionForTests,
  setCurrentRoute,
  setTelemetryEnabled,
  setTelemetryHooksMuted,
  snapshot,
  telemetryStorage,
} from "@/lib/telemetry/registry";

// Stateful MMKV mock (overrides the stateless one in jest-setup.ts) so the
// flush/hydrate round-trip actually persists between calls. jest.mock is
// hoisted above the imports at runtime.
jest.mock("react-native-mmkv", () => {
  const makeInstance = () => {
    const data = new Map<string, string>();
    return {
      getString: (k: string) => data.get(k),
      set: (k: string, v: string) => void data.set(k, v),
      remove: (k: string) => void data.delete(k),
      delete: (k: string) => void data.delete(k),
      contains: (k: string) => data.has(k),
      getAllKeys: () => Array.from(data.keys()),
      clearAll: () => data.clear(),
    };
  };
  return {
    MMKV: jest.fn().mockImplementation(makeInstance),
    createMMKV: jest.fn().mockImplementation(makeInstance),
  };
});

beforeEach(() => {
  setTelemetryEnabled(true);
  setTelemetryHooksMuted(false);
  resetSessionForTests();
});

describe("key interning", () => {
  it("returns stable ids and round-trips through the dict", () => {
    const a = internKey("test.stable.a");
    const b = internKey("test.stable.b");
    expect(a).not.toBe(b);
    expect(internKey("test.stable.a")).toBe(a);
    const snap = snapshot();
    expect(snap.dict[a]).toBe("test.stable.a");
    expect(snap.dict[b]).toBe("test.stable.b");
  });
});

describe("counters", () => {
  it("aggregates count/sum/max", () => {
    const k = internKey("test.counter");
    recordCount(k, 10);
    recordCount(k, 30);
    recordCount(k); // default inc 1
    const entry = snapshot().counters.find((c) => c.k === "test.counter");
    expect(entry).toEqual({ k: "test.counter", count: 3, sum: 41, max: 30 });
  });
});

describe("span threshold", () => {
  it("counts sub-threshold spans without ring slots; rings at/above", () => {
    const k = internKey("test.span");
    const before = snapshot().ring.total;
    recordSpan(k, SPAN_RING_THRESHOLD_MS - 1);
    expect(snapshot().ring.total).toBe(before);
    recordSpan(k, SPAN_RING_THRESHOLD_MS);
    const snap = snapshot();
    expect(snap.ring.total).toBe(before + 1);
    const counter = snap.counters.find((c) => c.k === "test.span");
    expect(counter?.count).toBe(2); // counter saw both
  });
});

describe("ring buffer wrap", () => {
  it("drops oldest on overflow and stays chronological", () => {
    const k = internKey("test.wrap");
    const overflow = 100;
    for (let i = 0; i < RING_SLOTS + overflow; i++) {
      recordSample(k, i);
    }
    const snap = snapshot();
    expect(snap.ring.total).toBe(RING_SLOTS + overflow);
    expect(snap.ring.entries).toHaveLength(RING_SLOTS);
    // Oldest surviving sample is the one appended right after the dropped ones.
    expect(snap.ring.entries[0].v).toBe(overflow);
    expect(snap.ring.entries[RING_SLOTS - 1].v).toBe(RING_SLOTS + overflow - 1);
    // Chronological t ordering.
    for (let i = 1; i < snap.ring.entries.length; i++) {
      expect(snap.ring.entries[i].t).toBeGreaterThanOrEqual(
        snap.ring.entries[i - 1].t,
      );
    }
  });
});

describe("toggle gating", () => {
  it("all record fns no-op when disabled", () => {
    const k = internKey("test.disabled");
    setTelemetryEnabled(false);
    recordCount(k);
    recordSpan(k, 100);
    recordSample(k, 100);
    recordWatcherSample(k, 100);
    setTelemetryEnabled(true);
    const snap = snapshot();
    expect(snap.ring.total).toBe(0);
    expect(snap.counters.find((c) => c.k === "test.disabled")).toBeUndefined();
  });

  it("hooksMuted silences hook paths but not the watcher path", () => {
    const k = internKey("test.muted");
    setTelemetryHooksMuted(true);
    recordCount(k);
    recordSpan(k, 100);
    recordSample(k, 100);
    expect(snapshot().ring.total).toBe(0);
    recordWatcherSample(k, 123);
    const snap = snapshot();
    expect(snap.ring.total).toBe(1);
    expect(snap.ring.entries[0].v).toBe(123);
  });
});

describe("long-task attribution", () => {
  it("packs route and stringify-overlap bits", () => {
    setCurrentRoute("/order-processing");
    noteStringifyEnd(); // ends "now" — inside any window ending now
    const now = Date.now();
    const attr = buildLongTaskAttr(now, 150);
    recordSample(internKey("test.attr"), 150, attr);
    const entry = snapshot().ring.entries[0];
    expect(entry.route).toBe("/order-processing");
    expect(entry.stringifyOverlap).toBe(true);
    expect(entry.broadcastOverlap).toBe(false);
    expect(entry.flushOverlap).toBe(false);
  });

  it("does not flag stringify outside the blocked window", () => {
    setCurrentRoute("/tables");
    // noteStringifyEnd was never called this session (reset in beforeEach)
    const attr = buildLongTaskAttr(Date.now(), 150);
    recordSample(internKey("test.attr2"), 150, attr);
    const entry = snapshot().ring.entries[0];
    expect(entry.stringifyOverlap).toBe(false);
    expect(entry.route).toBe("/tables");
  });
});

describe("MMKV flush / hydrate round-trip", () => {
  it("persists the snapshot and rolls it to prev on hydrate", () => {
    recordSample(internKey("test.persist"), 42);
    flushToMMKV();
    expect(telemetryStorage.getString("telemetry-ring-v1")).toBeTruthy();

    hydrateFromMMKV(); // boot rollover
    expect(telemetryStorage.getString("telemetry-ring-v1")).toBeUndefined();
    const prev = getPrevSessionSnapshot();
    expect(prev).not.toBeNull();
    expect(prev!.schema).toBe(1);
    const entry = prev!.ring.entries.find((e) => e.k === "test.persist");
    expect(entry?.v).toBe(42);
  });
});

describe("overhead microbench", () => {
  it("100k recordSpan calls complete fast (loose CI bound)", () => {
    const k = internKey("test.bench");
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      recordSpan(k, 1); // sub-threshold: counter-only hot path
    }
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
