# `add_order_item_v5` — provenance and the pre-deploy check.

**Status:** ✅ **RESOLVED on staging (2026-09-10).** `add_order_item_v5.sql` was verified
against the live definitions — Step 1 has been executed and its two findings folded back into
`add_order_item_v5.sql`. The recovered live `add_order_item_v4` now lives in the repo as
`add_order_item_v4.sql`. **One manual gate remains: confirm production carries the same v3 before
deploying v5 there** (see Step 4).
**Blocks:** Phase 3 (`EXPO_PUBLIC_LOCAL_WRITES_ITEMS`) — item writes cannot be local-first until
items carry client-minted ids. v5 is already the RPC the outbox drain calls
(`services/localFirst/opHandlers.ts` → `add_order_item_v5`), gated by `EXPO_PUBLIC_CLIENT_IDS`
(which makes `p_item_id` non-null; NULL ⇒ v5 behaves exactly like v4).
**Plan:** [`docs/engineering/architecture/local-first-orders-seating.md`](../../../docs/engineering/architecture/local-first-orders-seating.md) §6, §7

## Why this file existed

`create_order_v4.sql` and `seat_guests_v4.sql` were forked from in-repo v3 files. **`add_order_item_v4`
was never in the repo** — the migrations directory is not a complete mirror of the deployed schema,
and `database.types.ts` is stale in the other direction (it lists `add_order_item_v4` but not
`seat_guests_v3`). Neither artifact alone is authoritative, so v5 could not be firmed up until the
live definition was dumped and diffed. That has now been done.

## What the live dump revealed (Step 1, executed 2026-09-10 against staging `dfwqakoyittmrwbqvxgw`)

1. **v4 is a thin wrapper, not a forked body.** It stamps the broadcast origin and delegates to the
   20-parameter `add_order_item_v3` (the station-guard overload):

   ```sql
   BEGIN
     PERFORM public.set_broadcast_origin(p_origin_id);   -- unconditional
     RETURN public.add_order_item_v3( … , p_station_id => p_station_id);
   END;
   ```

   Recovered verbatim into [`add_order_item_v4.sql`](./add_order_item_v4.sql). v5 must INLINE the v3
   body (it cannot delegate) because it has to place a client-minted id inside the `INSERT`.

2. **`set_broadcast_origin(NULL)` early-returns** — so v5's `IF p_origin_id IS NOT NULL` guard is
   behaviourally identical to v4's unconditional call. No change needed.

3. **The in-repo `add_order_item_v3_station_guard.sql` has DRIFTED from the live v3** in two ways.
   The first draft of v5 copied the stale file, so both were latent behaviour changes vs v4 and are
   now corrected in `add_order_item_v5.sql`:

   | | Live v3 (what v4 runs) | Stale in-repo v3 file | v5 now uses |
   | --- | --- | --- | --- |
   | Cash fallback | `ROUND(p_unit_price / (1 + rate), 2)` (inverse) | `p_unit_price * (1 - rate)` (discount) | **inverse** ✅ |
   | `search_path` | `'public','pg_temp'` (on v4 wrapper) | `'public'` | **`'public','pg_temp'`** ✅ |

   The inverse cash formula is the canonical one since
   `20260706130000_open_item_dual_pricing_inverse.sql`. The cash fallback only fires when the client
   sends neither `p_cash_unit_price` nor a menu `cash_price` — rare in practice (the client resolves
   both via `lib/cartItemPricing.ts`) but a real regression if left as the discount form.

> **Lesson for the next RPC fork:** dump the LIVE definition and diff the *body*, not just the
> signature. `database.types.ts` only tells you parameters; it cannot show that an in-repo `_v3` file
> has drifted from what is actually deployed under that name.

## Step 1 — the dump query (for re-running / prod)

```sql
SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('add_order_item_v4', 'add_order_item_v3', 'set_broadcast_origin');
```

## Step 2 — the fork (done)

`add_order_item_v5.sql` adds `p_item_id uuid DEFAULT NULL` as the **last** parameter and layers
row-level idempotency on it over the live v3 body:

1. Row-level idempotency **before any work**, scoped by `order_id` so a client cannot probe another
   order's item ids; returns the same payload the first call returned.
2. `v_item_id := COALESCE(p_item_id, gen_random_uuid())` and insert `id` explicitly.
3. `unique_violation` on `order_items_pkey` → return the existing row (racing-retry path); `RAISE`
   on any other constraint.
4. Everything else kept from the live v4/v3: tax resolution, modifier totalling, cash-price lookup
   (inverse formula), discount redistribution, the station guard, and `p_origin_id`.

`add_order_item_v5_rollback.sql` drops the full signature. Safe at any time — v4 is untouched and the
client falls back to it whenever `EXPO_PUBLIC_CLIENT_IDS` is unset.

## Step 3 — verify before wiring the client (server-side)

- Call twice with the same `p_item_id` → one row, two identical responses (`already_existed:true` on
  the second).
- Call with `p_item_id => NULL` → behaves exactly like v4 (the rollback path).
- Confirm `p_origin_id` still suppresses the caller's own broadcast — add an item on station A and
  assert A does not reprocess it.
- Confirm the station guard still rejects what v4 rejected (`ORDER_OWNED_BY_OTHER_STATION`).

## Step 4 — ⚠️ REMAINING GATE: confirm production before deploying v5 there

Migrations in this workflow stop at staging; prod is deployed manually and is **not readable from
this environment**. Before applying v5 to prod (`hifouuofcaytijrkbvcy`):

1. Run the §Step 1 query against **prod** and confirm its `add_order_item_v3` uses the **inverse**
   cash formula (`/ (1 + rate)`), matching staging.
2. If prod v3 still uses the old discount formula, **hold v5** until prod receives the inverse
   migration — otherwise v5's cash fallback would diverge from the prod v4 it replaces.
3. Apply v5 to staging first, run Step 3, then prod.

## Why not just insert into `order_items` directly from the client?

A direct PostgREST insert would accept a client id (`order_items.Insert.id` is optional) but would
skip tax-category resolution, modifier price rollup, dual-price lookup, the station guard and the
broadcast — all of which live inside the RPC. The RPC fork is the smaller, safer change.
