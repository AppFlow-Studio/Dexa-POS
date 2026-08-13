/**
 * ONE definition of what an order's channel and provider are.
 *
 * Previous Orders classified orders in three independent places — the row badge
 * (`getProviderKey`), the tab/chip counts (`summaryProvider`) and the server
 * query (`buildHistoryOrderQuery`) — each with its own rule. They disagreed, and
 * every disagreement was a user-visible defect: a chip reading "DoorDash (3)"
 * that returned no rows, a "House" filter that returned the whole Online tab,
 * tabs whose counts didn't sum to All.
 *
 * The cause was structural, not a typo: the counts normalized casing and
 * separators while the query matched a hardcoded list of literal spellings, so
 * `"Doordash"` or a trailing space was counted but never returned.
 *
 * This module removes the possibility. Each bucket is defined ONCE as a
 * predicate over the raw `orders` columns, and that single definition is both:
 *
 *   - evaluated in JS  → `matchesPredicate()`     (counts, badges)
 *   - serialized to SQL → `predicateToFilterString()` (the rows)
 *
 * ─── The NULL invariant ─────────────────────────────────────────────────────
 * `order_source` and `delivery_platform` are nullable. In SQL a comparison
 * against NULL yields NULL, and a row whose WHERE clause evaluates to NULL is
 * excluded — indistinguishable from `false` at the row level. JS has no such
 * third value, so the two evaluators can only agree if no NOT ever wraps a
 * compound expression: `NOT (NULL OR false)` is NULL in SQL (excluded) but
 * `true` in JS.
 *
 * The AST therefore has NO `not` combinator. Negation exists only as leaves
 * (`neq`, `notIlike`), which are false-on-NULL on both sides, and "or the
 * column is null" is always written out explicitly. Under that restriction
 * 2-valued JS evaluation and 3-valued SQL agree exactly, for every row.
 *
 * Do not add a compound `not` — it would quietly reintroduce the whole bug
 * class this module exists to close. If a rule needs "this column has a
 * value", add a `notNull` LEAF; never `not(isNull(…))`.
 */
import { ONLINE_ORDER_SOURCES } from "@/lib/orderSource";

// ─── Predicate AST ──────────────────────────────────────────

export type Predicate =
  | { kind: "isNull"; column: string }
  | { kind: "eq"; column: string; value: string }
  | { kind: "neq"; column: string; value: string }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "notIlike"; column: string; pattern: string }
  /** AND. */
  | { kind: "all"; of: Predicate[] }
  /** OR. */
  | { kind: "any"; of: Predicate[] };

const isNull = (column: string): Predicate => ({ kind: "isNull", column });
const eq = (column: string, value: string): Predicate => ({
  kind: "eq",
  column,
  value,
});
const neq = (column: string, value: string): Predicate => ({
  kind: "neq",
  column,
  value,
});
const inList = (column: string, values: string[]): Predicate => ({
  kind: "in",
  column,
  values,
});
const ilike = (column: string, pattern: string): Predicate => ({
  kind: "ilike",
  column,
  pattern,
});
const notIlike = (column: string, pattern: string): Predicate => ({
  kind: "notIlike",
  column,
  pattern,
});
const all = (of: Predicate[]): Predicate => ({ kind: "all", of });
const any = (of: Predicate[]): Predicate => ({ kind: "any", of });

/**
 * The `orders` columns a taxonomy predicate can read. Summary rows carry
 * exactly these — no joins, no items — which is what keeps the count query
 * cheap enough to run over a whole date window.
 */
export interface TaxonomyRow {
  order_type?: string | null;
  order_source?: string | null;
  delivery_platform?: string | null;
  status?: string | null;
  payment_status?: string | null;
}

// ─── JS evaluator ───────────────────────────────────────────

const likeCache = new Map<string, RegExp>();

/**
 * SQL `ILIKE` semantics as a JS RegExp: `%` is any run, `_` is one character,
 * `\` escapes either, and matching is anchored and case-insensitive. Compiled
 * patterns are cached — there are only a handful and they're evaluated once per
 * summary row.
 */
function likeToRegExp(pattern: string): RegExp {
  const cached = likeCache.get(pattern);
  if (cached) return cached;

  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      source += escapeRegExpChar(pattern[++i]);
    } else if (ch === "%") {
      source += "[\\s\\S]*";
    } else if (ch === "_") {
      source += "[\\s\\S]";
    } else {
      source += escapeRegExpChar(ch);
    }
  }
  const compiled = new RegExp(source + "$", "i");
  likeCache.set(pattern, compiled);
  return compiled;
}

function escapeRegExpChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function readColumn(row: TaxonomyRow, column: string): string | null {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === "string" ? value : null;
}

/**
 * Whether a row satisfies a predicate.
 *
 * Every leaf is false when its column is NULL — see the NULL invariant at the
 * top of the file. Note that columns outside `TaxonomyRow` (the empty-draft
 * exclusion reads `total_amount`, `completed_at`, …) always read as NULL here:
 * that predicate is server-only, since rows the server excluded never reach the
 * client to be counted.
 */
export function matchesPredicate(
  predicate: Predicate,
  row: TaxonomyRow,
): boolean {
  switch (predicate.kind) {
    case "isNull":
      return readColumn(row, predicate.column) == null;
    case "eq": {
      const value = readColumn(row, predicate.column);
      return value != null && value === predicate.value;
    }
    case "neq": {
      const value = readColumn(row, predicate.column);
      return value != null && value !== predicate.value;
    }
    case "in": {
      const value = readColumn(row, predicate.column);
      return value != null && predicate.values.includes(value);
    }
    case "ilike": {
      const value = readColumn(row, predicate.column);
      return value != null && likeToRegExp(predicate.pattern).test(value);
    }
    case "notIlike": {
      const value = readColumn(row, predicate.column);
      return value != null && !likeToRegExp(predicate.pattern).test(value);
    }
    case "all":
      return predicate.of.every((child) => matchesPredicate(child, row));
    case "any":
      return predicate.of.some((child) => matchesPredicate(child, row));
  }
}

// ─── PostgREST serializer ───────────────────────────────────

/**
 * PostgREST splits a condition on its first two dots, so a value containing a
 * comma, paren or space would break out of the surrounding group. Ours are enum
 * members and LIKE patterns built here, never user input — but quote defensively
 * so that stays true if the rule table grows.
 */
function serializeValue(value: string): string {
  return /[,()."\s]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function serialize(predicate: Predicate): string {
  switch (predicate.kind) {
    case "isNull":
      return `${predicate.column}.is.null`;
    case "eq":
      return `${predicate.column}.eq.${serializeValue(predicate.value)}`;
    case "neq":
      return `${predicate.column}.neq.${serializeValue(predicate.value)}`;
    case "in":
      return `${predicate.column}.in.(${predicate.values
        .map(serializeValue)
        .join(",")})`;
    case "ilike":
      return `${predicate.column}.ilike.${predicate.pattern}`;
    case "notIlike":
      return `${predicate.column}.not.ilike.${predicate.pattern}`;
    case "all":
      return `and(${predicate.of.map(serialize).join(",")})`;
    case "any":
      return `or(${predicate.of.map(serialize).join(",")})`;
  }
}

/**
 * Serialize for `query.or(...)`, which already implies an OR group — so a root
 * `any` node is flattened into its members rather than nested as `or(or(…))`.
 */
export function predicateToFilterString(predicate: Predicate): string {
  return predicate.kind === "any"
    ? predicate.of.map(serialize).join(",")
    : serialize(predicate);
}

// ─── Channel ────────────────────────────────────────────────

export type ChannelTab = "all" | "online" | "dine_in" | "takeout" | "delivery";

export const CHANNEL_TABS: { key: ChannelTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "dine_in", label: "Dine-In" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

/** Non-"all" tabs, in the order `classifyChannel` resolves them. */
const CHANNEL_ORDER: Exclude<ChannelTab, "all">[] = [
  "online",
  "dine_in",
  "delivery",
  "takeout",
];

const DINE_IN_TYPES = ["dine_in", "qr_dine_in"];
const DELIVERY_TYPES = ["delivery"];

/**
 * Online is decided by `order_source`, matching `lib/orderSource.ts` and the web
 * Orders surface. `ilike` rather than `in` because the column is free text whose
 * casing varies by ingestion path.
 */
const ONLINE_SOURCE: Predicate = any(
  ONLINE_ORDER_SOURCES.map((source) => ilike("order_source", source)),
);

/**
 * The complement of ONLINE_SOURCE, written out rather than negated: a NULL
 * `order_source` is a POS order, and `NOT (source ILIKE …)` would drop it from
 * every tab while still counting it in All.
 */
const NOT_ONLINE_SOURCE: Predicate = any([
  isNull("order_source"),
  all(ONLINE_ORDER_SOURCES.map((source) => notIlike("order_source", source))),
]);

/**
 * Takeaway is the catch-all, which is what makes the four non-online tabs a
 * partition: `order_type` also carries `online` and `catering`, and the enum can
 * grow. Anything that isn't dine-in or delivery is Takeaway on BOTH sides —
 * previously the count said Takeaway while `order_type.in.(takeout)` returned
 * nothing, so those orders were reachable from no tab at all.
 */
const OTHER_TYPE: Predicate = any([
  isNull("order_type"),
  all(
    [...DINE_IN_TYPES, ...DELIVERY_TYPES].map((type) => neq("order_type", type)),
  ),
]);

/**
 * `orders.order_type` is an enum, but the client shapes built from broadcasts
 * (OrderProfile, PreviousOrder) carry legacy display casing — 'Dine In',
 * 'Takeaway', 'To Go'. Normalize to the enum token so ONE rule table classifies
 * both domains; anything unrecognized passes through and lands in the Takeaway
 * catch-all, exactly as it would server-side.
 */
export function normalizeOrderTypeToken(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (!key) return null;
  switch (key) {
    case "takeaway":
    case "to_go":
      return "takeout";
    default:
      return key;
  }
}

/**
 * Rows on the given channel tab, or `null` for "all" (no predicate).
 * Applied on top of the location + date-window scope by the caller.
 */
export function channelPredicate(channel: ChannelTab): Predicate | null {
  switch (channel) {
    case "online":
      return ONLINE_SOURCE;
    case "dine_in":
      return all([
        NOT_ONLINE_SOURCE,
        any(DINE_IN_TYPES.map((type) => eq("order_type", type))),
      ]);
    case "delivery":
      return all([
        NOT_ONLINE_SOURCE,
        any(DELIVERY_TYPES.map((type) => eq("order_type", type))),
      ]);
    case "takeout":
      return all([NOT_ONLINE_SOURCE, OTHER_TYPE]);
    case "all":
    default:
      return null;
  }
}

/** The one tab a row belongs to. Total by construction — see OTHER_TYPE. */
export function classifyChannel(row: TaxonomyRow): Exclude<ChannelTab, "all"> {
  for (const channel of CHANNEL_ORDER) {
    const predicate = channelPredicate(channel);
    if (predicate && matchesPredicate(predicate, row)) return channel;
  }
  return "takeout";
}

export function isOnlineRow(row: TaxonomyRow): boolean {
  return matchesPredicate(ONLINE_SOURCE, row);
}

// ─── Provider ───────────────────────────────────────────────

/**
 * "house" = the merchant's own direct channel (website / app / kiosk).
 * "other" = online, but no platform we can name — an unknown integration stays
 * filterable instead of being silently unreachable.
 */
export type ProviderKey =
  | "ubereats"
  | "doordash"
  | "grubhub"
  | "house"
  | "other";

export type ProviderFilter = "all" | ProviderKey;

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  ubereats: "Uber Eats",
  doordash: "DoorDash",
  grubhub: "Grubhub",
  house: "House",
  other: "Other",
};

/** Display order of the provider chip row (marketplaces first, then direct). */
export const PROVIDER_ORDER: ProviderKey[] = [
  "ubereats",
  "doordash",
  "grubhub",
  "house",
  "other",
];

/**
 * Marketplace identity as LIKE patterns, not literal spellings.
 *
 * `delivery_platform` arrives as 'DOORDASH', 'DoorDash', 'DOOR_DASH',
 * 'door-dash', sometimes with a stray trailing space — writing out the list of
 * spellings is what made the chip counts and the rows disagree. A wildcard
 * between the two words covers every separator and casing in one rule, and the
 * same pattern drives the JS count.
 */
const MARKETPLACE_PATTERNS: Record<"doordash" | "ubereats" | "grubhub", string> =
  {
    doordash: "%door%dash%",
    ubereats: "%uber%eat%",
    grubhub: "%grub%hub%",
  };

/**
 * Platform tokens that mean "the merchant's own storefront". Matched
 * case-insensitively and exactly (`_` also covers a space or hyphen), so an
 * unrecognized integration falls to Other rather than being mislabelled House.
 */
const FIRST_PARTY_PLATFORMS = [
  "website",
  "web",
  "app",
  "mobile_app",
  "kiosk",
  "direct",
  "house",
  "in_house",
  "online_store",
  "store",
];

const NOT_MARKETPLACE = all(
  Object.values(MARKETPLACE_PATTERNS).map((pattern) =>
    notIlike("delivery_platform", pattern),
  ),
);

const IS_FIRST_PARTY = any(
  FIRST_PARTY_PLATFORMS.map((token) => ilike("delivery_platform", token)),
);

const NOT_FIRST_PARTY = all(
  FIRST_PARTY_PLATFORMS.map((token) => notIlike("delivery_platform", token)),
);

/**
 * Rows for one provider chip. Only meaningful alongside the Online channel
 * predicate — the caller applies both.
 *
 * The five buckets partition the Online tab exactly (asserted in
 * `__tests__/historyOrderTaxonomy.test.ts`), which is what lets the chip counts
 * sum to the tab count. The previous server-side "House = not a marketplace"
 * swallowed Other as well, and "Other" applied no predicate at all, so it
 * returned every online order.
 */
export function providerPredicate(provider: ProviderFilter): Predicate | null {
  switch (provider) {
    case "doordash":
    case "ubereats":
    case "grubhub":
      return ilike("delivery_platform", MARKETPLACE_PATTERNS[provider]);
    case "house":
      return any([
        // No platform recorded: the merchant's own storefront is the only
        // online source that legitimately has none.
        all([isNull("delivery_platform"), ilike("order_source", "online_store")]),
        all([NOT_MARKETPLACE, IS_FIRST_PARTY]),
      ]);
    case "other":
      return any([
        all([
          isNull("delivery_platform"),
          any([isNull("order_source"), notIlike("order_source", "online_store")]),
        ]),
        all([NOT_MARKETPLACE, NOT_FIRST_PARTY]),
      ]);
    case "all":
    default:
      return null;
  }
}

/** The provider a row belongs to, or `null` when the row isn't online. */
export function classifyProvider(row: TaxonomyRow): ProviderKey | null {
  if (!isOnlineRow(row)) return null;
  for (const provider of PROVIDER_ORDER) {
    const predicate = providerPredicate(provider);
    if (predicate && matchesPredicate(predicate, row)) return provider;
  }
  return "other";
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

const NOT_VOID: Predicate = any([isNull("status"), neq("status", "void")]);

/**
 * Statuses that mean money was collected. `partially_refunded` counts as paid
 * AND as refunded: it was paid, and it was refunded. The buckets deliberately
 * overlap — unlike the channel tabs, no count is shown per status, and a
 * merchant looking for "Refunded" means "orders with a refund on them".
 */
const PAID_STATUSES = ["paid", "partially_refunded"];
/** Excluded from Unpaid: "Unpaid" means money is still owed. */
const SETTLED_STATUSES = [...PAID_STATUSES, "refunded"];

export function statusPredicate(status: StatusFilter): Predicate | null {
  switch (status) {
    case "paid":
      return all([inList("payment_status", PAID_STATUSES), NOT_VOID]);
    case "unpaid":
      return all([
        NOT_VOID,
        any([
          isNull("payment_status"),
          all(SETTLED_STATUSES.map((s) => neq("payment_status", s))),
        ]),
      ]);
    case "refunded":
      return any([
        eq("status", "refunded"),
        inList("payment_status", ["refunded", "partially_refunded"]),
      ]);
    case "voided":
      return eq("status", "void");
    case "all":
    default:
      return null;
  }
}

export function matchesStatusFilter(
  row: TaxonomyRow,
  status: StatusFilter,
): boolean {
  const predicate = statusPredicate(status);
  return predicate == null || matchesPredicate(predicate, row);
}
