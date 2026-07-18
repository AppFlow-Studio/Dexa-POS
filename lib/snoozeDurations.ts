import { DateTime } from 'luxon'
import { getBusinessDayBounds, getCurrentBusinessDay } from '@/lib/businessDay'

/**
 * 86 / snooze duration options offered in the SnoozeBottomSheet.
 * `custom` carries a caller-supplied absolute Date.
 */
export type SnoozeOption =
  | { kind: 'hours'; hours: number }
  | { kind: 'end_of_day' }
  | { kind: 'until_manual' }
  | { kind: 'custom'; date: Date }

/** Special sentinel meaning "86 until manually restored". */
export const SNOOZE_INFINITY = 'infinity'

/**
 * Resolve a duration option to the value the `set_item_snooze_v1` RPC expects.
 *
 * Returns:
 *   - an absolute UTC ISO string for timed 86s (server compares to `now()` in UTC)
 *   - `'infinity'` for "until manual"
 *
 * `timezone` / `businessDayStartHour` come from the selected location and are
 * only used for the "end of day" boundary.
 */
export function computeSnoozeUntil (
  option: SnoozeOption,
  timezone: string,
  businessDayStartHour = 0
): string {
  switch (option.kind) {
    case 'hours':
      return DateTime.now().plus({ hours: option.hours }).toUTC().toISO()!
    case 'end_of_day': {
      const config = { timezone, rolloverHour: businessDayStartHour }
      const day = getCurrentBusinessDay(config)
      // End of the current business day = the next rollover boundary.
      return getBusinessDayBounds(day, config).endUtc
    }
    case 'until_manual':
      return SNOOZE_INFINITY
    case 'custom':
      return DateTime.fromJSDate(option.date).toUTC().toISO()!
  }
}

/**
 * True when a `snoozed_until` value represents an ACTIVE 86 (i.e. the item is
 * currently hidden). Mirrors the website's `isActivelySnoozed`.
 */
export function isActivelySnoozed (snoozedUntil?: string | null): boolean {
  if (!snoozedUntil) return false
  if (snoozedUntil === SNOOZE_INFINITY) return true
  const dt = DateTime.fromISO(snoozedUntil)
  return dt.isValid && dt.toMillis() > Date.now()
}

/**
 * Short badge text for an active 86, e.g. `"2h 14m"`, `"46m"`, or `"86"` for an
 * indefinite (until-manual) snooze. Returns null when not actively snoozed.
 */
export function formatSnoozeCountdown (
  snoozedUntil?: string | null
): string | null {
  if (!isActivelySnoozed(snoozedUntil)) return null
  if (snoozedUntil === SNOOZE_INFINITY) return '86'

  const diffMs = DateTime.fromISO(snoozedUntil as string).toMillis() - Date.now()
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
