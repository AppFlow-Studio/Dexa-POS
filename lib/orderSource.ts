// orders.order_source taxonomy: pos | in_store | orderout | online_store | phone
// (+ legacy 'online' rows written before the website's 20260702120001 migration
// derived order_source from the provider). "Online" for surfacing purposes =
// any customer-originated online channel.
export const ONLINE_ORDER_SOURCES = ["online", "orderout", "online_store"] as const;

const ONLINE_SET = new Set<string>(ONLINE_ORDER_SOURCES);

export function isOnlineOrderSource(source?: string | null): boolean {
  return !!source && ONLINE_SET.has(source.toLowerCase());
}
