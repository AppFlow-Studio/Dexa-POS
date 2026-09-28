import { useSyncExternalStore } from "react";

/**
 * One clock for the whole handheld. Every mounted page used to own a 60 s
 * interval, each started whenever that page mounted — six unaligned timers,
 * so elapsed labels changed at six different moments a minute and each tick
 * re-rendered one list. This is a single timeout chain aligned to the minute
 * boundary, running only while something is subscribed: every "25m" on
 * screen advances together, once, at :00.
 */

const MINUTE = 60_000;
const floorMinute = (ms: number) => ms - (ms % MINUTE);

let now = floorMinute(Date.now());
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function schedule() {
  timer = setTimeout(() => {
    now = floorMinute(Date.now());
    listeners.forEach((l) => l());
    schedule();
  }, MINUTE - (Date.now() % MINUTE));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = floorMinute(Date.now());
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// While stopped, read the current minute so a page opened after a long idle
// never paints a stale time; within a minute it is the same value on every
// call, as useSyncExternalStore requires.
const getSnapshot = () => (timer ? now : floorMinute(Date.now()));

/**
 * A timestamp that advances once a minute, on the minute. Screens pass it to
 * their rows (and to FlashList's `extraData`) so elapsed-time labels tick
 * without every row owning an interval.
 */
export function useMinuteTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
