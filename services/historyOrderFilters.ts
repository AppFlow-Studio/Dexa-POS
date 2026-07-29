import { ONLINE_ORDER_SOURCES } from "@/lib/orderSource";

/**
 * Server-side filter/sort contract for the Previous Orders list.
 *
 * Previously the screen fetched 30 rows by `created_at DESC` and then filtered,
 * sorted, searched and counted them in JS. Every one of those operations was
 * therefore scoped to "whatever pages happen to be loaded", which produced a
 * cluster of user-visible defects: counts that drifted while scrolling, a sort
 * that only ordered the loaded page (so "Amount high–low" showed the highest of
 * 30, not of the range), and a search that returned "No orders found" for
 * orders that existed a page later.
 *
 * The fix is to make the SERVER own the result set. `buildHistoryOrderQuery`
 * below is applied identically to the page query and the count query, so the
 * "N of M" a merchant reads can never disagree with the rows underneath it.
 */

export type HistoryChannel = "all" | "online" | "dine_in" | "takeout" | "delivery";
export type HistoryStatus = "all" | "paid" | "unpaid" | "refunded" | "voided";
export type HistoryProvider = "all" | string;
export type HistorySort =
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc";

export interface HistoryOrderFilters {
  channel: HistoryChannel;
  status: HistoryStatus;
  /** Only meaningful when channel === "online". */
  provider: HistoryProvider;
  /** Free text: order #, customer name, phone. Empty string = no search. */
  search: string;
  sort: HistorySort;
}

export const DEFAULT_HISTORY_FILTERS: HistoryOrderFilters = {
  channel: "all",
  status: "all",
  provider: "all",
  search: "",
  sort: "date_desc",
};

/**
 * Stable identity for a filter set. Pagination cursors are only valid within
 * one filter set — changing a filter must reset paging, or page 2 of the new
 * filter gets appended to page 1 of the old one. The store keys its cursor on
 * this string so that reset is automatic rather than something every call site
 * has to remember.
 *
 * Date window is NOT part of this key; the store already resets on window
 * change via `setDateWindow`.
 */
export function historyFilterKey(f: HistoryOrderFilters): string {
  return [
    f.channel,
    f.status,
    f.channel === "online" ? f.provider : "all",
    f.sort,
    f.search.trim().toLowerCase(),
  ].join("|");
}

export function isDefaultHistoryFilters(f: HistoryOrderFilters): boolean {
  return historyFilterKey(f) === historyFilterKey(DEFAULT_HISTORY_FILTERS);
}

/** `order_type` values that mean dine-in, including the QR ordering flow. */
const DINE_IN_TYPES = ["dine_in", "qr_dine_in"];
const TAKEOUT_TYPES = ["takeout"];
const DELIVERY_TYPES = ["delivery"];

/**
 * Marketplace tokens as they appear in `orders.delivery_platform`, grouped by
 * the provider key the UI uses. Casing varies by ingestion path
 * ('DOORDASH', 'doordash', 'DOOR_DASH'), so each key lists every spelling
 * rather than relying on a single form.
 */
const PROVIDER_PLATFORM_TOKENS: Record<string, string[]> = {
  doordash: ["doordash", "DOORDASH", "DoorDash", "DOOR_DASH", "door_dash"],
  ubereats: [
    "ubereats",
    "UBEREATS",
    "UberEats",
    "UBER_EATS",
    "uber_eats",
    "Uber Eats",
  ],
  grubhub: ["grubhub", "GRUBHUB", "Grubhub", "GRUB_HUB", "grub_hub"],
};

/** Every marketplace token, used to express "not a marketplace" for House. */
const ALL_MARKETPLACE_TOKENS = Object.values(PROVIDER_PLATFORM_TOKENS).flat();

/** PostgREST `in.(…)` needs quoting for values that may contain spaces. */
function inList(values: string[]): string {
  return `(${values.map((v) => `"${v}"`).join(",")})`;
}

/**
 * Escape a user search term for PostgREST `or=(...)`. Commas and parens would
 * otherwise break out of the filter expression, and `%`/`_` are LIKE wildcards.
 */
function escapeSearchTerm(raw: string): string {
  return raw.replace(/[,()]/g, " ").replace(/[%_]/g, "\\$&").trim();
}

/**
 * Server-side mirror of the store's `isEmptyDraftOrder()`: a $0 order that was
 * never closed, paid, voided or refunded is a seated-and-abandoned draft, not
 * history. Expressed by De Morgan as "keep the row if ANY of these hold".
 *
 * This must live in the query both the page and the count are built from —
 * when the exclusion was client-side only, the exact `count` included drafts
 * the client then dropped, so the pager read "1–4 of 6" over 4 rows and the
 * tab counts overstated the window. (`total_amount.neq.0` does not match NULL,
 * which is correct: a draft with no totals yet is still a draft.)
 *
 * The client predicate also requires zero items, which this query can't see —
 * but `subtotal` (pre-discount) and `discount_amount` stand in for it: an open
 * order whose total is $0 because it was fully comped still has a nonzero
 * subtotal and/or discount, so those arms keep it visible. A truly empty draft
 * has every one of these at zero/null.
 *
 * Column note: the client-side `closed_at` is `orders.completed_at` renamed by
 * the transform (utils/orderTransformers.ts) — the orders table has no
 * closed_at column.
 */
export const EMPTY_DRAFT_EXCLUSION_OR = [
  "total_amount.neq.0",
  "subtotal.neq.0",
  "discount_amount.neq.0",
  "completed_at.not.is.null",
  "payment_status.eq.paid",
  "status.in.(void,refunded)",
].join(",");

/**
 * Apply channel/status/provider/search/sort to a PostgREST query builder.
 *
 * Typed loosely because the Supabase filter builder and the count builder have
 * different generic parameters but the same fluent surface; the alternative is
 * threading four generics through every call site for no safety gain.
 */
export function buildHistoryOrderQuery<T extends any>(
  query: T,
  filters: HistoryOrderFilters,
): T {
  let q: any = query;

  // ── Channel ──────────────────────────────────────────────
  // "Online" is defined by order_source, matching lib/orderSource.ts and the
  // web Orders surface. The other three tabs are non-online by definition, so
  // they exclude online sources — that's what makes the tabs a partition whose
  // counts sum to All.
  const onlineList = inList([...ONLINE_ORDER_SOURCES]);
  switch (filters.channel) {
    case "online":
      q = q.in("order_source", [...ONLINE_ORDER_SOURCES]);
      break;
    case "dine_in":
      q = q.in("order_type", DINE_IN_TYPES).not("order_source", "in", onlineList);
      break;
    case "takeout":
      q = q.in("order_type", TAKEOUT_TYPES).not("order_source", "in", onlineList);
      break;
    case "delivery":
      q = q
        .in("order_type", DELIVERY_TYPES)
        .not("order_source", "in", onlineList);
      break;
    case "all":
    default:
      break;
  }

  // ── Provider (Online tab only) ───────────────────────────
  if (filters.channel === "online" && filters.provider !== "all") {
    const tokens = PROVIDER_PLATFORM_TOKENS[filters.provider];
    if (tokens) {
      q = q.in("delivery_platform", tokens);
    } else if (filters.provider === "house") {
      // House = an online order with no marketplace on it. `or` is required
      // because a NULL delivery_platform does not satisfy `not.in`.
      q = q.or(
        `delivery_platform.is.null,delivery_platform.not.in.${inList(
          ALL_MARKETPLACE_TOKENS,
        )}`,
      );
    }
  }

  // ── Status ───────────────────────────────────────────────
  switch (filters.status) {
    case "paid":
      q = q.eq("payment_status", "paid").neq("status", "void");
      break;
    case "unpaid":
      q = q.neq("payment_status", "paid").neq("status", "void");
      break;
    case "refunded":
      q = q.or("status.eq.refunded,payment_status.eq.refunded");
      break;
    case "voided":
      q = q.eq("status", "void");
      break;
    case "all":
    default:
      break;
  }

  // ── Search ───────────────────────────────────────────────
  // Digits-only queries also probe the phone column, so "6505550198" matches a
  // stored "+1 (650) 555-0198" only when the stored value is likewise digit-run
  // compatible. Exact formatting differences are the known limit here — see the
  // note in the store.
  const term = escapeSearchTerm(filters.search);
  if (term) {
    const clauses = [
      `display_number.ilike.%${term}%`,
      `order_number.ilike.%${term}%`,
      `customer_name.ilike.%${term}%`,
      `customer_phone.ilike.%${term}%`,
      `delivery_platform.ilike.%${term}%`,
    ];
    q = q.or(clauses.join(","));
  }

  // ── Empty drafts ─────────────────────────────────────────
  // Applied unconditionally and last, so every consumer of this builder (page,
  // exact count, window summaries) excludes the same rows. Chained `.or()`
  // calls are ANDed by PostgREST, so this cannot interact with the status or
  // search `or` groups above.
  q = q.or(EMPTY_DRAFT_EXCLUSION_OR);

  // ── Sort ─────────────────────────────────────────────────
  // `id` is appended as a deterministic tiebreaker. Without it, rows sharing a
  // sort value can be returned in a different order across pages, which makes a
  // keyset cursor skip or repeat rows.
  switch (filters.sort) {
    case "date_asc":
      q = q.order("created_at", { ascending: true }).order("id", { ascending: true });
      break;
    case "amount_desc":
      q = q
        .order("total_amount", { ascending: false })
        .order("id", { ascending: true });
      break;
    case "amount_asc":
      q = q
        .order("total_amount", { ascending: true })
        .order("id", { ascending: true });
      break;
    case "date_desc":
    default:
      q = q
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      break;
  }

  return q as T;
}

/**
 * Total page count for a result size. Always at least 1 so the pager reads
 * "Page 1 of 1" on an empty result rather than "Page 1 of 0".
 */
export function historyPageCount(
  totalCount: number,
  pageSize: number,
): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
