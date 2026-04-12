import { DateTime } from 'luxon';

export interface BusinessDayConfig {
  timezone: string;          // e.g., 'America/New_York'
  rolloverHour: number;      // 0-23, e.g., 4 for 4am rollover
}

/**
 * Returns the current business day as 'YYYY-MM-DD' in the merchant's timezone.
 * If the current local time is before the rollover hour, we're still on
 * yesterday's business day (e.g., 3am with 4am rollover = yesterday).
 */
export function getCurrentBusinessDay(config: BusinessDayConfig): string {
  const now = DateTime.now().setZone(config.timezone);
  if (!now.isValid) {
    throw new Error(`Invalid timezone: ${config.timezone}`);
  }
  const businessDay = now.hour < config.rolloverHour
    ? now.minus({ days: 1 })
    : now;
  return businessDay.toISODate()!;
}

/**
 * Returns the business day for a specific timestamp. Used to bucket
 * historical orders into the right day for cache filtering.
 */
export function getBusinessDayForTimestamp(
  timestamp: string | Date,
  config: BusinessDayConfig
): string {
  const dt = (typeof timestamp === 'string'
    ? DateTime.fromISO(timestamp)
    : DateTime.fromJSDate(timestamp)
  ).setZone(config.timezone);

  if (!dt.isValid) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  const businessDay = dt.hour < config.rolloverHour
    ? dt.minus({ days: 1 })
    : dt;
  return businessDay.toISODate()!;
}

/**
 * Returns the start and end timestamps (UTC ISO) for a given business day.
 * Useful for client-side filtering of cached order arrays.
 */
export function getBusinessDayBounds(
  businessDay: string,  // 'YYYY-MM-DD'
  config: BusinessDayConfig
): { startUtc: string; endUtc: string } {
  const start = DateTime.fromISO(businessDay, { zone: config.timezone })
    .plus({ hours: config.rolloverHour });
  const end = start.plus({ days: 1 });

  return {
    startUtc: start.toUTC().toISO()!,
    endUtc: end.toUTC().toISO()!,
  };
}

/**
 * Detects clock drift by comparing local computation against server truth.
 * Returns drift info. Log a warning if drifted.
 */
export function detectClockDrift(
  serverBusinessDay: string,
  config: BusinessDayConfig
): { drifted: boolean; localDay: string; serverDay: string } {
  const localDay = getCurrentBusinessDay(config);
  return {
    drifted: localDay !== serverBusinessDay,
    localDay,
    serverDay: serverBusinessDay,
  };
}
