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
