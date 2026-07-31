const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the human-facing order number for an online-order card.
 *
 * Delivery-platform orders (DoorDash/UberEats/Grubhub) show the marketplace's
 * own order number — that's what the driver/customer reference. But
 * `platform_order_number` is NOT always a real marketplace code:
 *   - first-party online-store orders carry a synthetic `dexa-<uuid>` id, and
 *   - some integrations echo the order's internal UUID back into the field.
 * Neither is meaningful to staff, so we fall back to the Dexa number (#0008)
 * whenever the platform value is a bare UUID or the synthetic first-party id.
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

  const platform = order.platform_order_number?.trim();
  const isMeaningfulPlatformNumber =
    !!platform &&
    platform !== order.id &&
    platform !== order.db_order_id &&
    !platform.startsWith("dexa-") &&
    !UUID_RE.test(platform);

  return isMeaningfulPlatformNumber ? platform : dexaLabel;
}
