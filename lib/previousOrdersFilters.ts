/**
 * Previous Orders taxonomy — the view layer's entry point.
 *
 * The screen's toolbar splits the taxonomy into three orthogonal axes so each
 * one gets its own control:
 *
 *   - channel tab   (all | online | dine_in | takeout | delivery)  — a true
 *     partition of the window, so tab counts always sum to All.
 *   - status filter (all | paid | unpaid | refunded | voided)
 *   - sort key      (date/amount × asc/desc)
 *
 * Filtering, sorting, searching and paging are all SERVER-side; this module no
 * longer carries a client-side filter pass, because one scoped to the loaded
 * page silently re-narrowed results the server had already chosen.
 *
 * What remains is the count/badge side of the taxonomy, and it is deliberately
 * a thin shell over `services/historyOrderTaxonomy.ts` — the same rule table the
 * SQL is generated from. Do not add a bucketing rule here: a second definition
 * is exactly what made a chip read "DoorDash (3)" over an empty list.
 */
import {
  classifyChannel,
  classifyProvider,
  matchesStatusFilter,
  normalizeOrderTypeToken,
  PROVIDER_ORDER,
  type ChannelTab,
  type ProviderKey,
  type StatusFilter,
  type TaxonomyRow,
} from "@/services/historyOrderTaxonomy";
import type { OrderProfile } from "@/lib/types";

export {
  CHANNEL_TABS,
  PROVIDER_LABELS,
  STATUS_OPTIONS,
  type ChannelTab,
  type ProviderKey,
  type StatusFilter,
} from "@/services/historyOrderTaxonomy";

// ─── Sort ───────────────────────────────────────────────────

export type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date_desc", label: "Date newest" },
  { key: "date_asc", label: "Date oldest" },
  { key: "amount_desc", label: "Amount high–low" },
  { key: "amount_asc", label: "Amount low–high" },
];

// ─── Row-level identity (badges) ────────────────────────────

/**
 * The provider to name on a row, or null when the row isn't an online order.
 *
 * Reads the same columns the chips and the query read, so a row badged
 * "DoorDash" is a row the DoorDash chip both counts and returns.
 *
 * `_isOnlineOrder` gates it rather than `order_source` alone: it is
 * `order_source OR an online_orders join row` (see lib/fetchedOrderPlatform.ts),
 * which is the more generous of the two. An order that is online only by its
 * join row still sits on the Takeaway tab, since no SQL predicate over `orders`
 * can see that join — the badge is right, the tab reflects the data as stored.
 */
export function getProviderKey(order: OrderProfile): ProviderKey | null {
  if (!order._isOnlineOrder) return null;
  return classifyProvider(toTaxonomyRow(order)) ?? classifyOnlineFallback(order);
}

/**
 * `classifyProvider` returns null for a row whose `order_source` isn't online.
 * That happens only for the join-row case above, where the order IS online but
 * the column doesn't say so — treat it as online and bucket it by platform.
 */
function classifyOnlineFallback(order: OrderProfile): ProviderKey {
  return (
    classifyProvider({
      ...toTaxonomyRow(order),
      order_source: "online",
    }) ?? "other"
  );
}

/**
 * Only the columns that decide channel/provider. `order_status` / `paid_status`
 * are deliberately omitted: on an OrderProfile they hold display values
 * ("Paid", "void") rather than the DB enum the status predicates compare
 * against, and feeding them in would look comparable while quietly not being.
 */
function toTaxonomyRow(order: OrderProfile): TaxonomyRow {
  return {
    order_type: normalizeOrderTypeToken(order.order_type),
    order_source: order.order_source ?? null,
    delivery_platform: order.delivery_platform ?? null,
  };
}

// ─── Window-wide counts ─────────────────────────────────────

/**
 * Same shape as `HistoryOrderSummary` from orderService, restated structurally
 * so this module stays free of service-layer row types.
 */
export interface OrderSummaryLike extends TaxonomyRow {
  order_type: string | null;
  order_source: string | null;
  delivery_platform: string | null;
  status: string | null;
  payment_status: string | null;
}

/**
 * Channel-tab counts over the WHOLE date window. The list itself is paginated
 * 50 rows at a time, so counting `previousOrders` reports only what's loaded —
 * a two-month window showed "Online 6" when the range held far more. These come
 * from the discriminator-only summary fetch instead.
 *
 * Search and status are already applied to that fetch server-side, so `status`
 * here is normally "all"; it exists for callers that hold summaries fetched
 * without a status constraint.
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
    if (!matchesStatusFilter(row, status)) continue;
    counts.all++;
    counts[classifyChannel(row)]++;
  }
  return counts;
}

export function countProvidersFromSummaries(
  summaries: OrderSummaryLike[],
  status: StatusFilter,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of summaries) {
    if (!matchesStatusFilter(row, status)) continue;
    const key = classifyProvider(row);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
export function buildProviderRosterFromSummaries(
  summaries: OrderSummaryLike[],
): ProviderKey[] {
  const seen = new Set<ProviderKey>();
  for (const row of summaries) {
    const key = classifyProvider(row);
    if (key) seen.add(key);
  }
  return PROVIDER_ORDER.filter((key) => seen.has(key));
}
