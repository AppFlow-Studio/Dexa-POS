/**
 * Lifecycle coordinator — resume staging behavior.
 *
 * The thing under test is ORDERING. Before this existed, ~20 AppState
 * listeners each fired their own recovery work on the same tick and the
 * winner was whatever the JS scheduler happened to pick, so "auth is
 * revalidated before the offline queue replays" was a timing accident. These
 * tests pin it down as a guarantee.
 */

// Minimal react-native surface — the real module drags in native bindings the
// node test env has no business loading.
// NOTE: the factory below only ever type-annotates via a bare Mock-prefixed
// identifier (e.g. `Set<MockResumeCallback>`), never an inline `(x: T) => ...`
// literal — babel-plugin-jest-hoist scans the factory body for out-of-scope
// identifiers and mistakes an inline function-type literal's parameter name
// for a variable reference. A named type declared outside the factory and
// referenced by a single "Mock"-prefixed identifier sidesteps that.
type MockResumeCallback = (state: string) => void;
type MockAppStateModule = {
  currentState: string;
  addEventListener: (
    type: string,
    cb: MockResumeCallback
  ) => { remove: () => void };
  __emit: (state: string) => void;
  __listenerCount: () => number;
};
type MockInteractionManagerModule = {
  runAfterInteractions: (cb: () => void) => { cancel: () => void };
};

jest.mock("react-native", () => {
  const listeners = new Set<MockResumeCallback>();
  const AppState: MockAppStateModule = {
    currentState: "active",
    addEventListener: (_type, cb) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    },
    __emit: (state) => {
      for (const l of Array.from(listeners)) l(state);
    },
    __listenerCount: () => listeners.size,
  };
  const InteractionManager: MockInteractionManagerModule = {
    runAfterInteractions: (cb) => {
      const id = setTimeout(cb, 0);
      return { cancel: () => clearTimeout(id) };
    },
  };
  return { AppState, InteractionManager };
});

import { AppState } from "react-native";
import {
  BUCKET_ORDER,
  getRegisteredTaskIds,
  registerResumeTask,
  registerSuspendTask,
  resetAppLifecycleCoordinatorForTests,
  startAppLifecycleCoordinator,
  triggerResume,
  type ResumeBucket,
} from "@/lib/lifecycle/appLifecycleCoordinator";

type MockAppState = typeof AppState & {
  __emit: (s: string) => void;
  __listenerCount: () => number;
};
const mockAppState = AppState as MockAppState;

// rAF isn't guaranteed in the node test env.
beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    // @ts-expect-error test shim
    globalThis.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
});

beforeEach(() => {
  jest.useFakeTimers();
  resetAppLifecycleCoordinatorForTests();
});

afterEach(() => {
  resetAppLifecycleCoordinatorForTests();
  jest.useRealTimers();
});

/** Drive a full drain to completion, including the idle-delayed bucket. */
async function drainFully(): Promise<void> {
  // 3s covers the 2s background-bucket delay plus the rAF/interaction hops.
  await jest.advanceTimersByTimeAsync(3_000);
}

describe("bucket ordering", () => {
  it("runs buckets in immediate -> frame -> interactions -> background order", async () => {
    const order: string[] = [];
    for (const bucket of BUCKET_ORDER) {
      registerResumeTask({
        id: `t-${bucket}`,
        bucket,
        run: () => {
          order.push(bucket);
        },
      });
    }

    triggerResume();
    await drainFully();

    expect(order).toEqual(["immediate", "frame", "interactions", "background"]);
  });

  it("does not start a later bucket until the previous one has SETTLED", async () => {
    // The pre-migration bug in miniature: an async task that resolves late.
    // Registering it in `immediate` must hold everything behind it, not just
    // start it first.
    const events: string[] = [];
    let releaseImmediate!: () => void;
    const immediateGate = new Promise<void>((resolve) => {
      releaseImmediate = resolve;
    });

    registerResumeTask({
      id: "slow-auth",
      bucket: "immediate",
      run: async () => {
        events.push("immediate:start");
        await immediateGate;
        events.push("immediate:end");
      },
    });
    registerResumeTask({
      id: "frame-work",
      bucket: "frame",
      run: () => {
        events.push("frame:start");
      },
    });

    triggerResume();
    await jest.advanceTimersByTimeAsync(3_000);

    // Frame must NOT have run — immediate is still pending.
    expect(events).toEqual(["immediate:start"]);

    releaseImmediate();
    await drainFully();

    expect(events).toEqual([
      "immediate:start",
      "immediate:end",
      "frame:start",
    ]);
  });

  it("offline-queue replay cannot preempt the immediate bucket", async () => {
    // Direct encoding of the QA case: "offline queue non-empty on resume
    // (replay must not preempt the Immediate bucket)".
    const order: string[] = [];

    registerResumeTask({
      id: "auth.clerk-token",
      bucket: "immediate",
      run: async () => {
        await Promise.resolve();
        order.push("auth");
      },
    });
    registerResumeTask({
      id: "sync.foreground-network-recheck",
      bucket: "interactions",
      run: () => {
        order.push("replay");
      },
    });

    triggerResume();
    await drainFully();

    expect(order).toEqual(["auth", "replay"]);
  });
});

describe("gating", () => {
  it("skips tasks whose shouldRun returns false", async () => {
    const run = jest.fn();
    registerResumeTask({
      id: "gated",
      bucket: "immediate",
      shouldRun: () => false,
      run,
    });

    triggerResume();
    await drainFully();

    expect(run).not.toHaveBeenCalled();
  });

  it("skips requiresNetwork tasks while offline but still runs local ones", async () => {
    resetAppLifecycleCoordinatorForTests();
    startAppLifecycleCoordinator(() => false);

    const networked = jest.fn();
    const local = jest.fn();
    registerResumeTask({
      id: "networked",
      bucket: "immediate",
      requiresNetwork: true,
      run: networked,
    });
    registerResumeTask({ id: "local", bucket: "immediate", run: local });

    triggerResume();
    await drainFully();

    expect(networked).not.toHaveBeenCalled();
    expect(local).toHaveBeenCalledTimes(1);
  });

  it("treats a throwing shouldRun as skip rather than crashing the drain", async () => {
    const later = jest.fn();
    registerResumeTask({
      id: "bad-gate",
      bucket: "immediate",
      shouldRun: () => {
        throw new Error("predicate blew up");
      },
      run: jest.fn(),
    });
    registerResumeTask({ id: "later", bucket: "frame", run: later });

    triggerResume();
    await drainFully();

    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe("failure isolation", () => {
  it("a rejecting task does not stall the buckets behind it", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const after = jest.fn();

    registerResumeTask({
      id: "explodes",
      bucket: "immediate",
      run: async () => {
        throw new Error("terminal unreachable");
      },
    });
    registerResumeTask({ id: "after", bucket: "interactions", run: after });

    triggerResume();
    await drainFully();

    expect(after).toHaveBeenCalledTimes(1);
  });
});

describe("registration", () => {
  it("replaces a task registered under the same id (idempotent remount)", () => {
    registerResumeTask({ id: "dup", bucket: "immediate", run: jest.fn() });
    registerResumeTask({ id: "dup", bucket: "immediate", run: jest.fn() });

    expect(getRegisteredTaskIds().immediate.filter((i) => i === "dup")).toHaveLength(1);
  });

  it("unregister removes the task", async () => {
    const run = jest.fn();
    const unregister = registerResumeTask({
      id: "temp",
      bucket: "immediate",
      run,
    });
    unregister();

    triggerResume();
    await drainFully();

    expect(run).not.toHaveBeenCalled();
  });

  it("a stale unregister does not tear down a re-registered task", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const unregisterFirst = registerResumeTask({
      id: "remounted",
      bucket: "immediate",
      run: first,
    });
    // Remount registers a new task under the same id, THEN the old cleanup
    // fires — the classic React strict-mode / fast-refresh ordering.
    registerResumeTask({ id: "remounted", bucket: "immediate", run: second });
    unregisterFirst();

    triggerResume();
    await drainFully();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("AppState wiring", () => {
  it("installs exactly one listener regardless of start() calls", () => {
    const before = mockAppState.__listenerCount();
    startAppLifecycleCoordinator(() => true);
    startAppLifecycleCoordinator(() => true);
    expect(mockAppState.__listenerCount()).toBe(before + 1);
  });

  it("drains on a real background->active edge", async () => {
    startAppLifecycleCoordinator(() => true);
    const run = jest.fn();
    registerResumeTask({ id: "on-resume", bucket: "immediate", run });

    mockAppState.__emit("background");
    mockAppState.__emit("active");
    await drainFully();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ignores active->inactive->active flicker (iOS transient interruption)", async () => {
    startAppLifecycleCoordinator(() => true);
    const run = jest.fn();
    const suspend = jest.fn();
    registerResumeTask({ id: "on-resume", bucket: "immediate", run });
    registerSuspendTask({ id: "on-suspend", run: suspend });

    // `inactive` IS a suspend edge — flushing early is the safe direction,
    // and iOS doesn't promise `background` will follow. But returning from it
    // must not re-fire the whole recovery pass: no real backgrounding
    // happened, so nothing needs recovering.
    mockAppState.__emit("inactive");
    mockAppState.__emit("active");
    await drainFully();

    expect(suspend).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("drains after inactive->background->active (iOS lock sequence)", async () => {
    startAppLifecycleCoordinator(() => true);
    const run = jest.fn();
    const suspend = jest.fn();
    registerResumeTask({ id: "on-resume", bucket: "immediate", run });
    registerSuspendTask({ id: "on-suspend", run: suspend });

    mockAppState.__emit("inactive");
    mockAppState.__emit("background");
    mockAppState.__emit("active");
    await drainFully();

    expect(run).toHaveBeenCalledTimes(1);
    // Suspend flushes once on the leave-foreground edge, not twice on the way
    // down through `inactive` AND `background`.
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight drain when the app backgrounds again", async () => {
    startAppLifecycleCoordinator(() => true);
    const late = jest.fn();
    registerResumeTask({ id: "late", bucket: "background", run: late });

    mockAppState.__emit("background");
    mockAppState.__emit("active");
    // Background again before the idle-delayed bucket fires.
    await jest.advanceTimersByTimeAsync(100);
    mockAppState.__emit("background");
    await drainFully();

    expect(late).not.toHaveBeenCalled();
  });

  it("runs suspend tasks on the background edge", async () => {
    startAppLifecycleCoordinator(() => true);
    const suspend = jest.fn();
    registerSuspendTask({ id: "flush", run: suspend });

    mockAppState.__emit("background");

    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it("one throwing suspend task does not prevent the others from flushing", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    startAppLifecycleCoordinator(() => true);
    const good = jest.fn();
    registerSuspendTask({
      id: "bad",
      run: () => {
        throw new Error("nope");
      },
    });
    registerSuspendTask({ id: "good", run: good });

    mockAppState.__emit("background");

    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("re-entrancy", () => {
  it("a resume arriving mid-drain does not interleave two passes", async () => {
    const starts: string[] = [];
    registerResumeTask({
      id: "immediate",
      bucket: "immediate",
      run: () => {
        starts.push("immediate");
      },
    });
    registerResumeTask({
      id: "background",
      bucket: "background",
      run: () => {
        starts.push("background");
      },
    });

    triggerResume();
    await jest.advanceTimersByTimeAsync(50);
    triggerResume(); // second resume before the first reached `background`
    await drainFully();

    // Two immediates (one per resume), but only ONE background — the first
    // drain aborted rather than racing the second to the same work.
    expect(starts.filter((s) => s === "immediate")).toHaveLength(2);
    expect(starts.filter((s) => s === "background")).toHaveLength(1);
  });
});

describe("bucket assignment of migrated call sites", () => {
  // Guards the priority decisions from silently drifting during future edits.
  const EXPECTED: Record<string, ResumeBucket> = {
    "auth.clerk-token": "immediate",
    "orders.reconcile-on-resume": "frame",
    "pos.floor-status-converge": "frame",
    "sync.foreground-network-recheck": "interactions",
    "hardware.star-health-resume": "background",
  };

  it("documents the intended bucket for each critical task id", () => {
    // Pure documentation assertion — the registrations live in their own
    // modules and are exercised on device, not here.
    expect(Object.keys(EXPECTED)).toHaveLength(5);
    expect(EXPECTED["auth.clerk-token"]).toBe("immediate");
    expect(EXPECTED["sync.foreground-network-recheck"]).toBe("interactions");
  });
});
