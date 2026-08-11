/**
 * Pure filter / sort / taxonomy helpers for the Previous Orders list.
 *
 * The screen's old toolbar mixed a status filter, channel filters and sort keys
 * into one horizontally-scrolling pill strip. This module splits that taxonomy
 * into three orthogonal axes so the UI can render each one in its own control:
 *
 *   - channel tab   (all | online | dine_in | takeout | delivery)  — mutually
 *     exclusive partition of the list, so tab counts always sum to All.
 *   - status filter (all | paid | unpaid | refunded | voided)
 *   - sort key      (date/amount × asc/desc)
 *
 * Provider identity (Uber Eats / DoorDash / Grubhub / House) is resolved ONLY
 * through `resolveOrderPlatformLogo` — never by raw string equality on
 * `delivery_platform`, which arrives in inconsistent casing from the backend.
 */
import { deriveEffectivePaidStatus } from "@/lib/deriveEffectivePaidStatus";
import { resolveOrderPlatformLogo } from "@/lib/orderPlatformResolver";
import { isOnlineOrderSource } from "@/lib/orderSource";
import type { OrderProfile } from "@/lib/types";

// ─── Channel tabs ───────────────────────────────────────────

export type ChannelTab = "all" | "online" | "dine_in" | "takeout" | "delivery";

export const CHANNEL_TABS: { key: ChannelTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "dine_in", label: "Dine-In" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

/**
 * `order_type` reaches this screen in two shapes: the backend enum
 * (`dine_in` / `takeout` / `delivery`) and the legacy display casing
 * (`Dine In` / `Takeaway` / `Delivery`) written by broadcast transforms.
 * Normalize both, otherwise counts and filters disagree.
 */
export function normalizeOrderType(
  raw: string | null | undefined,
): "dine_in" | "takeout" | "delivery" {
  switch ((raw || "").toLowerCase().replace(/[\s-]+/g, "_")) {
    case "dine_in":
    // QR table ordering writes `qr_dine_in`.
    case "qr_dine_in":
      return "dine_in";
    case "delivery":
      return "delivery";
    case "takeout":
    case "takeaway":
    case "to_go":
      return "takeout";
    default:
      return "takeout";
  }
}

/**
 * The tab an order belongs to. Online wins over its fulfilment type (a DoorDash
 * order is `delivery`, but merchants think of it as an Online order), which
 * makes the five tabs a true partition: Online + Dine-In + Takeaway + Delivery
 * === All.
 */
export function getChannelTab(
  order: OrderProfile,
): Exclude<ChannelTab, "all"> {
  if (order._isOnlineOrder) return "online";
  return normalizeOrderType(order.order_type);
}

// ─── Providers ──────────────────────────────────────────────

/**
 * "house" = an online order that isn't a marketplace (website / app / kiosk):
 * the merchant's own direct channel. "other" catches anything the resolver
 * can't place, so an unknown integration is still filterable instead of
 * silently unreachable.
 */
export type ProviderKey =
  | "ubereats"
  | "doordash"
  | "grubhub"
  | "house"
  | "other";

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  ubereats: "Uber Eats",
  doordash: "DoorDash",
  grubhub: "Grubhub",
  house: "House",
  other: "Other",
};

/** Display order of the provider chip row (marketplaces first, then direct). */
const PROVIDER_ORDER: ProviderKey[] = [
  "ubereats",
  "doordash",
  "grubhub",
  "house",
  "other",
];

/**
 * Provider for an online order, or null when the order isn't online.
 * Always goes through the shared casing-normalizing resolver.
 */
export function getProviderKey(order: OrderProfile): ProviderKey | null {
  if (!order._isOnlineOrder) return null;
  const resolved = resolveOrderPlatformLogo({
    deliveryPlatform: order.delivery_platform,
    orderSource: order.order_source,
  });
  switch (resolved.kind) {
    case "marketplace":
      // Resolver only labels these three as marketplaces today.
      return (resolved.provider as ProviderKey) ?? "other";
    case "first_party":
      return "house";
    default:
      // The merchant's own storefront resolves to a generic "Online" badge (no
      // marketplace to name), but for filtering it belongs with the direct
      // channels rather than in the catch-all bucket.
      return order.order_source === "online_store" ? "house" : "other";
  }
}

/**
 * The chip roster for the Online tab: every provider observed in the current
 * date window, in canonical display order. Chips stay visible at (0) once the
 * provider appears anywhere in the window, so a status filter or search that
 * empties a provider doesn't make its chip vanish mid-interaction.
 *
 * A merchant with no online integrations produces an empty roster and the row
 * is dropped entirely.
 *
 * TODO(integrations): when per-location integration enablement lands, seed this
 * from the location config so an enabled-but-idle provider shows at (0) before
 * its first order — the union below already handles the merge.
 */
export function buildProviderRoster(orders: OrderProfile[]): ProviderKey[] {
  const seen = new Set<ProviderKey>();
  for (const order of orders) {
    const key = getProviderKey(order);
    if (key) seen.add(key);
  }
  return PROVIDER_ORDER.filter((key) => seen.has(key));
}

// ─── Status ─────────────────────────────────────────────────

export type StatusFilter = "all" | "paid" | "unpaid" | "refunded" | "voided";

export const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "refunded", label: "Refunded" },
  { key: "voided", label: "Voided" },
];

export function isVoided(order: OrderProfile): boolean {
  return order.order_status === "void";
}

export function isRefunded(order: OrderProfile): boolean {
  return (
    order.order_status === "refunded" ||
    (order.payments || []).some((p) => (p.refundedAmount ?? 0) > 0)
  );
}

export function matchesStatus(
  order: OrderProfile,
  status: StatusFilter,
): boolean {
  if (status === "all") return true;
  if (status === "voided") return isVoided(order);
  if (status === "refunded") return isRefunded(order);
  if (isVoided(order)) return false;
  const effective = deriveEffectivePaidStatus(order) ?? order.paid_status;
  return status === "paid" ? effective === "Paid" : effective !== "Paid";
}

// ─── Sort ───────────────────────────────────────────────────

export type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date_desc", label: "Date newest" },
  { key: "date_asc", label: "Date oldest" },
  { key: "amount_desc", label: "Amount high–low" },
  { key: "amount_asc", label: "Amount low–high" },
];

export function compareOrders(
  a: OrderProfile,
  b: OrderProfile,
  sort: SortKey,
): number {
  switch (sort) {
    case "date_asc":
    case "date_desc": {
      const ta = new Date(a.opened_at || 0).getTime();
      const tb = new Date(b.opened_at || 0).getTime();
      return sort === "date_asc" ? ta - tb : tb - ta;
    }
    case "amount_asc":
    case "amount_desc": {
      const va = a.total_amount || 0;
      const vb = b.total_amount || 0;
      return sort === "amount_asc" ? va - vb : vb - va;
    }
    default:
      return 0;
  }
}

// ─── Window-wide counts ─────────────────────────────────────

/**
 * Same shape as `HistoryOrderSummary` from orderService, restated structurally
 * so this module stays free of service imports.
 */
export interface OrderSummaryLike {
  order_type: string | null;
  order_source: string | null;
  delivery_platform: string | null;
  status: string | null;
  payment_status: string | null;
}

/**
 * Channel/provider bucketing for a summary row. Mirrors `getChannelTab` /
 * `getProviderKey` but reads the raw columns, since summaries never carry the
 * derived `_isOnlineOrder` flag.
 */
function summaryChannel(row: OrderSummaryLike): Exclude<ChannelTab, "all"> {
  if (isOnlineOrderSource(row.order_source)) return "online";
  return normalizeOrderType(row.order_type);
}

function summaryProvider(row: OrderSummaryLike): ProviderKey | null {
  if (!isOnlineOrderSource(row.order_source)) return null;
  const resolved = resolveOrderPlatformLogo({
    deliveryPlatform: row.delivery_platform,
    orderSource: row.order_source,
  });
  if (resolved.kind === "marketplace") {
    return (resolved.provider as ProviderKey) ?? "other";
  }
  if (resolved.kind === "first_party") return "house";
  return row.order_source === "online_store" ? "house" : "other";
}

function summaryMatchesStatus(
  row: OrderSummaryLike,
  status: StatusFilter,
): boolean {
  if (status === "all") return true;
  const voided = row.status === "void";
  if (status === "voided") return voided;
  const refunded =
    row.status === "refunded" || row.payment_status === "refunded";
  if (status === "refunded") return refunded;
  if (voided) return false;
  const paid = row.payment_status === "paid";
  return status === "paid" ? paid : !paid;
}

/**
 * Channel-tab counts over the WHOLE date window. The list itself is paginated
 * 30 rows at a time, so counting `previousOrders` reports only what's loaded —
 * a two-month window showed "Online 6" when the range held far more. These come
 * from the discriminator-only summary fetch instead.
 *
 * Search is excluded on purpose: summaries carry no customer name or phone, and
 * a tab count that silently ignored the active search would be worse than one
 * that reflects the whole window.
 */
export function countChannelsFromSummaries(
  summaries: OrderSummaryLike[],
  status: StatusFilter,
): Record<ChannelTab, number> {
  const counts: Record<ChannelTab, number> = {
    all: 0,
    online: 0,
    dine_in: 0,
    takeout: 0,
    delivery: 0,
  };
  for (const row of summaries) {
    if (!summaryMatchesStatus(row, status)) continue;
    counts.all++;
    counts[summaryChannel(row)]++;
  }
  return counts;
}

export function countProvidersFromSummaries(
  summaries: OrderSummaryLike[],
  status: StatusFilter,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of summaries) {
    if (!summaryMatchesStatus(row, status)) continue;
    const key = summaryProvider(row);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Provider chip roster over the whole window, in canonical display order. */
export function buildProviderRosterFromSummaries(
  summaries: OrderSummaryLike[],
): ProviderKey[] {
  const seen = new Set<ProviderKey>();
  for (const row of summaries) {
    const key = summaryProvider(row);
    if (key) seen.add(key);
  }
  return PROVIDER_ORDER.filter((key) => seen.has(key));
}

// ─── Search ─────────────────────────────────────────────────

/**
 * Matches order #, customer name, phone (digits-only so formatted and raw
 * queries both hit) and provider name — typing "doordash" finds DoorDash
 * orders.
 */
export function matchesSearch(order: OrderProfile, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const customer = (order.customer_name || "walk-in").toLowerCase();
  if (customer.includes(q)) return true;

  const displayNumber = String(order.display_number || "").toLowerCase();
  if (displayNumber.includes(q)) return true;

  const provider = getProviderKey(order);
  if (provider && PROVIDER_LABELS[provider].toLowerCase().includes(q)) {
    return true;
  }
  // "ubereats" / "uber_eats" typed without the space still matches "Uber Eats".
  if (provider && PROVIDER_LABELS[provider].toLowerCase().replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))) {
    return true;
  }

  const queryDigits = q.replace(/\D/g, "");
  if (queryDigits && order.customer_phone) {
    if (order.customer_phone.replace(/\D/g, "").includes(queryDigits)) {
      return true;
    }
  }
  return false;
}
