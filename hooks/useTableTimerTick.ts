import { useEffect, useState } from "react";

/**
 * Shared timer tick — one setInterval for the entire floor plan.
 * Each DraggableTable subscribes to the tick and recomputes duration
 * from `opened_at` only when the tick changes.
 *
 * Singleton: the first component to mount starts the interval,
 * the last to unmount stops it.
 */

let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTick = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (subscriberCount === 1 && intervalId === null) {
    intervalId = setInterval(() => {
      currentTick++;
      for (const l of listeners) l();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Returns a tick counter that increments every second.
 * Multiple components share a single setInterval.
 */
export function useTableTimerTick(): number {
  const [tick, setTick] = useState(currentTick);

  useEffect(() => {
    return subscribe(() => setTick(currentTick));
  }, []);

  return tick;
}
