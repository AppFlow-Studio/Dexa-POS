# Local-First Orders & Seating — Execution Plan

**Status:** In progress. Server Identity Gate complete; local-first layer built and tested behind
flags (all default off). Device validation (Phase 0) and screen wiring remain — see §13.1.
**Scope:** Order creation (dine-in + QSR/normal), order items, seating, and order-total
calculation. Card payments, refunds, tips and settlement are explicitly **out of scope** and stay
server-authoritative (§7.4).
**Extends:** [`sqlite-offline-first.md`](sqlite-offline-first.md) — Track A (the read mirror) is
the foundation this builds on. This document **replaces that plan's Track B (Phases 6–9)** with a
concrete, sequenced version scoped to orders and seating.
**Owning feature docs:** [`docs/features/orders/`](../../features/orders/) ·
[`docs/features/tables-floorplan/`](../../features/tables-floorplan/) ·
[`docs/features/offline-sync/`](../../features/offline-sync/)

---

## 0. Decisions locked before build

These three were open questions. They are now settled, and the rest of the plan depends on them.

| Decision | Choice | Consequence |
| --- | --- | --- |
| **Order numbers** | The **locally minted number is final.** The device generates `ORD-<YYYYMMDD>-S<n>-NNNN` and the server accepts it verbatim. | The server stops owning numbering. `generate_order_number` becomes a fallback for server-originated orders only. Needs a uniqueness backstop (§6.3). Receipts and KDS tickets are correct the moment they print. |
| **Sequencing** | **Validate the read mirror on a real device first** (Sprint 0), then build writes. ✅ **DONE — Track A is shipped to production.** | The gate is lifted; write wiring may proceed. It also **ends the free-rebuild window**: production tablets now hold populated mirrors, so a schema bump can no longer drop and refetch without cost. See §7.5.1. |
| **Cutover** | **Flag-gated dual-run**, old path untouched as rollback, deleted only at the end. | Every phase is one env var away from today's behavior. The ~600 lines of ID-mapping machinery are deleted in Phase 6, once zero `local_`-prefixed IDs remain in the field. |

---

## 1. What is actually wrong — from the code, not from memory

Three distinct problems get conflated as "sync is broken." They have three different causes and
three different fixes, and **only one of them is a sync problem.**

### 1.1 Identity is unstable — this is the sync problem

Every order and item is born with one ID and acquires a different one at sync time.

- `lib/offlineIdRegistry.ts` mints `local_order_<timestamp>_<random>` — not a UUID, not the row's
  real key.
- `create_order_v3` ([`utils/supabase/migrations/create_order_v3.sql:69-77`](../../../utils/supabase/migrations/create_order_v3.sql))
  does `INSERT INTO orders (...) RETURNING id` — the server mints. Same for
  `add_order_item_v4` and `seat_guests_v3`.
- So `local_order_…` must become `550e8400-…` **atomically across ten places**: `ordersById`,
  `dbOrderIdIndex`, `tableOrderIdIndex`, `workingSetOrderIds`, `persistableOrderIds`, the queue's
  `entity_id`, `offlineIdRegistry`, `useTableSessionStore` order refs, `useKDSStore` tickets,
  `useSeatingStore.byOrderId`.

Miss one → orphan. Race one → duplicate. **That is the reported failure**, verbatim: "order items
and seatings" are the two entities with the most references to rewrite, which is exactly why they
fail most.

The codebase now carries six layers of defense against this one disease — idempotency keys,
`offlineIdRegistry`, `reconcileLostOrderCreations`, `markOperationBlocked`, `cartShapeReconcile`,
`orderHeaderReconcile` — plus **two** in-code guards written against this exact hazard:
*"`dbOrderIdIndex` is stale and merging would leak items from this order"*
([`useOrderStore.ts:5403`](../../../stores/useOrderStore.ts)) and *"this catches a stale
`dbOrderIdIndex` / wrong-rekey"* ([`:6884`](../../../stores/useOrderStore.ts)) — and a CLAUDE.md
warning that `getOrder()` is fragile in `DraggableTable` because of "timing gaps in
`dbOrderIdIndex` after seating."

`rekeyOrder` ([`:14977`](../../../stores/useOrderStore.ts)) is called from **four** sites
(`:6861`, `:6877`, `:7583`, plus `hydrateOrderFromSeat`) and itself has to fan out into
`useTableSessionStore.rekeyOrderId` (`:1040`) and a post-rekey totals recalculation (`:15052`).
That fan-out **is** the bug surface.

None of them is wrong. They are all treating a symptom.

### 1.2 The write path is a dual write — this is why writes get lost

Today a mutation does two independent things:

1. Zustand `set()`, persisted to MMKV on a **debounced** write (`lib/storage.ts`, 300ms).
2. A queue append to a **different** MMKV key (`services/offlineSyncService.ts`, 3,194 lines,
   ~40 operation types).

A crash, a force-quit, or an OOM kill between those two leaves the order without its sync
operation, or the operation without its order. There is no transaction spanning them and there
cannot be — they are different storage systems.

### 1.3 Totals are recomputed expensively and fanned out widely — this is **not** a sync problem

This is the "it takes a bit of time to calc order totals" complaint, and it is fixable
independently of everything else, this sprint.

**a. The calculation cache cannot hit on the path that matters.**
[`lib/order-calculator.ts:408-416`](../../../lib/order-calculator.ts) calls
`hashCalculationInput(input)` on every invocation. That function
([`:1458`](../../../lib/order-calculator.ts)) builds a fresh object per item and `JSON.stringify`s
the whole graph — O(n) allocations plus a stringify — **before any math starts.** Then it checks a
2-second-TTL cache. On an item add the input has changed by definition, so the lookup is a
guaranteed miss. The cache is pure overhead exactly where the user feels the lag.

**b. `decimal.js` allocates, four passes deep.** `calculateOrderTotals` makes a gross-subtotal
pass, a discount-distribution pass, a tax pass and a payment-coverage pass, constructing
`new Decimal(...)` per item per pass. That is roughly 6–10 heap objects per item, per keystroke,
on a tablet.

**c. One add writes 15 fields and fans out to 15 files.** Each of the 17 `calculateOrderTotals`
call sites in `useOrderStore` writes 5 order fields **and 10 top-level store fields**
(`activeOrderSubtotal`, `activeOrderTax`, `activeOrderTotal`, `activeOrderDiscount`,
`activeOrderOutstandingSubtotal/Tax/Total`, `activeOrderTotalCash`, `activeOrderOutstandingCash`).
**143 references across 15 files** in `components/`, `app/` and `hooks/` subscribe to those.
Adding one item re-renders all of them.

**d. The item may not be the thing that is slow.** `startInteraction("pos.add_to_cart")` already
instruments tap→paint at [`useOrderStore.ts:8455`](../../../stores/useOrderStore.ts). **Read that
number before optimizing anything** (§4.0). It is entirely possible the visible lag is the
`add_order_item_v4` round trip gating `sync_status`, not the arithmetic.

### 1.4 The two toasts that are the whole "not instant" complaint

```
"Seating in progress — Please wait until the table is seated before adding items."
                                    useOrderStore.ts:8373 → isOrderTableStillSeating(:221)

"Creating order — Please wait until the order is ready before adding items."
                                    useOrderStore.ts:8395-8409
```

**Both exist for exactly one reason: the order has no identity until the server replies.** Neither
is a product decision. Under this plan both delete themselves, because the identity exists at tap
time. That is the "instant" being asked for, and it is a deletion rather than an optimization.

---

## 2. What already exists — this is 90% built

The previous effort left behind a genuinely strong foundation. **This plan does not rebuild it.**

| Asset | Where | State |
| --- | --- | --- |
| SQLite database, WAL, dual read/write connections | `lib/db/index.ts` | Working. Reader on its own connection bypasses the write mutex. |
| **Single write boundary** with atomicity + watermark-in-transaction + retention + station policy | `lib/db/write.ts` (`writeBatch`) | Working. The outbox plugs into this, it does not go around it. |
| Delta-sync engine + per-entity descriptors | `lib/db/syncEngine.ts`, `lib/db/descriptors/` | Code-complete, flag-off. |
| `orders` / `order_items` tables **already carrying** `_sync_status`, `_base_version`, `_lamport`, `_device_id` | `lib/db/schema.ts:227-230, 341-343` | Created inert in Phase 1, precisely for this. |
| **Money already stored in minor units as INTEGER** (`subtotal_minor`, `tax_amount_minor`, …) | `lib/db/schema.ts:190-204, 310-322` | This is what makes §4's integer fast path possible. |
| `idx_o_unsynced` — partial index on `_sync_status != 'synced'` | `lib/db/schema.ts:275` | The outbox drain's scan index, already there. |
| **`no_order_id_rewrite` trigger** — `UPDATE … SET id` aborts | `lib/db/schema.ts:294` | The Identity Invariant, enforced by the DB. |
| Conflict primitives: `detectConflict`, `canMergeChanges`, `mergeOrders`, `isNewerVersion`, `isLockedForPayment` | `services/conflictDetectionService.ts` | 607 lines. Needs to become per-field and commutative — not rewritten. |
| Echo suppression (`p_origin_id`) | `lib/realtime/mutationOrigin.ts` | Working. |
| **Local order-number generator mirroring the SQL format exactly** | `lib/localOrderSequence.ts` | Already produces `#S1-0008`. Decision 0.1 promotes it from fallback to primary. |
| Ownership of the server SQL | `utils/supabase/migrations/` (348 files), `supabase/migrations/` (42) | **`create_order_v3.sql` and `seat_guests_v3.sql` are in this repo.** |

### The gate that was thought to be closed is open

`sqlite-offline-first.md` §0 treats the Identity Gate as an external blocker — "file the RPC
ticket on day one, then stop waiting on it." **That framing is wrong on this branch.** The team
owns the SQL:

- `orders.Insert.id?: string` and `order_items.Insert.id?: string` — the tables already accept a
  client-supplied primary key (`gen_random_uuid()` default, not a refusal).
- `create_order_v3` is a 106-line function **in this repo** with a rollback script beside it.
- `seat_guests_v3` is 154 lines, same.

Adding `p_order_id uuid DEFAULT NULL` and making the insert idempotent on it is a ~15-line change
per function. **The Identity Gate is roughly two days of SQL, not a quarter of waiting.**

### What is missing

1. **No `outbox` table.** The 14 local tables are orders, order_items, order_payments, the five
   menu tables, inventory_items, vendors, customers, staff, sync_state.
2. **No table-session tables at all locally.** Seating has zero local-DB representation — this is
   the single largest build item in the tables track.
3. `SCHEMA_REBUILD_IS_SAFE = true` and `PRAGMA synchronous = NORMAL` are both still set for a
   disposable mirror. They flip together, in one commit, at Phase 3 (§5.3).

---

## 3. The four invariants

Everything below is in service of these. If a design choice violates one, the design choice is
wrong.

1. **Identity.** Every order, item and session has a v4 UUID minted on the device at creation,
   accepted unchanged by the server, and never rewritten. `UPDATE … SET id = ?` does not exist.
   Already enforced for `orders` by the `no_order_id_rewrite` trigger; extend it to `order_items`
   and `table_sessions`.
2. **Atomicity.** The row and its sync intent are written in **one SQLite transaction**. "Local
   created, server didn't" stops being unlikely and becomes *unrepresentable*.
3. **Commutativity.** `merge(A,B) === merge(B,A)`. Arrival order cannot change the result. Where a
   merge cannot be commutative — money — the operation stays online-only (§7.4).
4. **Money is derived, never merged.** Totals are recomputed from the merged item set on both
   sides, never merged as values against their own inputs.

---

## 4. Phase 1 — Instant totals *(ships alone, no server work, no sync dependency)*

**Flag:** `EXPO_PUBLIC_FAST_TOTALS` · rollback = unset.

This is deliberately first. It is independent of every other phase, it is the complaint with the
shortest path to fixed, and shipping it early means the sync work is measured against an already-
fast baseline instead of getting credit for someone else's win.

### 4.0 Measure first — this step is not optional

`startInteraction("pos.add_to_cart")` already instruments tap→paint
([`useOrderStore.ts:8455`](../../../stores/useOrderStore.ts)). Before writing a line:

- Capture p50/p95 tap→paint on a real tablet at 1, 10, 25 and 50 items.
- Separately time `calculateOrderTotals` alone at the same sizes.
- Record both in this document.

If the arithmetic is 2ms of a 180ms tap→paint, §4.1–4.2 are the wrong fix and the real one is
§4.3. **Do not skip to the code.**

#### 4.0.1 Results — calculator, measured 2026-09-07

Harness: [`__tests__/perf/orderCalculatorBench.test.ts`](../../../__tests__/perf/orderCalculatorBench.test.ts).
Node on a dev machine, **not a tablet** — absolute µs are optimistic by an unknown factor, but
ratios and scaling are properties of the code and do transfer.

| items | cold (add path) | warm (cache hit) | hash only | hash % of cold |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 44.2 µs | 1.6 µs | 1.1 µs | 2.4% |
| 10 | 150.7 µs | 4.4 µs | 2.8 µs | 1.9% |
| 25 | 332.9 µs | 8.9 µs | 5.9 µs | 1.8% |
| 50 | 626.0 µs | 17.1 µs | 11.3 µs | 1.8% |

Discount + partial payments adds only **7–32%** over a plain cart — the extra passes are not the
story. The cache-key string grows 401 → 4,742 chars from 1 to 50 items, stringified every call.

**§4.2 gate — numeric representation, 50 items, identical arithmetic shape:**

| decimal.js | integer minor-units | speedup |
| ---: | ---: | ---: |
| 134.6 µs | 10.7 µs | **12.6×** |

#### 4.0.2 What the numbers changed

Three conclusions, one of which corrects this document's own §1.3a.

**① §1.3a overstated the cache. The hash is ~1.8% of a cold call, not a major cost.** Deleting it
buys almost nothing on its own. Worse — **warm is 37× cheaper than cold** (17 µs vs 626 µs at 50
items), so the cache *is* doing real work on re-render. Removing it **without** §4.1's O(1) `_rev`
replacement would be a 37× regression on every re-render. The replacement is **mandatory, not
optional** — the opposite of what "delete the cache" first implied.

**② §4.2 is justified and is the real win.** Math is ~98% of the cold path, and integer
minor-units is 12.6× faster on the same shape. That should take a 50-item cold call from ~626 µs
to roughly 50–100 µs.

**③ The arithmetic is probably not what the operator feels.** 0.6 ms at 50 items on dev; even a
10× device penalty is ~6 ms per call. That does not explain a visible stall. **This promotes §4.3
(the 143-reference re-render fan-out) from cleanup to prime suspect**, and it means the tap→paint
device measurement stays a hard gate — Phase 1 cannot be declared done on calculator numbers
alone.

**Still outstanding, both need hardware:** tap→paint p50/p95 on a real tablet, and a count of how
many `calculateOrderTotals` calls one `addItemToActiveOrder` actually triggers.

### 4.1 Delete the calculation cache

Remove `calculationCache`, `hashCalculationInput`, `CACHE_TTL_MS`, `MAX_CACHE_SIZE`,
`invalidateCalculationCache` and `scheduleCalculationCacheInvalidation`. It cannot hit on the hot
path and costs an O(n) stringify per call.

Replace it — if measurement shows re-render churn justifies a memo at all — with a per-order memo
keyed on a monotonic `_rev` counter bumped on any item/discount/payment mutation. O(1) key, and it
hits on *re-renders*, which is where memoization actually pays.

### 4.2 Integer minor-units core

The local schema already stores every money column as `INTEGER` minor units, and
`lib/db/money.ts` already has `toMinor` / `fromMinor` / `sumMinor`. Compute the hot path in
integers:

- Per-item extension and per-item tax round at exactly the two points Postgres rounds
  (`ROUND(numeric, 2)`), using `Math.round` on minor units.
- Keep `decimal.js` **only** where a genuine fraction enters: percentage discounts, percentage
  service charges, proportional discount distribution.

**This must be proven, not asserted.** Gate it behind a differential test: run old and new
calculators over a corpus of ≥50,000 generated orders (varying item counts, mixed tax categories,
tax-exempt items, percentage and fixed discounts, dual pricing, partial payments) and assert
**byte-identical** output. Any divergence is a bug in the new path, not a rounding opinion.

#### 4.2.1 A pure-integer rewrite is not possible — found while reading the implementation

The 12.6× spike measured a simple shape: extend, tax, accumulate. The real calculator contains
**seven proportional divisions** that produce non-terminating decimals, and those cannot be
represented in integer minor units without losing precision the current code keeps:

| Division | Line | Why it is not exact |
| --- | --- | --- |
| Fixed-discount cash scaling | `:505` | `discount × cashGross / cardGross` |
| Per-item card discount proportion | `:528` | `itemSub / grossSub` — e.g. 1/3 |
| Per-item cash discount proportion | `:540` | same |
| **Unpaid proportion** (taxed items) | `:628` | `unpaidQty / quantity` — 1/3 on a qty-3 line |
| **Unpaid proportion** (exempt items) | `:662` | same |

`outstandingCardSubtotal` accumulates `itemNetSubtotal × (unpaidQty / quantity)` **unrounded**,
and only the per-rate-group tax is rounded at 2dp afterwards. Rounding those products to minor
units early would drift the outstanding balance — the number the cashier collects.

**So §4.2 is a hybrid, exactly as the paragraph above says but with two more sites than it
listed:** integers for the exact paths (line extension, gross/net subtotals, group tax bases,
flat service charge), `decimal.js` retained for all seven divisions. Expect meaningfully less than
12.6×, because the divisions are also the expensive operations.

Two further semantics the rewrite must preserve exactly, both non-obvious:

1. **Tax is rounded once per rate group, never per item** (`:673-698`, "v6 aggregate-per-rate-
   group"). Summing per-item-rounded tax drifted a cent low on multi-item orders and matching
   `calculate_order_totals_fast` v6 is the whole point.
2. **The discount rounding remainder is assigned to the last item** (`:550-565`), matching
   PostgreSQL. Not to the largest item, not spread.

#### 4.2.2 ATTEMPTED AND REJECTED — 2026-09-07

The integer rewrite was implemented at scale 1e6 and **its own differential gate rejected it.**
`__tests__/orderCalculatorDifferential.test.ts` found disagreement on roughly 1 in 3,000 generated
items (seeds 10, 15, 43, 45, 68).

**Why, and why no scale fixes it.** Converting each component to a fixed scale rounds each
component SEPARATELY. A modifier priced `0.0049999` becomes `0.005` at 1e6; the final 2dp rounding
then produces a cent decimal.js never produces, because decimal.js sums exactly and rounds once.
Raising the scale only moves the boundary — it does not remove the per-component rounding.
Summing in plain float and rounding once avoids that but reintroduces representation error exactly
at the `.005` boundaries where the cent is decided, trading a systematic error for a rarer one.

**Reverted**, with the reasoning recorded at `composeUnitPrice` in `lib/order-calculator.ts` so the
next person does not retry it blind. The 50,000-item differential test is kept permanently as a
regression gate on that function.

**What the attempt left behind, and it was worth it:** card and cash now share ONE composition, so
they can never disagree about which components an item has. That asymmetry was a live bug class —
dual pricing drifting by the add-on total on every item carrying one.

**Standing recommendation: do not retry without the tap→paint number.** §4.0.1 put the whole
calculator at ~0.6 ms for a 50-item order. A perfect integer rewrite saves under a millisecond on
a path whose visible latency is dominated by the re-render fan-out and the RPC round trip — not
worth a rounding risk in money code.

### 4.3 One selector, not fifteen mirrored fields

Delete the 10 `activeOrder*` fields from the store. Replace with:

```ts
useOrderTotals(orderId)   // derives from the item set; the only totals API
```

Adding an item then writes **one** thing — the item array — and totals fall out of it. This kills
the 13-file re-render fan-out *and* the entire class of bug where totals and items briefly
disagree, because they can no longer be separate state.

This is also the selector boundary that `sqlite-offline-first.md` §4.3③ said to build in Phase 3
and never got built. Building it here pays that debt on the one entity where it matters most.

### 4.4 Explicitly rejected: incremental totals

Adding an item to an N-item order looks like it should be O(1) — `subtotal += line`. **It is not**,
because proportional discount distribution means one new item changes every other item's discount
share. An incremental path would need its own reconciliation against a full recompute, which is
precisely the class of "two things that can disagree" bug this whole plan exists to remove.

Full recompute in integer math on a 50-item order is tens of microseconds. **Do not build
incremental totals unless §4.0's measurement proves the full recompute is the bottleneck** — and
if it does, revisit this decision with the number in hand.

### Done when

Tap→paint p95 at 50 items is under 16ms (one frame), the differential test is green over 50k
orders, and `grep` shows zero remaining `activeOrderSubtotal`-style mirrored fields.

---

## 5. Phase 0 (Sprint 0) — Validate the read mirror

**No new feature code.** Per Decision 0.2.

`sqlite-offline-first.md` §14 is explicit: *"No phase has run on a real device behind its flag
yet."* The write path sits on this exact database. Every hour spent here is spent while the DB is
still disposable.

1. Turn on `EXPO_PUBLIC_DELTA_SYNC=1` plus `EXPO_PUBLIC_LOCAL_MENU`, `EXPO_PUBLIC_LOCAL_BOARDS`,
   `EXPO_PUBLIC_LOCAL_INVENTORY` on a real tablet. Run a full service period.
2. Assert: cold boot builds the mirror; airplane mode serves every read page; shadow-compare
   local vs. server results clean for the period; retention caps hold at the measured order rate.
3. Fix `_business_day` ingest-side derivation. `businessDayOf()`
   ([`lib/db/descriptors/orders.ts:549`](../../../lib/db/descriptors/orders.ts)) is literally
   `new Date(createdAt).toISOString().slice(0, 10)` — naive UTC, no timezone, no rollover hour —
   while the display path (`lib/orderDayGrouping.ts`) uses the per-location config
   (`sqlite-offline-first.md` §14 open item #3). Two implementations of "business day" must not
   survive into a write path that stamps it on rows the server has not seen.
4. Capture DB size and row counts at the retention cap.

**Done when** every read flag has run a full service period on a device with no divergence, and
the business-day split is closed.

**Do not proceed to Phase 3 until this is green.** Phases 1 (totals) and 2 (identity) may run in
parallel with it — neither touches the mirror.

---

## 6. Phase 2 — Stable identity *(still fully online — zero behavior change)*

**Flag:** `EXPO_PUBLIC_CLIENT_IDS` · rollback falls back to `create_order_v3` / `add_order_item_v4`
/ `seat_guests_v3`.

This is the phase that makes the previous failure *unrepresentable*. It ships **while the app
stays online-first and behaviorally identical**, which is what makes it safe to ship early.

### 6.1 Server — three new functions, all in this repo

Each forks its predecessor, adds one parameter, and is **idempotent on the supplied id** —
re-calling with an existing id returns the existing row rather than erroring. That single property
is what makes every retry in the drain safe.

| New | Forks | Adds | Status |
| --- | --- | --- | --- |
| `create_order_v4` | `create_order_v3` | `p_order_id`, `p_order_number` | ✅ written — `utils/supabase/migrations/create_order_v4.sql` |
| `seat_guests_v4` | `seat_guests_v3` | `p_session_id`, `p_order_id`, `p_order_number` | ✅ written — `utils/supabase/migrations/seat_guests_v4.sql` |
| `add_order_item_v5` | `add_order_item_v4` | `p_item_id` | ⛔ **blocked** — see `add_order_item_v5_RUNBOOK.md` |

Both written migrations also add `public._display_number_from_order_number(text)`, extracted
because the receipt-facing format is now needed in three places and three copies of it would
drift.

> **⛔ Blocker found while building this: the repo's SQL is not a complete mirror of the deployed
> database.** `add_order_item_v4` is called by `services/orderService.ts` and listed in
> `database.types.ts`, but **has no migration in this repo** — the newest one is v3. Diffing the
> deployed v4 signature against the in-repo v3 body shows v4 added at least `p_station_id` (the
> station guard) and `p_origin_id` (broadcast echo suppression, pairs with
> `lib/realtime/mutationOrigin.ts`), neither of which appears anywhere in v3.
>
> **Forking v3 would ship a v5 that silently drops both.** Losing `p_origin_id` means every
> station reprocesses its own broadcasts — phantom duplicate items, the exact symptom class this
> project exists to remove. So v5 was deliberately not written; the dump-first procedure is in
> `add_order_item_v5_RUNBOOK.md`.
>
> `database.types.ts` is stale in the *opposite* direction (it has `add_order_item_v4` but not
> `seat_guests_v3`, which shipped later). **Neither artifact is authoritative alone — assume this
> for any future RPC fork.** Recovering `add_order_item_v4.sql` into version control is worth
> doing regardless of Phase 2.

Shape, for `create_order_v4`:

```sql
INSERT INTO public.orders (id, order_number, ...)
VALUES (COALESCE(p_order_id, gen_random_uuid()),
        COALESCE(p_order_number, public.generate_order_number(p_location_id, p_station_id)),
        ...)
ON CONFLICT (id) DO NOTHING
RETURNING id INTO v_order_id;

IF v_order_id IS NULL THEN            -- row already existed: this is a retry
  SELECT id INTO v_order_id FROM public.orders WHERE id = p_order_id;
END IF;
```

Write the rollback script beside each, matching the existing convention
(`create_order_v3_rollback.sql`).

### 6.2 Client — mint UUIDs, change nothing else

`uuidv4()` replaces `generateLocalId()` for orders, items and sessions. Still online-first, still
the same stores, still the same queue. Only the origin of the ID moves.

### 6.3 Order numbers — the backstop Decision 0.1 requires

`lib/localOrderSequence.ts` already mirrors the SQL format
(`local_order_seq:{locationId}:{YYYYMMDD}:s{stationNumber}` in raw MMKV, atomic
read-increment-write). Promote it to primary and pass the result as `p_order_number`.

Three things must be true, and the third is the one that bites:

1. Sequences are **per station**, so two stations cannot collide.
2. `orders_order_number_merchant_key UNIQUE (merchant_id, order_number)` already exists
   (`orders_order_number_per_merchant_unique.sql`) and is the enforcement.
3. **A station number collision, or an MMKV wipe, produces a duplicate.** `create_order_v4` must
   catch `unique_violation` on `order_number` **specifically** and fall back to
   `generate_order_number` for that row, returning the reassigned number so the device can correct
   its display. Not caught → a repeat of the 2026-06-14 prod incident, where a rolled-back
   `CREATE SEQUENCE` inside the failed transaction made the failure permanent and Station 1 could
   not create any order at all.

Read `orders_order_number_per_merchant_unique.sql` in full before writing this. It is the exact
failure mode.

### 6.4 Delete what identity makes unnecessary

Not worked around — **unnecessary**:

| Deleted | Size |
| --- | --- |
| `lib/offlineIdRegistry.ts` + its MMKV persistence | 530 lines |
| `dbOrderIdIndex` and its 12+ maintenance sites | `useOrderStore` |
| `isLocalId` / `resolveToBackendId` / `resolveId` branching | every call site |
| `reconcileLostOrderCreations()` | `offlineSyncInit.ts:269` |
| `rekeyOrder` + its 4 call sites + `useTableSessionStore.rekeyOrderId` | `useOrderStore.ts:14977`, `:6861`, `:6877`, `:7583`, `:1040` |
| Both stale-index guards | `useOrderStore.ts:5403`, `:6884` |

**Do not delete these on the day the flag flips.** They must keep resolving rows written by older
builds until zero `local_`-prefixed IDs remain in any persisted store on any device. Ship a
telemetry counter for "orders still carrying a `local_` id" and delete when it reads zero for a
full retention window. This is Phase 6.

### Done when

500 orders created across a flaky network: every order's id at creation === its id on the server.
Kill mid-create and retry → exactly one row. Two stations create simultaneously → no order-number
collision, or a caught-and-reassigned one. `grep` proves no rekey path is reachable.

---

## 7. Phase 3 — The outbox *(first local-first writes: order items only)*

**Flag:** `EXPO_PUBLIC_LOCAL_WRITES_ITEMS`

Items first, deliberately: the narrowest blast radius, and the entity the user named as most
broken. Order *creation* stays online in this phase.

### 7.1 The transactional outbox

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id           TEXT PRIMARY KEY NOT NULL,   -- v4 uuid, also the idempotency key
  op           TEXT NOT NULL,               -- 'add_item' | 'update_item' | 'void_item' | ...
  entity       TEXT NOT NULL,               -- 'order' | 'order_item' | 'table_session'
  entity_id    TEXT NOT NULL,               -- the client-minted row id
  payload      TEXT NOT NULL,               -- json
  base_version INTEGER,                     -- sync_version the write was based on
  lamport      INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  next_at      TEXT,                        -- backoff
  last_error   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_drain ON outbox(next_at, created_at);
```

Every mutation becomes:

```ts
await db.withTransactionAsync(async () => {
  await db.runAsync(`INSERT INTO order_items (...) VALUES (...)`, [...]);
  await db.runAsync(`INSERT INTO outbox (...) VALUES (...)`, [...]);
});
```

Either the item exists **and** is queued, or neither happened. §3.2 satisfied.

**This goes through `writeBatch()` in `lib/db/write.ts`, not around it.** That function already
owns atomicity, retention, station policy and watermark-in-transaction; a second write path would
put those four invariants back into "someone has to remember."

### 7.2 The drain

FIFO per order (`async-mutex`, same pattern the Castles service already uses), parallel across
orders. Push with the client-minted id + `base_version`:

- **Accepted** → `_sync_status = 'synced'`, bump local `sync_version`, delete the outbox row.
- **Conflict** (`sync_version` mismatch) → pull the server row, merge per §7.3, re-push.
- **Rejected** (validation, auth, locked-for-payment) → `_sync_status = 'conflict'`, surface it.
  A silently-dropped write is the failure mode this whole plan exists to remove.
- **Network error** → exponential backoff via `next_at`. Never drop.

### 7.3 Merge rules for the item set

Every rule is commutative and fails in the direction that loses least and is safest for the guest.

| Field | Rule | Why this direction |
| --- | --- | --- |
| Item set | **Add-wins union**, keyed by item UUID | Two stations add offline → guest gets both. An extra line a manager can void beats a missing ordered item. |
| Removal / void | **Remove-wins** (tombstone beats a concurrent add) | Un-voiding what a manager voided is worse than losing a re-add. `order_items.is_voided` / `voided_at` already exist. |
| Quantity | LWW on `(lamport, device_id)` | The UI sets an **absolute** quantity from a picker, not an increment. **Not a counter — do not treat it as one.** |
| Modifiers | Replace whole set, LWW on the parent item | `replace_order_item_modifiers_v2` is already replace-semantics server-side. Stay aligned. |
| Totals / tax | **Derived, recomputed from the merged set** | Never merged. §3.4. |

**Tie-break on `(lamport, device_id)`, never `updated_at` alone.** Two devices can write in the
same millisecond; without a deterministic tiebreak the merge is not commutative and the two sides
settle differently. Device clocks also drift — wall-clock time is for humans, causality is for
merges. `_lamport` and `_device_id` columns already exist on both tables.

### 7.4 The money boundary — where this stops, deliberately

| Operation | Local-first? | Rule |
| --- | :---: | --- |
| Build/modify order, items, modifiers, courses, seats | ✅ | Fully local-first |
| Send to kitchen / KDS routing | ✅ | Queues; prints locally now |
| **Card authorization** | ❌ | Requires the processor. A queued "approval" is a lie to the cashier and a chargeback to the merchant. |
| Tip adjust, refund, void payment | ❌ | Operates on a processor-side transaction |
| Settlement / batchout / EOD | ❌ | Server authoritative. Local computes the preview only. |
| Order locking for payment | ❌ | `is_order_locked` is a server mutex. On reconnect, **lock-wins**; local edits to a locked order are rejected and surfaced. |
| Cash payment | — | **Out of scope for this plan.** Its own phase, later. |

Offline, the card button is disabled with a plain reason — *"Card payment needs a connection"* —
not a spinner and not a silent failure.

### 7.5.1 Schema bumps are no longer free — Track A is in production

The plan assumed a version mismatch could always be resolved by DROP + rebuild, because "every row
is refetchable." **That reasoning expired when Track A shipped.** Refetchable is not the same as
free: every tablet now holds a populated mirror, and dropping it forces a cold re-sync of up to the
20,000-order retention cap — minutes of "Syncing order history…" on every device in every store, on
the update that ships the bump.

v12 adds four tables and two triggers and changes nothing existing, so it takes an **additive**
path instead: `ADDITIVE_UPGRADES` in `schema.ts` declares `{ from: 11, to: 12 }`, and
`applySchema()` checks it before the rebuild branch. Since every DDL statement is
`CREATE ... IF NOT EXISTS`, re-running them brings a v11 file to v12 with the data intact.

The entry pins `to === SCHEMA_VERSION` deliberately: bump to v13 with a destructive change and the
v11 entry stops matching, so the upgrade falls back to rebuild automatically rather than leaving a
v12 file mislabelled as v13. Tested — `outboxAndUnsyncedRetention.test.ts` asserts a row written
before the bump survives it.

### 7.5 The two settings that flip here, in one commit

```
lib/db/schema.ts:  SCHEMA_REBUILD_IS_SAFE = true  →  false
lib/db/schema.ts:  PRAGMA synchronous = NORMAL    →  FULL
```

This is the moment the local database stops being a cache. From here, a schema change is a
forward-only migration ladder and a lost commit is a lost order. Make it one reviewed commit
containing both changes and nothing else — `applySchema()` already throws loudly if a version
mismatch meets `SCHEMA_REBUILD_IS_SAFE = false`, which is what turns forgetting into a boot
failure instead of field data loss.

### Done when

Items converge across a real offline service period. Force-quit mid-drain → zero loss, zero
duplication. Battery-pull mid-commit → the DB opens clean.

**Watch for:** the order being voided on another station while this device edits it. Remove-wins
means the void applies and local items are tombstoned — **the operator must see that**, not
discover a silently empty order.

---

## 8. Phase 4 — Track: Order Processing (normal / QSR orders)

**Flag:** `EXPO_PUBLIC_LOCAL_WRITES_ORDERS`

### 8.1 The new create path

```
tap "New Order"
  │
  ├─ orderId   = uuidv4()                          ← real primary key, now
  ├─ orderNumber = nextLocalSequence(location, station)   ← final, per Decision 0.1
  │
  └─ ONE TRANSACTION
       INSERT INTO orders   (id, order_number, _sync_status='local', _lamport, _device_id, ...)
       INSERT INTO outbox   (op='create_order', entity_id=orderId, ...)
     COMMIT
  │
  └─ UI reads local. Immediately. Online or off. No spinner, no toast, no gate.
```

### 8.2 What gets deleted from `addItemToActiveOrder`

The "Creating order — please wait" gate (`useOrderStore.ts:8395-8409`) and the
`ensureActiveOrderCreated` on-demand kickoff behind it. **There is no longer a window in which the
order lacks an identity**, so there is nothing to wait for.

### 8.3 Zustand becomes a projection

The store hierarchy is unchanged; `useOrderStore` stops being an independent copy and becomes a
**projection of SQLite**. One direction of flow: `SQLite → Zustand → render`. Writes go the other
way through a single API. Two stores can no longer disagree about an order because neither owns
it.

Concretely: `ordersById` is hydrated from a local query, and `workingSetOrderIds` /
`persistableOrderIds` collapse into "what the query returned" — the MMKV persistence of orders
goes away entirely, because SQLite is the durable store.

### 8.4 Order-header merge

LWW **per field** on `(lamport, device_id)` for customer, type, table, notes — per-field so a name
edit on one device and a table move on another both survive. Status uses **monotonic advance**
along the `lib/tableStateMachine.ts` partial order and never regresses: `paid` must never fall back
to `open`.

### Done when

An order is created, filled, and sent to kitchen with the tablet in airplane mode for a full
service period, and converges on reconnect with the same id and the same order number it printed.

---

## 9. Phase 5 — Track: Tables & Seating

**Flag:** `EXPO_PUBLIC_LOCAL_WRITES_SEATING`

This is the larger of the two tracks, because **seating has no local-DB representation today at
all**. It is sequenced last because it depends on Phase 4's order creation — seating *creates* an
order, so a local-first seat is a local-first order plus a session.

### 9.1 New local tables

```sql
CREATE TABLE IF NOT EXISTS table_sessions (
  id TEXT PRIMARY KEY NOT NULL, location_id TEXT NOT NULL, merchant_id TEXT,
  party_size INTEGER, guest_name TEXT, guest_phone TEXT, guest_notes TEXT,
  reservation_id TEXT, waitlist_id TEXT, server_staff_id TEXT,
  status TEXT, is_active INTEGER, seated_at TEXT, closed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_version INTEGER,
  _sync_status TEXT NOT NULL DEFAULT 'synced', _base_version INTEGER,
  _lamport INTEGER NOT NULL DEFAULT 0, _device_id TEXT, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS table_session_tables (
  session_id TEXT NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_id   TEXT NOT NULL,
  PRIMARY KEY (session_id, table_id)
);
CREATE TABLE IF NOT EXISTS order_seats (
  order_id TEXT NOT NULL, item_id TEXT NOT NULL, seat_number INTEGER,
  _lamport INTEGER NOT NULL DEFAULT 0, _device_id TEXT,
  PRIMARY KEY (order_id, item_id)
);
CREATE TRIGGER IF NOT EXISTS no_session_id_rewrite
  BEFORE UPDATE OF id ON table_sessions
  BEGIN SELECT RAISE(ABORT, 'session id is immutable'); END;
```

Add `table_sessions` and `table_session_tables` to `TABLES` and to `TABLE_CONFLICT_KEYS`, and
write a delta descriptor for sessions in `lib/db/descriptors/`. **A test already asserts every
composite-PK table in the DDL appears in `TABLE_CONFLICT_KEYS`** — getting this wrong is silent
(a swallowed constraint error that looks like "the mirror is empty"), which is why that test
exists.

### 9.2 The new seat path

```
tap table → "Seat 4"
  │
  ├─ sessionId = uuidv4()
  ├─ orderId   = uuidv4()
  ├─ orderNumber = nextLocalSequence(...)
  │
  └─ ONE TRANSACTION
       INSERT INTO table_sessions        (id=sessionId, status='seated', _sync_status='local')
       INSERT INTO table_session_tables  (sessionId, tableId) × N
       INSERT INTO orders                (id=orderId, session_id=sessionId, _sync_status='local')
       INSERT INTO outbox                (op='seat_guests', entity_id=sessionId, payload={both ids})
     COMMIT
  │
  └─ Table is seated. Order is open. Items can be added on the next frame.
```

`seat_guests_v4` receives both ids and is idempotent on `p_session_id`.

### 9.3 What gets deleted

- **`isOrderTableStillSeating()`** (`useOrderStore.ts:221`) and its call site (`:8373`), plus the
  *"Seating in progress — please wait"* toast. The order has an identity at tap time; there is no
  seating window to wait out.
- **`hydrateOrderFromSeat`** (`useOrderStore.ts:16503`) — the rekey path that converts
  `localOrderId → dbOrderId` after `seat_guests_v3` replies. Nothing to rekey.
- The `tableOrderIdIndex` overwrite guard (`:7247-7261`) that exists to prevent a one-frame
  flicker while the index points at a broadcast shell.
- The CLAUDE.md warning that *"`getOrder()` alone is fragile in `DraggableTable` — timing gaps in
  `dbOrderIdIndex` after seating"* stops being true. **Update CLAUDE.md in the same commit.**
- `useSeatingStore.loadFromServer()`'s 10-second staleness dance
  ([`hooks/useTableSeating.ts:79-83`](../../../hooks/useTableSeating.ts)) — seats read from the
  local DB, so there is no "was this fetched recently enough" question to answer.

### 9.4 Session merge rules

| Field | Rule |
| --- | --- |
| Session status | **Monotonic** along the state machine. Local-only statuses (`seating`, `ordering`, `paying`, `closing`) **never sync** — `isLocalOnlyStatus()` already guards this, keep it. |
| Merged table set | Add-wins union on `table_session_tables`, keyed by `(session_id, table_id)` |
| Seat assignment (`order_seats`) | LWW per item on `(lamport, device_id)` |
| Party size, guest name/phone/notes | LWW per field |
| Session close | Remove-wins — a close beats a concurrent edit |

### 9.5 The genuinely hard case: two devices seat the same table offline

Two stations, both offline, both seat table 12. Neither can see the other's session. On reconnect
there are two sessions claiming one table — and `seat_guests_v3` currently raises
`'One or more tables are already occupied'`.

**This cannot be merged away and must not be silently resolved.** The rule:

1. The session with the **lower `(lamport, device_id)`** wins the table.
2. The losing session's **order is preserved**, detached from the table, and surfaced to a manager
   as *"Table 12 was seated on two stations — merge these checks or move one."*
3. `seat_guests_v4` returns a structured `table_occupied` result carrying the winning session id
   rather than raising, so the client can take branch 2 instead of dropping the write.

**Losing a table assignment is recoverable. Losing a guest's order is not.**

### Done when

Two stations independently seat the same table offline and reconnect to one correct session, one
correct table assignment, and **zero lost orders or items**. Then three. Then one device offline
for an entire shift with clock skew of +10 minutes — merges still deterministic.

---

## 10. Phase 6 — Delete the old path

Only after every flag above has run a full service period on real hardware, and the
"orders still carrying a `local_` id" counter has read zero for a full retention window.

Deleted: `lib/offlineIdRegistry.ts` (530), the `dbOrderIdIndex` machinery, the rekey path,
`reconcileLostOrderCreations`, `cartShapeReconcile` / `orderHeaderReconcile` where they exist only
to repair identity drift, and the order-scoped operation types in `offlineSyncService.ts` that the
outbox supersedes.

**`offlineSyncService.ts` is not deleted wholesale.** It carries ~40 operation types, many
unrelated to orders (timeclock, cash drawer, loyalty, preauth, discounts). Only the order-scoped
ops move to the outbox; the rest stay until they get their own plan.

---

## 11. Testing — convergence is a property, test it as one

Example-based tests will not find the bug that killed the last attempt.

**Property test (the phase gate that matters most).** Model N devices and a server. Generate
random operation sequences and random partition/heal schedules. Replay. Assert:

- All devices and the server reach byte-identical state.
- The result is independent of the order updates arrived in.
- Replaying any already-applied update is a no-op.
- No entity id ever changes.
- Totals recomputed from the converged item set match the server's, to the cent.

**Query-plan tests.** Every new index gets an `EXPLAIN QUERY PLAN` assertion next to its result
assertions — assert the index **by name** and assert **no `TEMP B-TREE`**. Track A shipped a
partial index (`idx_o_loc_created ... WHERE voided_at IS NULL`) that the one query it was built
for could never use, behind ten green result-correctness tests. Have the plan test consume the SQL
the production path runs; a test that rebuilds its own `SELECT` keeps passing after the real query
stops using the index.

**Device tests, per phase.** Airplane mode for a full service period. Force-quit mid-drain.
Battery-pull mid-commit. Two tablets on one table. Clock skew.

**Differential test for Phase 1.** 50,000 generated orders, old calculator vs. new, byte-identical.

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| **Repeating the last failure** | The cause was identity instability (§1.1), and Phase 2 removes it structurally — enforced by a DB trigger, not by review. Phase 2 ships online-first, so it is provable before any offline write exists. |
| Order-number duplication in the field | §6.3's `unique_violation` catch + reassignment. Read the 2026-06-14 incident write-up first. |
| Schema bug found after `SCHEMA_REBUILD_IS_SAFE = false` | Sprint 0 exists to find these while rebuild is still legal. Nothing skips it. |
| Two-device offline seating | §9.5 — explicit, surfaced to a manager, order always preserved. |
| Integer totals diverge from Postgres by a cent | 50k-order differential test as a merge gate. Round at the same two points Postgres rounds. |
| `useOrderStore` is 18.8k lines and the projection rewrite touches all of it | Phased and flag-gated; the store is rewritten entity-by-entity behind `EXPO_PUBLIC_LOCAL_WRITES_*`, never in one pass. |
| Track B is abandoned midway | Phases 1 and 2 are each independently valuable and behaviorally safe: instant totals, and ~600 lines of the most bug-prone machinery in the repo deleted. Stopping after either is a real outcome, not a partial one. |

---

## 13. Sequence summary

| # | Phase | Flag | Server work | Depends on | State |
| --- | --- | --- | --- | --- | --- |
| 0 | Validate read mirror | existing read flags | none | — | ✅ **done, in production** |
| 1 | **Instant totals** | `EXPO_PUBLIC_FAST_TOTALS` | none | — | §4.0 ✅ · §4.3 selector ✅ · §4.2 attempted, rejected by its gate, reverted (§4.2.2) |
| 2 | **Stable identity** (still online) | `EXPO_PUBLIC_CLIENT_IDS` | 3 SQL functions | — | ✅ server + client built |
| 3 | Outbox + local item writes | `EXPO_PUBLIC_LOCAL_WRITES_ITEMS` | none | 0, 2 | ✅ layer + RPC binding done · device pass remains |
| 4 | **Order processing** — local order creation | `EXPO_PUBLIC_LOCAL_WRITES_ORDERS` | none | 3 | ✅ write path + gate wired · store projection remains |
| 5 | **Tables & seating** — local seating | `EXPO_PUBLIC_LOCAL_WRITES_SEATING` | none | 4 | ✅ write path + gate wired · session store projection remains |
| 6 | Delete the old path | — | none | 5 + zero `local_` ids | gate helper in `identity.ts` |

Phases 1 and 2 can start immediately and in parallel with Sprint 0. Phase 1 delivers the
instant-calculation win on its own, with no sync dependency and no server change.

---

## 13.1 Build log

**2026-09-07 — execution session.** 55 new tests, all green. Full suite: 2,205 passing; the 23
failures across 9 suites are **pre-existing on `bug-fixes`** (verified by stashing every change and
re-running — identical 9 suites, identical 23 failures). `tsc` clean apart from a pre-existing
`app/(main)/_layout.tsx` error.

### Server — the Identity Gate is complete

| File | What |
| --- | --- |
| `create_order_v4.sql` (+rollback) | Client-minted `p_order_id` / `p_order_number`, idempotent on the id, plus the §6.3 order-number collision backstop. |
| `seat_guests_v4.sql` (+rollback) | Client-minted `p_session_id` / `p_order_id`, idempotent on the session id, delegates to `create_order_v4`, and returns the §9.5 structured `table_occupied` result instead of raising. |
| `add_order_item_v5.sql` (+rollback) | Client-minted `p_item_id`, idempotent on it, racing-retry handler on `order_items_pkey`. **Forked from `add_order_item_v3_station_guard.sql` — see the provenance warning below.** |
| `_display_number_from_order_number(text)` | Extracted; the receipt-facing format is now needed in three places. |

### Client — the local-first layer

| File | What |
| --- | --- |
| `lib/db/schema.ts` | **v12**: `outbox`, `table_sessions`, `table_session_tables`, `order_seats`, id-immutability triggers for items and sessions, `TABLES_WITH_SYNC_STATUS`. |
| `lib/db/outbox.ts` | `commitLocalWrite()` — row + sync intent in ONE transaction. Lamport clock, claim/retry/reject/sync bookkeeping, `hasUnsyncedWrites()`. |
| `lib/db/merge.ts` | §5 merge semantics: add-wins items, remove-wins voids, monotonic status, per-field header LWW, close-wins sessions. |
| `lib/localFirst/identity.ts` | `mintId()` behind `EXPO_PUBLIC_CLIENT_IDS`, `idForServer()`, the Phase-6 deletion gate. |
| `services/localFirst/outboxDrain.ts` | Serial-per-order / parallel-across-orders drain, three-way failure taxonomy, error classification. |
| `hooks/orders/useOrderTotals.ts` | §4.3 derived-totals selector. |
| `services/localFirst/localWrites.ts` | `createLocalOrder` / `addLocalItem` / `seatLocal` — the write API a screen calls instead of an RPC. |
| `stores/useOrderStore.ts` | Both "please wait" gates are now flag-gated off under local-first writes (§1.4). |
| `lib/order-calculator.ts` | **`customizations.addOns` is now priced** on both the card and cash paths. |
| `lib/localOrderSequence.ts` | Sequence counter hardened — in-memory authoritative, MMKV write-through. |
| `services/localFirst/opHandlers.ts` | Drain → `create_order_v4` / `add_order_item_v5` / `seat_guests_v4`, with the §9.5 `table_occupied` escalation. |
| `lib/db/index.ts` + `schema.ts` | `ADDITIVE_UPGRADES` — v11→v12 keeps production data instead of dropping the mirror (§7.5.1). |
| `lib/db/write.ts` | Retention now **exempts** `_sync_status != 'synced'` rows. |
| `lib/db/policy.ts` | v12 tables scoped to POS; `forbiddenTables()` carries a data-loss warning. |

### Three bugs the property tests caught before any of this shipped

Worth recording, because each would have been near-undebuggable in the field:

1. **The merge was not commutative.** `_lamport` defaults to `0` and `_device_id` to `NULL`, so
   **every server-ingested row carries identical version metadata** — ties are the common case,
   not an edge case. With "ties resolve to `a`", `merge(a,b)` kept a's fields and `merge(b,a)`
   kept b's, so two devices settled differently with no error anywhere. Fixed with a canonical
   content tiebreak (seed 66).
2. **The merge was not associative.** The void branch built a *blend* of both sides, producing an
   object equal to neither input; a three-way merge's intermediate value then shifted the content
   tiebreak depending on grouping. Fixed by making merge a strict max over a total order that
   always returns one input verbatim (seed 34).
3. **The Lamport clock silently reset.** It read from MMKV on every call, so any read failure
   restarted it at 1 — two writes sharing a value, and the tie-break ceasing to be a total order.
   Now an in-memory authoritative counter with MMKV as write-through durability.

Also fixed: `backoffMs` clamped its exponent at 8, capping retries at 256s so the documented
5-minute ceiling was unreachable.

**4. Every server refusal would have been retried forever.** Supabase/PostgREST returns errors as
plain objects (`{ message, code, details, hint }`), not `Error` instances, so `String(error)` gave
`"[object Object]"` — matching no permanent pattern, classifying every rejection as transient, and
spinning invisibly. `errorText()` now flattens `message`/`code`/`details`/`hint`.

**5. v12 would have wiped every production mirror.** With Track A live, the version bump would have
hit `DROP_STATEMENTS` and forced a cold re-sync of up to 20,000 orders on every tablet. See §7.5.1.

**6. Every order item would have re-pushed forever.** `markSynced` wrote `sync_version`
unconditionally, but `order_items` has no such column. The resulting "no such column" was swallowed
by the function's own try/catch — which rolled back the `DELETE` too, so the op was never removed
and the outbox never drained. Silent, and visible only as a queue that never empties. Caught by the
end-to-end offline test.

**8. The derived-totals selector was not equivalent to the store.** `useOrderTotals` passed a
hand-picked subset of the service-charge inputs, while the store's wrapper resolves the active rule
from `useServiceChargeRulesStore`, party size from the table session, a server-confirmed SC
fallback, AND `preserveItemLevelOutstanding`. On a payment surface that is a guest charged the
wrong amount — the same shape as the staging incident recorded in the calculator
(`$7.43` shown on the CFD, `$5.72` collected). The hook now calls the store's own
`calculateOrderTotalsForOrder`, so the two are equivalent **by construction** rather than by
inspection. That equivalence is the precondition for migrating any payment view off the mirrors.

**7. The local order-number counter could reset to 1.** Same shape as the Lamport bug: a bare MMKV
read-increment-write restarts at 0001 if the read ever fails. Cosmetic while these numbers were an
offline fallback; under Decision 0.1 the number is FINAL and server-stored, so a reset would
collide every order and force `create_order_v4` to renumber every one — the exact reconciliation
problem that decision exists to avoid. A test generating 25 orders got 25 copies of number 1.

### §4.3 complete — the ten mirrored totals fields are gone

`activeOrderSubtotal`, `activeOrderTax`, `activeOrderTotal`, `activeOrderDiscount`,
`activeOrderOutstandingSubtotal/Tax/Total`, `activeOrderTotalCash` and
`activeOrderOutstandingCash` no longer exist. ~16 KB and 249 lines removed from `useOrderStore`.

**The "143 references across 15 files" figure was wrong**, and worth correcting because it drove
the earlier risk assessment. Most were *local variable names* in components that had already
migrated to `useActiveOrderTotals()` and simply aliased its results. The real count was **13 store
reads across 6 files** — `BillSection`, `SplitPaymentView`, `SplitByItemView`, `PayForItemsView`,
`TableOrderView`, and the dev harness — plus `CFDProvider` and `usePaymentStore`, which only
surfaced once the fields were deleted and `tsc` failed on them. Deleting first and letting the
compiler find the consumers was what made this safe.

**A duplicate was deleted too.** `hooks/orders/useOrderTotals.ts` (written earlier in this effort)
reimplemented a hook that already existed as `useActiveOrderTotals` in
`stores/selectors/orderSelectors.ts` — and the existing one is better: it subscribes to the
service-charge rule, session party size and seat count, and warns on frontend/backend mismatch.
The duplicate was removed and every call site points at the original.

**Why this matters beyond re-renders.** The deleted fields were refreshed on a *deferred* microtask
(`_scheduleTotalsRecompute`). Between an item mutation and that microtask firing, the cart and its
total disagreed — and any surface reading a mirror rendered the stale number. On `CFDProvider` that
is the wrong total shown to the guest; on `usePaymentStore` it is a split sized against a stale
balance. Derived totals cannot drift, because there is nothing left to drift from.

**Imperative callers** (`usePaymentStore.activeOutstanding()`, `TableOrderView`) use the store's own
`calculateOrderTotalsForOrder` — the same function `useActiveOrderTotals` calls — so reactive and
imperative paths are equivalent by construction rather than by inspection.

### ⚠️ The repo's SQL is not a complete mirror of the deployed database

`add_order_item_v4` is called by `services/orderService.ts` and listed in `database.types.ts` but
**has no migration here** — the newest is v3. Per `lib/realtime/mutationOrigin.ts:11-13` the
origin-id work shipped from a **different repository**
(`dexapos-website/supabase/migrations/20260816130000_aud10_broadcast_origin_id.sql`).

`add_order_item_v5.sql` is therefore forked from the in-repo station-guard v3 with `p_origin_id`
reconstructed from that documented contract (`set_broadcast_origin()` in the same transaction).
**Before deploying it, dump the live v4 and diff** — procedure in `add_order_item_v5_RUNBOOK.md`.
`database.types.ts` is stale in the opposite direction (has `add_order_item_v4`, lacks
`seat_guests_v3`). **Neither artifact is authoritative alone.**

### Calculator suite repaired: 7 failing → 0, 1 documented skip

All three causes were in the tests, not the code — details in the two subsections below.

### Not done, and why

| Item | Why |
| --- | --- |
| **Phase 0 device validation** | Needs physical hardware. Still the gate before any flag defaults on. |
| **§4.2 integer totals** | Deferred on evidence — see §4.2.1. Needs only the tap→paint p50/p95, which is already recorded in production as the Sentry transaction `pos.add_to_cart` (op `pos.interaction`, ended via double-RAF so it is a true tap→paint). The `addOns` blocker is resolved. |
| ~~Wiring the drain to real RPCs~~ | ✅ Done — `services/localFirst/opHandlers.ts`. Calls v4/v5 directly rather than through `rpcWithIdempotency`, whose version-fallback chain would downgrade to an RPC that cannot accept a client id and mint a second identity. |
| **`useOrderStore` as a projection** | The mirrored-totals half is DONE (below). Converting `ordersById` itself to read from SQLite is the remaining piece, and it lands with the `EXPO_PUBLIC_LOCAL_WRITES_*` rollout rather than ahead of it. |
| ~~Migrating the 10 mirrored totals fields~~ | ✅ **Done — the fields are deleted.** See below. |

### The calculator suite was already red on `bug-fixes`

`__tests__/order-calculator.test.ts` had **7 failing tests before this session** (`lib/order-calculator.ts`
was never touched). That matters because §4.2's differential test would have been built beside a
red suite and inherited its blind spots. All three causes were in the tests, not the code:

1. **Stale fixtures (5 tests).** `createMockItem` hard-coded `baseCardPrice: 10.0` /
   `baseCashPrice: 10.0` and spread `overrides` last. But the calculator reads
   `baseCardPrice ?? unitPrice` and **never reads `price`** — so a test writing `{ price: 5 }`
   changed a field nothing consumes while the base stayed at 10, silently computing a different
   order than the one it described. Fixed by deriving the base fields from whichever price the
   test supplies.
2. **An expectation that encoded a fixed bug (1 test).** Scenario 17 asserted a cash total of
   `$23.26`, obtained by summing per-item rounded tax (`$1.26 + $0.63`). The calculator rounds
   **once per rate group** (the v6 rule, matching `calculate_order_totals_fast` v6) giving
   `$23.27`. Per-item summing drifting a cent low on multi-item orders is exactly what v6 was
   introduced to remove — the old expectation asserted the pre-v6 bug. Expectation updated; code
   untouched.
3. **A real gap, now skipped rather than hidden (1 test).** See §14.

### ⚠️ `customizations.addOns` is priced by nothing

`lib/order-calculator.ts` contains **zero references to `addOns`**. It prices
`customizations.size.priceModifier` and `customizations.modifiers[].options[].price` only.
`ItemCustomizationDialog.tsx:118-121` meanwhile writes `baseCardPrice: menuItem.price` — the base
**without** add-ons — and puts the add-on-inclusive figure in `price`, which the calculator ignores.

**Not a live undercharge today:** `menuItem.addOns` is only ever populated from `lib/mockData.ts`;
real Supabase menus deliver modifiers via `customizations.modifiers`, which is priced correctly.

**It is a live trap.** The moment anything populates `addOns` from real menu data, every item
carrying one undercharges by its add-on total, silently. `addOns` is not dead code — it is read by
receipts (`ReceiptModal`), printing (`PrinterService`), `cartShapeReconcile`, `useOrderStore` and
the online-orders detail screen. Only the *pricing* path skips it.

---

## 14. Open items to decide during the build

- **Cash payments offline** are out of scope here and need their own phase. The drawer *is* the
  device, so local can be truth — but that is a separate decision with its own reconciliation
  design.
- **KDS ticket identity.** `useKDSStore` holds order refs; confirm they ride the same UUIDs rather
  than needing their own mapping (they should, but verify before Phase 4).
- **Retention for unsynced rows.** `writeBatch`'s retention prunes by cap. A row with
  `_sync_status != 'synced'` must be **exempt** from pruning — otherwise retention silently deletes
  an unsent order. Add the exemption in Phase 3 and test it at the cap.
- ~~**`customizations.addOns` pricing**~~ ✅ **RESOLVED 2026-09-07 — addOns are now priced** on both
  the card and cash paths. `baseCardPrice`/`baseCashPrice` are the bare menu price by construction
  (`ItemCustomizationDialog.tsx:118-121`), so double-counting is structurally impossible. The
  skipped test is unskipped and passing. Original framing, for the record — two options: (a) price `addOns`
  in `calculateItemEffectiveCardPrice`/`…CashPrice` alongside `modifiers` — correct if `addOns`
  stays a first-class concept, but must not double-count if anything ever folds them into
  `baseCardPrice`; or (b) delete the concept and migrate the remaining read sites (receipts,
  printing, `cartShapeReconcile`, online-order detail) onto `modifiers`. **Decide before §4.2**,
  since the differential test's corpus has to know whether an add-on changes a total.
  Test currently `it.skip`-ped in `__tests__/order-calculator.test.ts` with the reasoning inline.
- **`orders_pkey` constraint name.** `create_order_v4` matches on it via
  `GET STACKED DIAGNOSTICS … CONSTRAINT_NAME` to tell a racing-retry apart from an
  `order_number` collision. `orders_order_number_merchant_key` is confirmed from
  `orders_order_number_per_merchant_unique.sql`; the PK name is the Postgres default but was
  **not** verified against the live DB. Confirm before deploy:
  `SELECT conname FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND contype = 'p';`
