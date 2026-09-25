/**
 * Human label for an order's table/location, as staff surfaces show it.
 *
 * Bare table names ("6", "T6", "A12") get a prefix: "Table 6". A name that is
 * already descriptive — any label with a space, like a kiosk seat "Table 6 —
 * Seat 2", "Patio Table 4", "Bar Seat 6", or a floor-plan table named
 * "Table 5" — is shown as-is, so no surface ever reads "Table Table 5".
 *
 * `prefix` lets print templates keep their own style ("TABLE: ", "Table: ").
 * Returns "" for an empty name so callers can keep their `x ? … : ""` guards.
 */
export function formatTableLabel(
  name: string | null | undefined,
  prefix = "Table ",
): string {
  const value = (name ?? "").trim();
  if (!value) return "";
  return /\s/.test(value) ? value : `${prefix}${value}`;
}

/** "1" / "12B" → "Table 1" / "Table 12B"; named labels ("Counter") stay as-is. */
function withNumberPrefix(label: string | null | undefined, prefix: string): string {
  const value = (label ?? "").trim();
  if (!value) return "";
  return /^\d\S*$/.test(value) ? `${prefix}${value}` : value;
}

/**
 * A kiosk's dine-in location, e.g. "Table 1, Seat 3" (fixed table and/or
 * seat from the station's kiosk settings). Mirrors
 * `composeKioskLocationLabel` in dexapos-website
 * lib/stations/station-kiosk-settings.ts — keep them identical.
 */
export function composeKioskLocationLabel(
  table: string | null | undefined,
  seat: string | null | undefined,
): string {
  return [withNumberPrefix(table, "Table "), withNumberPrefix(seat, "Seat ")]
    .filter(Boolean)
    .join(", ");
}
