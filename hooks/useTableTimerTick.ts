import { useEffect, useRef, useState } from "react";
import { AppState, type NativeEventSubscription } from "react-native";

/**
 * Shared timer tick — one setInterval for the entire floor plan.
 * Each DraggableTable subscribes to the tick and recomputes duration
 * from `opened_at` only when the tick changes.
 *
 * **RAF-batched dispatch**: At scale (400+ tables), firing all listeners
 * synchronously from the interval callback causes 400 simultaneous
 * `setState` calls in one microtask, janking the JS thread. Instead,
 * listeners are dispatched in micro-batches of 50 per requestAnimationFrame
 * frame, spreading the re-render cost across ~8 frames.
 *
 * Singleton: the first component to mount starts the interval,
 * the last to unmount stops it.
 *
 * Supports pause/resume: when the table order modal is open,
 * callers can pause the tick to avoid background re-renders.
 */

const BATCH_SIZE = 50;
const FIRE_DELAY_MS = 60_000;
let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTick = 0;
let paused = false;
let backgrounded = AppState.currentState !== "active";
let appStateSub: NativeEventSubscription | null = null;
let rafId: number | null = null;
let pendingListeners: (() => void)[] = [];

const listeners = new Set<() => void>();

function dispatchBatch() {
  rafId = null;
  if (paused) {
    // If paused mid-batch, clear the pending queue so we don't fire stale
    // updates when resumed — components will re-render from the next tick.
    pendingListeners = [];
    return;
  }
  const batch = pendingListeners.splice(0, BATCH_SIZE);
  for (const l of batch) {
    try {
      l();
    } catch (e) {
      console.error("[useTableTimerTick] Listener error:", e);
    }
  }
  if (pendingListeners.length > 0) {
    rafId = requestAnimationFrame(dispatchBatch);
  }
}

function fireAll() {
  if (paused || backgrounded) return;
  currentTick++;
  // Copy listeners to a new array for safety during iteration
  pendingListeners = Array.from(listeners);
  if (pendingListeners.length === 0) return;
  // Start RAF-batched dispatch
  rafId = requestAnimationFrame(dispatchBatch);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (subscriberCount === 1 && intervalId === null) {
    intervalId = setInterval(fireAll, FIRE_DELAY_MS);
    // AppState-aware: while backgrounded/idle the interval still ticks (RN
    // timers keep running), but firing it re-renders 400+ tables and allocates
    // a fresh listener array every 60s for nothing the user can see — idle
    // churn that piles up until a touch forces a render/GC. Suspend firing when
    // not active; on return to foreground fire once immediately so every table's
    // duration jumps to the correct elapsed time instead of waiting up to 60s.
    backgrounded = AppState.currentState !== "active";
    appStateSub = AppState.addEventListener("change", (next) => {
      const wasBackgrounded = backgrounded;
      backgrounded = next !== "active";
      if (wasBackgrounded && !backgrounded) fireAll();
    });
  }
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      if (appStateSub !== null) {
        appStateSub.remove();
        appStateSub = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingListeners = [];
      currentTick = 0;
    }
  };
}

/** Pause tick dispatching (background tables stop re-rendering) */
export function pauseTimerTick() {
  paused = true;
  // Cancel any in-flight RAF batch so paused state takes effect immediately
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingListeners = [];
}

/** Resume tick dispatching */
export function resumeTimerTick() {
  paused = false;
}

/**
 * Returns a tick counter that increments every ~60s.
 * Multiple components share a single setInterval + RAF-batched dispatch.
 *
 * At 400+ subscribers, the dispatch spreads `setTick` calls across
 * ~8 animation frames instead of firing all at once.
 */
export function useTableTimerTick(enabled = true): number {
  const [tick, setTick] = useState(currentTick);
  // Use a ref to avoid the stale closure problem: the subscribe callback
  // reads `currentTick` at call time, not at subscribe time.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    return subscribe(() => {
      // The listener captures currentTick by reading the module-level
      // variable at fire time — no stale closure.
      if (enabledRef.current) {
        setTick(currentTick);
      }
    });
  }, [enabled]);

  return tick;
}
