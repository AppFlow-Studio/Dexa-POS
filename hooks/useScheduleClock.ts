import { useMemo, useSyncExternalStore } from "react";
import { AppState, type NativeEventSubscription } from "react-native";

/**
 * The wall clock, to the minute, for menu / category schedule checks.
 *
 * Schedule availability depends on time, but the store getters are stable
 * function references — a `useMemo` keyed on them never re-runs just because
 * lunch ended. Every surface that hides off-schedule menus/categories (POS
 * grid, category tabs, POS search, kiosk browse + search, menu management)
 * reads this instead and passes it as `at`, so the memo input is the real one.
 *
 * One shared timer, aligned to the minute boundary so a window that closes at
 * 14:00 flips at 14:00:00, not up to 59s late. Stopped while the app is
 * backgrounded; on foreground the value jumps straight to "now".
 *
 * Deliberately separate from useTableTimerTick: the Tables screen pauses that
 * tick whenever it loses focus — i.e. exactly when staff open order entry.
 */

const MINUTE_MS = 60_000;
const floorToMinute = (ms: number) => ms - (ms % MINUTE_MS);

let current = floorToMinute(Date.now());
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: NativeEventSubscription | null = null;
const listeners = new Set<() => void>();

function refresh() {
  const next = floorToMinute(Date.now());
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function stopTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext() {
  stopTimer();
  // A few ms past the boundary so floorToMinute lands on the new minute.
  const delay = MINUTE_MS - (Date.now() % MINUTE_MS) + 50;
  timer = setTimeout(() => {
    timer = null;
    refresh();
    scheduleNext();
  }, delay);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    if (AppState.currentState !== "background") scheduleNext();
    appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
        scheduleNext();
      } else if (state === "background") {
        stopTimer();
      }
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopTimer();
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

function getSnapshot() {
  // Nobody is listening, so nothing keeps `current` fresh — catch it up.
  if (listeners.size === 0) current = floorToMinute(Date.now());
  return current;
}

/** Current time floored to the minute; re-renders when the minute changes. */
export function useScheduleClock(): Date {
  const minute = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => new Date(minute), [minute]);
}
