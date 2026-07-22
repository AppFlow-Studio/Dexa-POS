// Canonical orders.order_source taxonomy for reporting:
// pos | kiosk | online_store | orderout.
// Legacy rows may still carry online/in_store/phone until the DB backfill runs.
export const CANONICAL_ORDER_SOURCES = [
  "pos",
  "kiosk",
  "online_store",
  "orderout",
] as const;

export type CanonicalOrderSource = (typeof CANONICAL_ORDER_SOURCES)[number];

// "Online" for surfacing purposes remains first-party online store + OrderOut,
// plus legacy online rows for read compatibility. Kiosk is intentionally not in
// this set; reports and sounds treat it as its own channel.
export const ONLINE_ORDER_SOURCES = ["online", "orderout", "online_store"] as const;

const ONLINE_SET = new Set<string>(ONLINE_ORDER_SOURCES);

export function isOnlineOrderSource(source?: string | null): boolean {
  return !!source && ONLINE_SET.has(source.toLowerCase());
}

export function normalizeOrderSourceChannel(
  source?: string | null,
): CanonicalOrderSource {
  const normalized = (source ?? "").trim().toLowerCase();
  if (normalized === "kiosk") return "kiosk";
  if (normalized === "orderout") return "orderout";
  if (normalized === "online" || normalized === "online_store")
    return "online_store";
  return "pos";
}

export function isKioskOrderSource(source?: string | null): boolean {
  return normalizeOrderSourceChannel(source) === "kiosk";
}
