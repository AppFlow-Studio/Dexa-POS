/**
 * Money <-> SQLite conversion. The ONE implementation, per
 * docs/engineering/architecture/sqlite-offline-first.md §7.1.
 *
 * Why this module exists at all:
 *
 * Remote money columns are Postgres `numeric`, which arrives over the wire as
 * a JS number (or occasionally a string). SQLite has no decimal type — REAL is
 * IEEE-754 floating point, and putting currency through a float is exactly what
 * the project rule forbids (CLAUDE.md: "Money math: decimal.js — never use
 * floating point for currency").
 *
 * So money is stored twice, deliberately, with different jobs:
 *
 *   - `*_minor` INTEGER columns — for SQL to aggregate and sort. Integers are
 *     exact, so SUM() over 10,000 rows is exact.
 *   - `payload` JSON — the server's value, byte-for-byte untouched. EVERY
 *     display path and every value written back to the server reads from here,
 *     through decimal.js, exactly as the app does today.
 *
 * The invariant that keeps those two honest:
 *
 *   >>> A `*_minor` integer is never shown to a human and never sent to the
 *   >>> server. It exists only to make a database index and SUM() work.
 *
 * If a screen ever needs to display a total, it reads payload. If that feels
 * inconvenient, the fix is a selector, not reading the integer.
 */
import Decimal from "decimal.js";

/**
 * Minor units per major unit. USD/CAD cents.
 *
 * Deliberately a named constant rather than an inline `100`: if this product
 * ever ships to a zero-decimal (JPY) or three-decimal (BHD, KWD) currency,
 * this is the single place that changes — and the failure would otherwise be
 * silent rounding rather than a compile error.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

const SCALE = new Decimal(MINOR_UNITS_PER_MAJOR);

/**
 * Server numeric -> INTEGER minor units.
 *
 * Rounds half-up at the minor unit, which matches how the money in this system
 * is already denominated: prices, taxes and totals are all whole cents on the
 * server. A value with sub-cent precision would be a server-side bug, and
 * rounding is the right response to it here — this integer is only ever used
 * for aggregation, and `payload` still carries the original.
 *
 * null/undefined pass through as null so a nullable remote column stays
 * nullable locally instead of silently becoming 0. `0` and `null` mean
 * different things on a payments row.
 */
export function toMinor(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (value === "") return null;
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) return null;
    return d.times(SCALE).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  } catch {
    // A malformed numeric from the server must not take down an entire sync
    // batch. Null it, keep the payload, and let the row land.
    return null;
  }
}

/**
 * INTEGER minor units -> Decimal, for the rare case where an aggregate has to
 * be rendered (a SUM() from analytics, say). Returns Decimal, never number, so
 * the caller cannot accidentally continue in floating point.
 */
export function fromMinor(minor: number | null | undefined): Decimal | null {
  if (minor === null || minor === undefined) return null;
  return new Decimal(minor).dividedBy(SCALE);
}

/**
 * Sum of minor-unit integers. Plain integer addition is already exact, so this
 * exists for intent rather than arithmetic: a reader seeing `sumMinor` knows
 * the values are minor units and that no float was involved.
 */
export function sumMinor(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (v !== null && v !== undefined) total += v;
  }
  return total;
}
