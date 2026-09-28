/**
 * Low-battery rules for the handheld, as pure functions. A tablet stays
 * plugged in; a handheld does not, and a server whose device dies mid-shift
 * strands their open tables on a station nobody is holding. The sheet asks
 * them to hand the tables off while there is still time.
 */

/** Levels (percent) that open the sheet, highest first. Each shows once per discharge. */
export const LOW_BATTERY_STEPS: readonly number[] = [10, 5];

/** The lowest step `percent` has reached, or null above them all. */
export function lowStep(percent: number | null): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  let hit: number | null = null;
  for (const step of LOW_BATTERY_STEPS) if (percent <= step) hit = step;
  return hit;
}

/**
 * Whether the sheet should be up: unplugged, at a step, and a lower step
 * than the last one the server already saw (`seen`, Infinity when none).
 */
export function shouldPrompt(percent: number | null, charging: boolean, seen: number): boolean {
  if (charging) return false;
  const step = lowStep(percent);
  return step !== null && step < seen;
}

export interface BatterySample {
  /** ms since epoch */
  at: number;
  percent: number;
}

/** Below this much history, or this small a drop, a drain rate is a guess. */
const MIN_SPAN_MINUTES = 10;
const MIN_DROP = 2;

/**
 * "About 20 minutes left", from the drain since the device was unplugged:
 * the level over the observed rate, rounded to 5 minutes. Null until there
 * is enough history to say anything honest — the sheet then leaves the
 * estimate out rather than inventing one.
 */
export function estimateMinutesLeft(samples: readonly BatterySample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const minutes = (last.at - first.at) / 60_000;
  const drop = first.percent - last.percent;
  if (minutes < MIN_SPAN_MINUTES || drop < MIN_DROP) return null;
  const left = last.percent / (drop / minutes);
  return Math.max(5, Math.round(left / 5) * 5);
}
