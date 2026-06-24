import { useEffect, useState } from "react";

/**
 * Shared timer tick — one setInterval for the entire floor plan.
 * Each DraggableTable subscribes to the tick and recomputes duration
 * from `opened_at` only when the tick changes.
 *
 * Singleton: the first component to mount starts the interval,
 * the last to unmount stops it.
 *
 * Supports pause/resume: when the table order modal is open,
 * callers can pause the tick to avoid background re-renders.
 */

let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTick = 0;
let paused = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (subscriberCount === 1 && intervalId === null) {
    intervalId = setInterval(() => {
      if (paused) return; // Skip firing listeners when paused
      currentTick++;
      // Copy listeners to a new array in case a listener unsubscribes during iteration
      const batch = Array.from(listeners);
      for (const l of batch) {
        try {
          l();
        } catch (e) {
          // Isolate listener errors so one bad callback doesn't break the tick
          console.error('[useTableTimerTick] Listener error:', e);
        }
      }
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      currentTick = 0;
    }
  };
}

/** Pause tick dispatching (background tables stop re-rendering) */
export function pauseTimerTick() {
  paused = true;
}

/** Resume tick dispatching */
export function resumeTimerTick() {
  paused = false;
}

/**
 * Returns a tick counter that increments every second.
 * Multiple components share a single setInterval.
 */
export function useTableTimerTick(enabled = true): number {
  const [tick, setTick] = useState(currentTick);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(() => setTick(currentTick));
  }, [enabled]);

  return tick;
}
