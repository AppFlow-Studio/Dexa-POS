/**
 * Random delays that spread fleet-wide reactions over time.
 *
 * When Realtime blips, every POS, KDS and kiosk sees it at the same instant.
 * Without jitter they all reconnect, re-join and run their catch-up reads in
 * the same second, which is what exhausts the database connection pool.
 */

/** A random delay in [0, maxMs). */
export function jitterMs(maxMs: number): number {
  if (!(maxMs > 0)) return 0;
  return Math.floor(Math.random() * maxMs);
}

/**
 * `ms` spread by ±`ratio` (clamped to [0, 1]).
 * `withJitter(1000, 0.5)` returns a value in [500, 1500].
 */
export function withJitter(ms: number, ratio: number): number {
  if (!(ms > 0)) return 0;
  if (!(ratio > 0)) return ms;
  const spread = ms * Math.min(ratio, 1);
  return Math.round(ms - spread + Math.random() * 2 * spread);
}
