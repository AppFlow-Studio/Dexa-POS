/**
 * Long-task detection via event-loop drift (Hermes has no
 * PerformanceObserver('longtask')).
 *
 * A 50ms heartbeat interval measures how late each tick fires. If the
 * callback runs 180ms late, something blocked the JS thread for ~180ms —
 * drift IS the user's frozen tap, quantified. Samples above the threshold
 * are recorded with route + stringify/broadcast/flush overlap attribution
 * (the persist-vs-render arbiter).
 *
 * Must be paused when AppState != active (init.ts owns that): Android
 * throttles background intervals, which would otherwise produce phantom
 * multi-second "drifts" on resume. start() re-anchors, so pause/resume never
 * fabricates a sample.
 */
import {
  buildLongTaskAttr,
  isTelemetryEnabled,
  recordWatcherSample,
} from "@/lib/telemetry/registry";
import { KEY_LONGTASK } from "@/lib/telemetry/keys";

export const TICK_MS = 50;
export const DRIFT_THRESHOLD_MS = 100;

let timer: ReturnType<typeof setInterval> | null = null;
let expected = 0;

function tick(): void {
  const now = Date.now();
  const drift = now - expected;
  if (drift > DRIFT_THRESHOLD_MS && isTelemetryEnabled()) {
    recordWatcherSample(KEY_LONGTASK, drift, buildLongTaskAttr(now, drift));
  }
  // Re-anchor rather than accumulate — each tick measures only its own delay.
  expected = now + TICK_MS;
}

export function startWatcher(): void {
  if (timer !== null) return;
  expected = Date.now() + TICK_MS;
  timer = setInterval(tick, TICK_MS);
}

export function stopWatcher(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

export function isWatcherRunning(): boolean {
  return timer !== null;
}

/** Test-only: run one tick against the current clock without the interval. */
export function __tickForTests(): void {
  tick();
}
