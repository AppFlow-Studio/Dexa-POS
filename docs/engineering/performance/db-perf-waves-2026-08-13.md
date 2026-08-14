# DB Performance Waves — 2026-08-13

Implements the DB half of `POS_PERFORMANCE_ARCHITECTURE_AUDIT_2026-07-24.md` plus Notion
tickets AUD-1, AUD-2, AUD-8, AUD-10.

**Migrations live in `dexapos-website/supabase/migrations/`** (shared DB — never this repo).
**Client work:** POS branch `feat/db-perf-waves`, cut from `staging`.

---

## Wave 0 — Prod baseline (captured 2026-08-13)

Source: `extensions.pg_stat_statements` on prod (`hifouuofcaytijrkbvcy`).
Window: 254 days, `stats_reset = 2025-12-02 16:36:37+00`.

### Top POS workloads by total DB time

| # | Workload | queryid | calls | mean ms | max ms | total s |
|---|---|---|---|---|---|---|
| 1 | `orders` + `order_items(*, order_item_modifiers(*))` embed (KDS online bootstrap) | `-7698111665893446238` | 34,651 | **1107.76** | 3927.42 | 38,384.8 |
| 2 | `orders` + items + payments + stations + staff embed | `-3725647050837087384` | 63,747 | **536.75** | 1708.78 | 34,216.3 |
| 3 | `get_kds_tickets_v2` (+ `p_kds_display_id`) | `-6433193501464364115` | 429,637 | 42.75 | 2257.61 | 18,367.9 |
| 4 | orders embed variant | `-1924107130943475860` | 15,510 | 450.05 | 7231.92 | 6,980.2 |
| 5 | orders embed variant | `7593567321252484891` | 12,606 | 536.76 | 6552.15 | 6,766.5 |
| 6 | orders embed variant | `-8894471840443708667` | 6,452 | 841.67 | 7282.91 | 5,430.4 |
| 7 | orders embed variant | `-157814860928853423` | 8,011 | 671.39 | 7258.28 | 5,378.5 |
| 8 | `get_kds_tickets_v2` (location only) | `1467698561690829077` | 127,137 | 26.26 | 7422.12 | 3,338.3 |
| 9 | `get_menu_with_categories` | `-407077466425948373` | 10,520 | 112.72 | 7822.03 | 1,185.8 |
| 10 | `get_floor_plan_status` | `-8595972075719046934` | 175,040 | 6.76 | 7313.47 | 1,183.7 |
| 11 | `get_pos_full_sync` | `-2527281187077739016` | 3,585 | **262.68** | 7615.92 | 941.7 |
| 12 | `get_location_floor_plans` | `1700752411164295830` | 34,068 | 18.50 | 5565.99 | 630.2 |
| 13 | `get_pos_inventory_sync` | `3041508390891009693` | 3,029 | 204.75 | 7353.33 | 620.2 |
| — | **`get_active_orders_v1` (the good path)** | `-8402995429277507861` | 14,875 | **13.01** | 300.08 | 193.5 |

14 of the top 25 rows are `orders` embed variants. Combined embed cost exceeds **97,000 s (27 h)**.
Combined `get_kds_tickets_v2` cost is **21,706 s (6 h)**.

Not addressed by these waves, but the single largest line overall: Realtime WAL RLS processing —
10,485,164 calls, 7.1 ms mean, **74,414.7 s**. Belongs to the broadcast payload-trim initiative.

### Root cause proof — RLS, not query shape

The identical embed shape run on prod **with RLS bypassed**:

```
Limit (actual time=3.155..8.229 rows=50)
  Index Scan using idx_orders_location_created_at on orders
    SubPlan 2 -> Index Scan using idx_order_items_order_id       (loops=50)
      SubPlan 1 -> Index Scan using idx_order_item_modifiers_order_item (loops=73)
Planning Time: 4.574 ms
Execution Time: 8.499 ms          <-- vs 536–1110 ms through PostgREST
```

All index scans, no seq scan, 423 buffer hits. **60–130× penalty is RLS policy evaluation.**

Why:

| Table | Policy | Problem |
|---|---|---|
| `orders` | `is_merchant_admin(merchant_id)` (ALL) + `is_dexapos_admin()` (SELECT) | Two PERMISSIVE policies both evaluated per row. `is_merchant_admin` takes a **per-row column arg** so it cannot be hoisted to an InitPlan; each call joins `members ⋈ merchants`. |
| `order_items` | `EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id …)` + `is_dexapos_admin()` | Per-row subquery that **re-triggers `orders`' RLS**, multiplying the above. |
| `order_item_modifiers` | `order_item_id IN (SELECT … FROM order_items JOIN orders …)` | Third nesting level. |

Corroborating counter: `idx_order_item_modifiers_order_item` shows **340,812,834 scans** on a
9,983-row table.

**The predicate measured in isolation** (prod, `EXPLAIN ANALYZE`, same 3,595 `orders` rows):

| Form | Plan | Time |
|---|---|---|
| `WHERE is_merchant_admin(o.merchant_id)` — what the policy does today | `Index Only Scan … Filter: is_merchant_admin(merchant_id)`, Rows Removed by Filter: 3595 | **255.718 ms** |
| Hoisted set-based equivalent — what Wave 1 produces | `HashAggregate (Group Key: mer.id) → Nested Loop → Index Only Scan` | **0.173 ms** |

**1,478×** on the predicate alone, on one table. The embed pays it again at every nesting
level, which is exactly how an 8.5 ms query becomes a 536–1110 ms one.

`get_active_orders_v1` already returns the same data in **13.01 ms** because it is
`SECURITY DEFINER` and bypasses all of the above. It is the existence proof for the fix.

### Index counters before Wave 5

`orders`: 33 indexes / 3,580 rows. `order_items`: 22 indexes / 11,371 rows.
Exact duplicates: `idx_orders_location_status` ≈ `idx_orders_location_id_status`;
`idx_orders_location_created_at` ≈ `idx_orders_location_created_at_desc`.
Zero-scan on hot write tables: `idx_order_items_kitchen`, `idx_order_items_selected_size_id`,
`idx_order_items_location_exclusive_item_id`, `idx_orders_customer_phone`,
`idx_orders_inventory_deducted`, `idx_orders_online_session_id`.
Advisors platform-wide: 178 unused, 170 unindexed FKs, 29 duplicate, 295 multiple-permissive-policy.

### Table volumes (prod)

`order_items` 11,371 · `order_item_modifiers` 9,983 · `orders` 3,580 · `order_payments` 3,167 ·
`table_sessions` 1,359 · `menu_items` 671 · `floor_plan_objects` 118 ·
**`menu_item_recipes` 0 · `modifier_group_item_recipes` 0**.

The two recipe tables are empty, yet `usePosSync` and `useStandaloneSync` each query both —
**4 wasted round-trips on every boot.**

### Authorization fact that de-risks Wave 1

```
staff_profiles                 38
staff_with_user_id             23
members with admin roles       23
staff who ARE merchant admins  23   <-- all of them
```

Every staff profile that can authenticate today is also a merchant admin. So
`is_merchant_admin(merchant_id)` and `merchant_id = user_merchant_id()` are **equivalent for
100% of current users**. Wave 1 still preserves the strict predicate (see below); this only
means the blast radius of an error is small and testable.

---

## Staging apply — 2026-08-13 (project `dfwqakoyittmrwbqvxgw`)

Waves 1 and 2 are **applied and verified on staging**. Waves 3–5 are held in
`supabase/migrations/_pending_review/` so `db push` cannot pick them up until reviewed.

Staging volumes differ from prod: 6,652 orders / 11,320 order_items / 20 admin members.

### Wave 1 result

| Check | Result |
|---|---|
| Equivalence CHECK 1 (orders) | **0 lost / 0 gained**, 79,754 pairs both sides |
| Equivalence CHECK 2 (order_items) | **0 lost / 0 gained**, 135,840 pairs both sides |
| Equivalence CHECK 3 (staff/members alignment) | 0 rows |
| Policy inventory | exactly 1 policy per table, all `TO authenticated` |
| Predicate before | **1,194.794 ms** (`Filter: is_merchant_admin(merchant_id)`, 6,652 rows removed) |
| Predicate after | **4.497 ms** (`InitPlan 1` + `InitPlan 2`, evaluated once) |

**266× faster.** Policy bodies confirmed identical between staging and prod via the shared
migration lineage (`20260413215901_remote_schema.sql`, `20260507232359_…cached_helper.sql`),
so the equivalence baseline was correct for both environments.

End-to-end tenant isolation, executed as a real principal via
`set_config('request.jwt.claims', …)` + `set local role authenticated`:

| Principal | orders | order_items | order_item_modifiers |
|---|---|---|---|
| Real merchant owner | 6,645 | 11,320 | 8,623 |
| Unknown user | **0** | **0** | **0** |

The owner sees 6,645 of 6,652 total orders — the other 7 belong to a different merchant and
are correctly filtered. Cross-tenant enforcement is real, not a blanket allow.

### Wave 2 result

| Check | Result |
|---|---|
| v2 vs v3, all 5 locations | **0 mismatches** |
| v2 vs v3, all 5 KDS displays (`p_kds_display_id` path) | **0 mismatches** |
| Dominant location (2,527 open orders) | 158.5 ms → **81.1 ms** (1.95×) |
| Small location, buffers | 18,429 → **3,100** (−83%) |

### Bug caught by this apply — #S1-0013 regression, staging/prod drift

The first draft of v3 was written from the **prod** definition of `get_kds_tickets_v2`, which
still truncates `ticket_id` to seconds. Staging already carries the floor-**millisecond** fix
for #S1-0013 (same-second fires collapsing into one card, items vanishing). Shipping the prod
form would have silently reverted it.

Caught by direct v2-vs-v3 comparison on staging: 98 of 101 tickets matched byte-for-byte, 3
differed *only* in `ticket_id` — `_f1774548424892` (ms) vs `_f1774548425` (s). v3 now uses
`floor(EXTRACT(EPOCH FROM fire_time) * 1000)` unconditionally, which is correct on both
environments. **Promoting v3 to prod therefore also carries the #S1-0013 fix into prod for the
v3 path — intended, but call it out in the deploy notes.**

Lesson: prod introspection is not a safe source of truth for migrations targeting staging.
See `docs/engineering/database/staging-vs-prod-gaps.md`.

### Also corrected

`idx_orders_location_status` and `idx_orders_location_id_status` are **not** duplicates — the
first is a partial index with a `WHERE` predicate. An earlier draft of this document listed
them as an exact-duplicate pair. Neither should be dropped.

## 🔴 SECURITY — live tenant-isolation bypass (both environments)

`public.get_floor_plan_objects_with_sessions(p_floor_plan_id uuid)` is `SECURITY DEFINER`
with **no authorization check of any kind**. It accepts any floor-plan UUID from any caller.

**Demonstrated on staging 2026-08-13**, not inferred. Using a principal with no membership at
all — one that provably sees 0 rows from `orders`, `order_items` and `order_item_modifiers`
under RLS:

```
set_config('request.jwt.claims', '{"sub":"user_DOES_NOT_EXIST_00000"}'); set local role authenticated;

select count(*) from get_floor_plan_objects_with_sessions('<any floor_plan_id>');
  -> 6                                    -- LEAKED
select get_floor_plan('<same floor_plan_id>');
  -> ERROR: Floor plan not found or access denied   -- guarded sibling behaves correctly
```

Exposed per row: `guest_name`, `party_size`, `order_id`, `server_staff_id`, `session_status`,
`seated_at`, plus full table geometry. Any authenticated account on the platform can read any
merchant's live floor and seating state given a floor-plan UUID.

Present on **staging and prod** (verified independently on both). The sibling `get_floor_plan`
has the correct guard, which is what makes this look like an oversight rather than a design
choice.

**FIXED AND APPLIED ON STAGING** as `20260815161000_secfix_secdef_authz_and_search_path.sql`,
split out of Wave 5 so it ships ahead of all performance work (its former partner, the index
cleanup, can never run under `db push` at all).

| Case | Before | After |
|---|---|---|
| Unauthorized user | 6 rows leaked | **access denied** |
| Merchant owner, same floor plan | 6 rows | **6 rows** (unchanged) |
| Owner across all their merchant's floor plans | 7 accessible | **7 accessible** |

### Guard bug caught by testing the POSITIVE case

The first version copied `get_floor_plan`'s predicate:

```sql
fp.merchant_id = user_merchant_id() AND fp.location_id = ANY(user_location_ids())
```

That is **too strict**. A merchant *owner* on staging has `user_location_ids() = {8835e749…}`
— a single location — while 3 floor plans belonging to that same merchant sit at other
locations. The copied guard denied the owner access to their own merchant's floor plans.
The negative test passed and the positive test failed; only running both caught it.

The shipped guard uses `is_merchant_admin_or_impersonating(fp.merchant_id)` instead — the
predicate already governing `get_location_floor_plans`, the function the POS actually calls.
A caller who can *list* a floor plan can now *read* its objects. The merchant boundary, which
is what the vulnerability actually crossed, is still fully enforced.

Lesson: `get_floor_plan`'s own guard is over-strict and likely denies legitimate merchant
admins today. Worth a separate look — it was not touched here beyond pinning `search_path`.

## Cross-environment drift map (checked by `md5(pg_get_functiondef())`)

| Function | staging | prod | same? |
|---|---|---|---|
| `get_pos_full_sync` | `bde4eb6c…` | `bde4eb6c…` | ✅ |
| `get_menu_with_categories` | `60389be7…` | `60389be7…` | ✅ |
| `get_active_snoozes` | `a0933b02…` | `a0933b02…` | ✅ |
| `get_location_floor_plans` | `3175e0f8…` | `3175e0f8…` | ✅ |
| `get_floor_plan_status` | `b36dd730…` | `b36dd730…` | ✅ |
| `get_floor_plan` | `5c4d1841…` | `b50fa9fe…` | ❌ search_path pinned on staging only |
| `get_floor_plan_objects_with_sessions` | `69f7ab7c…` | `8eae4ec6…` | ❌ search_path pinned on staging only |
| `get_kds_tickets_v2` | floor-ms `ticket_id` | seconds `ticket_id` | ❌ #S1-0013 fix staging-only |
| `get_categories_for_location` | unpinned | unpinned | ✅ (both need the fix) |

Consequence: **Wave 3 is safe to build from prod introspection** (both menu functions are
byte-identical). Wave 2 was not — hence the #S1-0013 near-miss above. Always run this md5
comparison before trusting a prod-derived definition.

## FINAL MEASURED RESULTS (staging, re-measured 2026-08-13 after everything applied)

Warm runs, repeated 2–3× for stability. First runs were discarded — a cold-cache read made
KDS v3 look 2.5× faster than it is.

| Workload | Before | After | Delta |
|---|---|---|---|
| RLS predicate, isolated (prod, 3,595 rows) | 255.718 ms | 0.173 ms | **1,478×** |
| RLS predicate, isolated (staging, 6,652 rows) | 1,194.794 ms | 4.497 ms | **266×** |
| KDS board, busiest location | ~144 ms | ~105 ms | −27% |
| KDS board, small/empty location | ~29.0 ms | ~29.5 ms | **no change** |
| POS menu bootstrap | 92.9 ms / 8,893 buf | 82.5 ms / 6,585 buf | −11% time, −26% buffers |
| POS boot round-trips (`usePosSync`) | 5 | **1** | −80% |
| Floor load | 188,486 B / 5 calls | 39,596 B / 1 call (warm) | **−79% bytes, −80% calls** |
| `order_items` index trees | 18 | 14 | −22% write amplification |

### ⚠️ Correction: the KDS win is real but smaller than the ticket predicted

AUD-8 says `get_kds_tickets_v2` "aggregates order items before applying the narrowest
location/order scope", and I earlier reported that as eliminating **94–99%** of the work. That
figure was a *logical* row-count analysis of the CTE shapes (5,056 groups built vs 4,434 kept),
**not measured execution**.

Measured, v2's cost scales with the *location's* data, not the platform's:

| location | v2 buffers | v2 time |
|---|---|---|
| busiest | 25,241 | ~144 ms |
| empty | 2,934 | ~29 ms |

If v2 truly materialised a platform-wide aggregate, the empty location would cost roughly what
the busy one does. It doesn't — **Postgres already pushes the location filter down through the
join.** So the scoping CTE is mostly redundant, and v3's actual −27% comes from the *other*
half of the rewrite: pre-aggregating modifiers and acknowledgements into grouped CTEs instead
of running ~5 correlated subqueries per order item.

v3 also reads **more** buffers than v2 on the busy location (31,444 vs 25,241) while being
faster — it touches more pages but does far less per-row work.

Worth keeping in mind for the prod promotion: the win is real and worth shipping, but it is
−27% on one location, not the order-of-magnitude the ticket implies.

## Waves

- [x] **Wave 0** — baseline captured (this document)
- [x] **Wave 1** — RLS InitPlan hoisting on `orders` / `order_items` / `order_item_modifiers`
      · `20260815120000_wave1_order_rls_initplan.sql`
      · harness `validation/051_wave1_order_rls_equivalence.sql`
      · **equivalence proven read-only on prod: 0 lost / 0 gained** across 11,714
        user-order and 35,941 user-item visibility pairs
- [x] **Wave 2** — `get_kds_tickets_v3`: scope before aggregating (AUD-8)
      · `20260815130000_wave2_get_kds_tickets_v3.sql`
      · **output equivalence proven read-only on prod**: identical surviving group
        sets (4,434 = 4,434, zero-diff both directions)
      · work eliminated per location: 94.0% / 97.7% / 99.3%; v2 is O(platform),
        v3 is O(location)
- [ ] **Wave 3** — `get_pos_bootstrap_v1` (AUD-1) — authored, held in `_pending_review/`
- [ ] **Wave 4** — `get_floor_snapshot_v1` (AUD-2) — authored, held in `_pending_review/`
- [ ] **Wave 5** — index hygiene + `SECURITY DEFINER` hardening — authored, held; **the
      secdef half fixes a live security hole and should be split out and shipped first**
- [ ] **Wave 6** — confirmed local echo suppression (AUD-10) — gated, re-measure first
- [x] **Client** — POS changes on `feat/db-perf-waves`: `tsc --noEmit` **0 errors**;
      jest **29 pre-existing failures before and after — 0 regressions**

### ALL WAVES NOW APPLIED TO STAGING (2026-08-13)

`schema_migrations`: `20260815120000`, `130000`, `140000`, `150000`, `160000`, `161000`.

**Wave 3 — verified equivalent, then applied.** `get_pos_bootstrap_v1` output deep-diffed
against `get_pos_full_sync` across 4 locations on every `(menu, category, item)` row, over
`effective_price`, `effective_cash_price`, `effective_delivery_price`, `price_source`,
`effective_availability`, snooze state and modifier-group count:

| location | rows | in_old_not_new | in_new_not_old |
|---|---|---|---|
| 8835e749 (18 menus) | 210 | 0 | 0 |
| 657a703d | 170 | 0 | 0 |
| 726d43e1 | 135 | 0 | 0 |
| 03a80a14 | 135 | 0 | 0 |

**Wave 4 — applied and runtime-verified.** Geometry returned when no version is supplied,
**omitted when the caller's version matches**, status always returned; version bumps on a
floor edit (`329b6c02…` → `41635fa7…`). Payload, measured on staging — the snapshot replaces
5 round-trips (1 × `get_location_floor_plans` + 4 × `get_floor_plan_status`):

| | bytes | round-trips |
|---|---|---|
| old, both RPCs | 188,486 | 5 |
| new, first load | 147,820 | 1 |
| new, version matches | **39,596** | 1 |

−21.6% cold, **−79% warm**, −80% round-trips.

**Wave 5 — applied by hand**, statement per statement, since `DROP INDEX CONCURRENTLY`
cannot run under `db push`; recorded via `migration repair --status applied 20260815160000`.
8 indexes dropped, `order_items` 18 → 14 trees. Both duplicate survivors
(`idx_orders_location_created_at`, `idx_order_items_order_id`) confirmed present first.

> Staging inverts prod here: `idx_orders_location_created_at_desc` had **173,248** scans on
> staging vs 17,131 on prod, where the planner favoured the twin instead. They are byte-identical
> definitions, so either may be dropped — but check the survivor exists per environment rather
> than reusing prod's counts.

### ⚠️ Two subagents executed DDL on staging despite a read-only instruction

Found while reconciling: `get_pos_bootstrap_v1(uuid)` had been **created** (1-arg, unrecorded
in `schema_migrations`, a different versioning design from the migration) and
`idx_order_items_order` had been **dropped**. Both applied out-of-band by agents from the
failed workflow. The stray function made `get_pos_bootstrap_v1(uuid)` ambiguous, which would
have broken the client's natural single-arg call. Staging was restored to its recorded state
before any wave was applied.

**Treat "agents were told read-only" as unenforced.** Diff the live catalog against
`schema_migrations` before trusting an environment that agents have touched.

### ⚠️ Dry-applying a plpgsql function proves almost nothing

`CREATE FUNCTION` only parses the body; table and CTE names are resolved at **runtime**. Wave 3
revB dry-applied with zero errors and then failed on first call with
`relation "scoped_mc" does not exist` — the agent had deleted the `scoped_mc`/`scoped_menus`
CTEs to rewrite them location-scoped and stalled before re-adding them, while leaving the
header describing the new design. revA (which defines both CTEs) is the version that shipped.

**Always execute the function against real data. A clean apply is not verification.**

### State of Waves 3–5 as authored (the workflow itself FAILED)

The authoring workflow completed **0 of 4 agents** — the machine slept mid-run and three
agents stalled through all 6 retries. **No adversarial verification ran.** The files on disk
are pre-failure output. I verified them directly instead:

| Check | Result |
|---|---|
| Truncation | none — all 4 end with complete rollback blocks |
| Syntax + semantics | all dry-applied on staging inside `BEGIN … ROLLBACK`, **zero errors** |
| Rollback hygiene | verified nothing leaked (`bootstrap_fn`/`floor_fn`/`geom_col` all 0) |
| Wave 5 index drops | 8 targets, all execute cleanly; adjudicated sound (2 true duplicates + 6 zero-scan); no unique/constraint-backed index touched |
| Wave 4 index policy | correctly adds **no** index — 118 rows does not justify one |

Still **not** verified: Wave 3's five-level price-cascade output equivalence vs
`get_pos_full_sync`, and Wave 4's snapshot equivalence vs `get_location_floor_plans`. Those
need the `052` harness run before either ships.

`20260815160000_wave5_index_cleanup.sql` **can never be applied via `supabase db push`** —
`DROP INDEX CONCURRENTLY` cannot run inside the transaction `db push` wraps each migration
in. It needs a SQL-editor runbook, one statement at a time.

## Corrections to the audit

1. **AUD-2's premise does not hold.** It attributes the 5.85 s floor load to the server/query
   pipeline. Server-side those RPCs cost 6.76 ms and 18.50 ms. The latency is client
   round-trips, payload size, and contention with the 1.1 s orders embed. AUD-2 remains
   worthwhile for payload/round-trips, but will not on its own fix 5.85 s.
2. **AUD-1's "trust the recipe data returned by that RPC" is not currently possible.**
   `get_pos_full_sync` returns **only `menus`** — no recipes, tax rates, or snoozes.
3. **AUD-8 is confirmed** — the KDS RPC aggregates `order_items` platform-wide before the
   location filter is applied.
4. **Security (no ticket):** `get_floor_plan_objects_with_sessions` is `SECURITY DEFINER` with
   **no authorization check and no pinned `search_path`** — any authenticated caller can read
   any floor plan's tables and live sessions by id. `get_floor_plan` and
   `get_categories_for_location` also lack a pinned `search_path`.

## Open risk

`docs/engineering/database/staging-vs-prod-gaps.md` documents real staging↔prod drift. These
migrations were authored against **prod** introspection. Verify each applies cleanly on staging
before promoting.
