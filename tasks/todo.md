# Previous Orders — Counts / Tabs / Provider Filters Rebuild

## Symptoms reported

1. First entry: header tab counts all read **0** while rows render from local cache.
2. Switching to the **Online** tab makes the counts correct.
3. Online provider chips show e.g. **DoorDash (3)** / **Uber Eats (n)** but tapping
   them yields **no rows**. Grubhub works.
4. **House** ("home") shows far more rows than its chip count.

## Root cause

Order **channel** and **provider** are classified in **three** independent places
that disagree with each other:

| # | Where | Reads | Rule |
|---|---|---|---|
| 1 | `lib/previousOrdersFilters.ts` `getChannelTab` / `getProviderKey` | `OrderProfile._isOnlineOrder`, `delivery_platform` | `resolveOrderPlatformLogo` (casing/separator-normalizing) |
| 2 | `lib/previousOrdersFilters.ts` `summaryChannel` / `summaryProvider` (tab + chip counts) | raw `order_source`, `order_type`, `delivery_platform` | same resolver, but online-ness from `order_source` only |
| 3 | `services/historyOrderFilters.ts` `buildHistoryOrderQuery` (**the rows**) | same raw columns, server-side | **hardcoded exact-string token lists** |

Concretely:

- **(3) sym.** The cache-and-revalidate early return in `refreshPreviousOrders`
  paints cached rows and returns **before** `getHistoryOrderSummaries` ever runs,
  so `windowSummaries` stays `null` → every tab count renders `0`. Changing a
  filter forces a refresh, which is why the Online tab "fixes" it.
- **(3) sym.** `getHistoryWindowSignature`'s count omits the empty-draft
  exclusion that the list applies, so the count it writes into
  `totalMatchingCount` counts a different population than the rows — and the
  freshness compare is apples-to-oranges.
- **(3) sym.** Provider rows are matched with
  `delivery_platform in ("doordash","DOORDASH","DoorDash","DOOR_DASH","door_dash")`.
  Counts are matched with a normalizer that lowercases, trims and strips
  separators. Any spelling outside the literal list (`"Doordash"`, `"door-dash"`,
  a trailing space) is **counted but never returned**.
- **(4) sym.** Server-side `house` = "not one of the listed marketplace tokens",
  which swallows the whole `other` bucket **plus** every misspelled marketplace.
  The client counts `house` strictly. Selecting `other` applies **no predicate at
  all**, so it returns every online order.
- Latent, same class: `order_type` enum contains `online` and `catering`.
  `normalizeOrderType` buckets both as **Takeaway** in the counts, but the
  Takeaway query is `order_type.in.(takeout)` — so those rows are counted in a
  tab that can never show them, and the four tabs don't sum to All.
- Latent, same class: `order_source` and `delivery_platform` are **nullable**.
  `not.in` / `neq` on NULL is NULL in SQL, so NULL-sourced rows silently vanish
  from every non-online tab while still counting toward All.

## Fix — one taxonomy, two evaluators

New `services/historyOrderTaxonomy.ts`: a small predicate AST over the raw
`orders` columns, with

- `matchesPredicate(pred, row)` — evaluates in JS (used for counts + badges), and
- `predicateToFilterString(pred)` — serializes to PostgREST (used for the rows).

Every channel / provider / status bucket is defined **once** as a predicate, so
the count and the query are the same rule by construction rather than by
maintenance. Marketplace matching becomes `ilike` (`%door%dash%`), which is
casing- and separator-proof. The AST deliberately has no `NOT` over compound
nodes, which is what makes 2-valued JS evaluation agree exactly with SQL's
3-valued logic (every NULL leaf is `false` on both sides).

## Tasks

- [x] `services/historyOrderTaxonomy.ts` — AST, evaluator, serializer, rule table
- [x] `services/historyOrderFilters.ts` — build the query from the rule table
- [x] `lib/previousOrdersFilters.ts` — counts + badges from the same rule table;
      delete the dead client-side filter/sort/search pass
- [x] `services/orderService.ts` — window signature counts the same population
- [x] `stores/usePreviousOrdersStore.ts` — always load window summaries (incl. the
      cache-fresh path); cache paint capped to one page
- [x] `hooks/pos/useHistoryFilterControls.ts` — memoized counts, `countsReady`,
      selected provider pinned into the roster
- [x] `ChannelTabBar` / `ProviderChipRow` — render "–" until counts are known
- [x] Tests: bucket partition + client/server agreement over a casing corpus
- [x] `npx tsc --noEmit`, `npm test`

## Review

**New** `services/historyOrderTaxonomy.ts` (≈470 lines) — predicate AST +
`matchesPredicate` (JS) + `predicateToFilterString` (PostgREST), and the single
rule table for channel / provider / status. No `NOT` combinator, by design.

**Changed**

| File | Change |
|---|---|
| `services/historyOrderFilters.ts` | channel/provider/status now serialized from the rule table; query builder no longer owns any bucketing rule |
| `lib/previousOrdersFilters.ts` | thin shell over the taxonomy; removed the dead client-side pass (`matchesStatus`, `matchesSearch`, `compareOrders`, `getChannelTab`, `buildProviderRoster`, `normalizeOrderType`, `isVoided`, `isRefunded`) that no longer ran since filtering moved server-side |
| `services/orderService.ts` | `getHistoryWindowSignature` applies the empty-draft exclusion |
| `stores/usePreviousOrdersStore.ts` | `_loadWindowSummaries()` extracted and called on the cache-fresh and coalesced paths; offline path synthesizes summaries from its own snapshot; cache paint capped to one page |
| `hooks/pos/useHistoryFilterControls.ts` | memoized counts, `countsReady`, selected provider pinned into the roster |
| `ChannelTabBar` / `ProviderChipRow` | `countsReady` → render "–" instead of a fake 0 |

**Behaviour changes worth knowing**

- Takeaway is now the catch-all tab, so `catering` / `online` / NULL order types
  are reachable instead of only counted.
- "Other" is a real bucket with a real predicate; "House" no longer swallows it.
- Refunded orders are no longer listed under Unpaid, and a partial refund now
  counts as both Paid and Refunded.

**Verification** — `npx tsc --noEmit` clean; `npx eslint` on all changed files
clean; 100 tests across the 7 Previous-Orders suites pass. Full suite: 11 suites
/ 30 tests fail identically on a clean stash of this branch (uuid ESM parse +
unrelated wave-2 suites), so nothing here regressed them.

**Not verified on-device** — the `ilike` predicates are asserted against the
serializer and the JS evaluator, not against live PostgREST. Worth one pass over
the Online tab with real data.

---

# Round 2 — Query cost

Scope set by the user: optimize the queries themselves. No lazy-detail refactor,
no migration.

## What was costing time

Confirmed against the perf audit's P1 (`POS-SUPABASE-PERFORMANCE-AUDIT-2026-08-03.md:253`):
a populate is a business-day RPC (awaited, serial) → window signature → summary
→ nested 50-row page → exact count, and the last two repeat on every page turn.

## Changes

| Change | Effect |
|---|---|
| `services/historyOrderProjection.ts` (new) — explicit nested column lists | `order_items` 68 → 26 columns, `order_payments` 105 → 51, `order_discounts` 20 → 14. The dropped payment columns are the heavy ones (`emv_data`, `terminal_request`, `card_token`, per-payment `metadata`, processor text/codes). Multiplied across 50 orders × their children, this is the bulk of the payload. |
| `.is("order_discounts.voided_at", null)` on the page query | Voided discounts were transferred and then dropped client-side. |
| `HistoryOrderSummary` drops `id` + `created_at` | Neither is read by any counting path; ~90 bytes × up to 5,000 rows per window. |
| `_boundsCache` in the store | `get_business_day_bounds` is awaited before anything else can start and returns the same answer all day. Keyed by location + window + resolved business day, so "today" expires at rollover by construction. In-memory: a cold start still pays it once. |
| `HISTORY_COUNT_TTL_MS` + `countIdentity()` | `count: exact` is the expensive half of a page fetch and the total rarely moves. Reused for 60s within one result set; a page turn now runs one query instead of two. |

## The risk this introduced, and the guard

Naming columns explicitly adds a failure mode `*` never had: an unknown name
makes PostgREST reject the request, so the whole list fails rather than one
field going blank. `__tests__/historyOrderProjection.test.ts` checks every name
against `database.types.ts`.

It earned its place immediately — it caught `created_at` in the payment
projection. **`order_payments` has no `created_at` column**;
`normalizeFetchedPayment` reads `payment.created_at` and has always received
`undefined`. Naming it would have taken Previous Orders down completely.

That is also why the constants live in their own module: `orderService` can't be
imported under Jest (the `uuid` ESM parse failure that already breaks
`paymentService.idempotency.test.ts`).

## What was deliberately not done

- **Lazy items** — the collapsed row never reads `order.items`; only the expanded
  panel, refund modal and receipt do, and `get_order_details` / `useOrderDetails`
  already exist to serve them. Dropping items from the list query entirely is the
  single biggest remaining win. Out of scope by request.
- **Server aggregate for tab counts** — one `GROUP BY` returning ~10 rows instead
  of up to 5,000. Needs a migration.
- **Index check** — no migration in this repo creates
  `orders (location_id, created_at DESC)`. If it's missing on the live database
  it dwarfs everything above. Unverifiable from here.

**Verification** — `tsc --noEmit` clean; eslint clean (4 pre-existing warnings);
91 tests across the 6 Previous-Orders suites pass, plus 12 new projection tests.
Full suite 1424 passed / 30 failed, the same 30 that fail on a clean stash.
Generated PostgREST URLs inspected directly; still not executed against a live
database.
