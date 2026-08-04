/**
 * Last-5 alphanumeric characters of a platform order number, uppercased.
 *
 * Delivery platforms surface a short pickup/bag code that is the tail of their
 * order id — e.g. an Uber Eats order id "3cf378ae-…-1f4beb6c424d" prints as
 * "C424D" on the bag label. Stripping non-alphanumerics first keeps the code
 * clean when the source is a dashed UUID or a prefixed code.
 *
 * Returns null when there is nothing usable to shorten.
 */
export function platformShortCode(
  platformOrderNumber?: string | null,
): string | null {
  const p = platformOrderNumber?.trim();
  if (!p) return null;
  const alnum = p.replace(/[^a-z0-9]/gi, "");
  return alnum ? alnum.slice(-5).toUpperCase() : null;
}

/**
 * The platform short code to display for an online order, or null when the
 * `platform_order_number` is not a usable marketplace value.
 *
 * Delivery-platform orders (DoorDash/UberEats/Grubhub) reference the
 * marketplace's own order — so when a usable `platform_order_number` exists we
 * show its last-5 short code (see {@link platformShortCode}), matching the code
 * the driver/customer sees. That includes bare UUIDs: an Uber id echoed as a
 * UUID still yields the correct bag code from its tail.
 *
 * `platform_order_number` is not always a real marketplace value, though:
 *   - first-party online-store orders carry a synthetic `dexa-<uuid>` id, and
 *   - some integrations echo the order's internal UUID back into the field.
 * Neither is meaningful to staff, so those cases return null (callers fall back
 * to the Dexa number). This guard is the single source of truth shared by the
 * receipt renderer, online-order cards, and KDS so they always agree.
 */
export function onlineOrderShortCode(order: {
  id: string;
  db_order_id?: string | null;
  platform_order_number?: string | null;
}): string | null {
  const platform = order.platform_order_number?.trim();
  const isUsablePlatformNumber =
    !!platform &&
    platform !== order.id &&
    platform !== order.db_order_id &&
    !platform.startsWith("dexa-");

  return isUsablePlatformNumber ? platformShortCode(platform) : null;
}

/**
 * Resolve the human-facing order label for an online-order surface: the
 * platform short code when usable ({@link onlineOrderShortCode}), else the Dexa
 * number (#0008).
 */
export function resolveOrderLabel(order: {
  id: string;
  db_order_id?: string | null;
  display_number?: string | null;
  order_number?: string | null;
  platform_order_number?: string | null;
}): string {
  const dexaNumber = order.display_number || order.order_number || order.id;
  const dexaLabel = dexaNumber.startsWith("#") ? dexaNumber : `#${dexaNumber}`;

  return onlineOrderShortCode(order) ?? dexaLabel;
}
