# Online Orders — "Today" tab loses orders (Charcoal Gardenia)

**Status:** root cause confirmed. Fix written, **NOT verified**. Several unrelated defects found along the way.
**Investigated:** 2026-08-13
**Location:** CHARCOAL GARDENIA — `5afc6641-e98f-4c81-8d9d-d9691b5c28dc`, Staten Island NY
**DB:** production (`hifouuofcaytijrkbvcy`)

---

## 1. The complaint

Restaurant received online orders, but had to switch the Online Orders page to the
**Yesterday** tab to see them. Reported as if orders were being filed to the wrong day.

**Video evidence (night of Aug 12):**
- Today tab showed only **#0002 (22:09)** and **#0003 (23:33)**
- Six online orders had actually been received that evening (16:00 → 23:33)
- Yesterday tab showed those same 2 **plus** 11 more in Done

---

## 2. Root cause (CONFIRMED)

**Completed online orders are evicted from the local store, and the Today tab reads only the local store.**

The chain, all verified in code:

1. **Today never queries the server.** `needsHistoricalFetch = filter.preset !== "today"`
   — [`hooks/orders/useOnlineOrdersByDate.ts:60`](../hooks/orders/useOnlineOrdersByDate.ts#L60).
   Confirmed by the screen's own comment: `// Today: useOnlineOrders() is the single source of truth.`
   — [`app/(main)/online-orders/index.tsx:186`](<../app/(main)/online-orders/index.tsx#L186>)

2. **The selector has no date filter** — it returns whatever online orders are in the
   Zustand store — [`stores/selectors/orderSelectors.ts:1031-1049`](../stores/selectors/orderSelectors.ts#L1031-L1049)

3. **The active-orders query excludes `completed`:**
   ```sql
   AND o.status IN ('draft','pending','sent_to_kitchen','preparing','ready')
   AND (p_business_day_start IS NULL OR o.created_at >= p_business_day_start)
   ```
   — [`utils/supabase/migrations/get_active_orders_v1.sql:83-84`](../utils/supabase/migrations/get_active_orders_v1.sql#L83-L84)
   (`accepted` is also missing, though it exists in `STATUS_RANK` — likely the same bug.)

4. **`hydrateWorkspace` rebuilds the store from that result:**
   `newOrdersById = { ...preserved, ...serverMap }`
   — [`hooks/pos/useOrdersQuery.ts:236`](../hooks/pos/useOrdersQuery.ts#L236).
   `preserved` covers only unsynced orders and orders with non-DB items. A synced,
   completed online order is in neither → **dropped**.

5. Any hydrate triggers it: app resume past the 2-min gate
   ([`contexts/PosSyncProvider.tsx:798-802`](../contexts/PosSyncProvider.tsx#L798-L802)),
   realtime reconnect, offline-sync invalidation.

So completed online orders live in the store only from the realtime broadcast that
delivered them, until the next refetch wipes them. Yesterday still shows them because
that path queries the server and has **no status filter**.

### Evidence

All six Aug 12 online orders, with `updated_at` (last status change):

| # | Time (NY) | Provider | Completed at | On Today at video time? |
|---|---|---|---|---|
| #0005 | 16:00 | UberEats | 16:55 | ✗ evicted |
| #0006 | 18:43 | Grubhub | 20:07 | ✗ evicted |
| #0007 | 19:38 | DoorDash | 20:07 | ✗ evicted |
| #0001 | 21:41 | DoorDash | 21:59 | ✗ evicted |
| #0002 | 22:09 | UberEats | 23:57 | ✓ still active |
| #0003 | 23:33 | DoorDash | 23:57 | ✓ still active |

The video was shot between **23:33 and 23:57** — the only window in which exactly
#0002 and #0003 are non-completed. Matches the video precisely.

---

## 3. Two more bugs in the same file

**Live orders leak into every date window.** `mergeOrders(liveOrders, historicalOrders)`
merges the *entire unfiltered store* into Yesterday / Last 7 / custom ranges
— [`useOnlineOrdersByDate.ts:157-158`](../hooks/orders/useOnlineOrdersByDate.ts#L157-L158).
This is why the video showed the same 2 orders under Yesterday as well.

**Unordered `LIMIT 200`.** The historical query selects from `online_orders` with
`.limit(200)` and **no `ORDER BY`**, applying the date window client-side
— [`useOnlineOrdersByDate.ts:85-99`](../hooks/orders/useOnlineOrdersByDate.ts#L85-L99).
Postgres returns an arbitrary 200 rows. At ~5–10 online orders/day this location
passes 200 in about a month, so Yesterday is likely already returning a subset.

---

## 4. RULED OUT — do not re-investigate

| Theory | Verdict | Evidence |
|---|---|---|
| **Timezone not configured** (UTC fallback) | ❌ Ruled out | `locations.timezone = 'America/New_York'`, correctly set |
| **Business-day rollover** (`business_day_start_hour = 0` vs 2 AM close) | ❌ Not the cause | The status and date predicates are **ANDed**. All 6 orders were `completed`, so they fail the status predicate — no value of `business_day_start_hour` can return them. *(Still a real defect — see §6.)* |
| **Screens disagree on what "online" means** | ❌ Ruled out | July: both definitions return **39**. `source_but_no_online_row = 0`. All `orderout` (24) and `online_store` (15) rows have `online_orders` rows. |
| **`opened_at` is a separate/nullable column** | ❌ Ruled out | `opened_at: backendOrder.created_at` — [`utils/orderTransformers.ts:802`](../utils/orderTransformers.ts#L802). Not a DB column at all. |
| **DB stores UTC so dates are wrong** | ❌ Ruled out | `timestamptz` stores an absolute instant; the RPC converts correctly via `AT TIME ZONE` |
| **Previous Orders 39 vs Online Orders 34** | ✅ Explained, not a bug | Exactly 5 orders with `status = 'cancelled'`. The board filters terminal statuses by design — [`useOnlineOrdersByDate.ts:22-32`](../hooks/orders/useOnlineOrdersByDate.ts#L22-L32). None were refunded. |

---

## 5. The fix — WRITTEN, NOT VERIFIED

Uncommitted changes in [`hooks/orders/useOnlineOrdersByDate.ts`](../hooks/orders/useOnlineOrdersByDate.ts):

1. **Today now fetches from the server** like every other preset — removed the
   `needsHistoricalFetch` special case. Completed orders can no longer be lost.
2. **Query rewritten to select `FROM orders`** with `online_orders!inner`, so the date
   window, `ORDER BY created_at DESC` and `LIMIT` apply to the row that carries
   `created_at`. Kills the arbitrary-200 problem.
3. **Live orders filtered to the selected window** before merging — stops the leak.

### ⚠️ Verification still owed

- [ ] `npx tsc --noEmit` (project-wide; ~114 pre-existing errors — grep for this file)
- [ ] `npm test`
- [ ] **Manual repro on staging** — the one that actually proves it:
  1. Create an online order, let it reach `completed`
  2. Confirm it's on the Today tab
  3. Background the app **> 2 minutes**, then foreground (forces the invalidation)
  4. **Pass:** still on Today. **Fail:** vanishes, appears under Yesterday.

**Do not tell the merchant it's fixed before step 3 passes.**

### Open design question

The alternative fix — adding `completed`/`accepted` to `get_active_orders_v1` — was
rejected: it inflates the active-orders payload for every screen and every location.
Worth a second opinion.

---

## 6. Separate defects found (independent of the above)

### 6a. Order numbers reset at 8 PM local — FIX EXISTS, NOT DEPLOYED

Order-number counters key off the **UTC date**. UTC midnight = 8 PM in New York, so
numbering restarts mid-dinner-service, producing **duplicate order numbers in one night**:

| Number | First | Second |
|---|---|---|
| `#S1-0014` | Aug 12 14:02 | Aug 12 22:36 |
| `#S1-0015` | Aug 12 15:04 | Aug 12 22:49 |
| `#S1-0016` | Aug 12 15:11 | Aug 12 22:49 |

Verified across two nights — the reset lands within a minute of UTC midnight every time.

**The fix already exists:** [`supabase/migrations/20260629130000_order_numbers_location_timezone.sql`](../supabase/migrations/20260629130000_order_numbers_location_timezone.sql)
(`alidika200`, PR #133, merged 2026-07-13). Production check returns
`has_timezone_fix = false` for both `generate_order_number` and
`generate_order_number_internal` — **it was never applied**.

**To deploy:**
1. Save current definitions for rollback: `select pg_get_functiondef(oid) from pg_proc where proname in ('generate_order_number','generate_order_number_internal');`
2. Confirm staging has it applied
3. Apply **before 8 PM local** so the day key doesn't shift mid-service
4. Fixes future numbering only; existing duplicates stay

### 6b. `business_day_start_hour` vs `business_day_end_hour`

Charcoal closes at 2 AM. `business_day_end_hour = 2` (correct), but
`business_day_start_hour = 0` — and **only the latter drives any behavior** in the POS
([`get_business_day_bounds.sql:24`](../utils/supabase/migrations/get_business_day_bounds.sql#L24),
plus ~10 client call sites).

Consequence: after midnight the active-orders date filter drops the whole evening.
On the Aug 12→13 night **zero** orders were created 00:00–02:00, so Today would have
gone completely empty. Staff work past midnight on **26 of the last 60 nights**.

**The trap:** the merchant dashboard's Hours tab writes `business_day_end_hour`
(computed from the latest overnight close) and **never** `business_day_start_hour`.
So a manual `UPDATE` fixes it until someone next saves the Hours tab, then it regresses.

Options: (a) POS reads `business_day_end_hour`, (b) dashboard writes both — one line in
`HoursTab.tsx:104-113` in the website repo, (c) collapse to one column.
**Note:** the tip migrations already read `business_day_end_hour`, so tips and orders
currently roll over at *different hours* for this location.

Only affected location:
```sql
select id, name, timezone, business_day_start_hour, business_day_end_hour
from locations
where coalesce(business_day_start_hour,0) <> coalesce(business_day_end_hour,0);
```

### 6c. ~21 DB functions bucket by UTC date — UNTRIAGED

Heuristic scan (may include false positives; bodies not read). Priority order:

- **Pricing:** `get_eligible_promotions`, `manage_order_discount_v2/v3` — a daily promo would flip at 8 PM local
- **Money:** `finalize_castles_settlement`, `finalize_valor_settlement`, `manual_mark_batch_settled`, `open_cash_drawer_session` — wrong business day for reconciliation
- **Visible:** `generate_session_number` — same reset as order numbers
- **Reporting:** `get_admin_transaction_summary`, `_v2`, `get_admin_merchant_breakdown`
- **FOH:** `create_reservation`, `estimate_wait_time`, `get_waitlist`, `seat_guests_v3`
- **Low/none:** `cleanup_old_order_sequences`, `generate_subscription_invoice*`, `get_support_dashboard_stats`, `get_floor_plan_status`

**Structural recommendation:** add one helper —
`location_business_day(p_location_id) returns date` — and have all of these call it,
rather than each deriving its own date. This session found the same
"two places compute one concept, they drift" pattern three separate times.

### 6d. Provider chips may all fall into "Other" — UNVERIFIED

The taxonomy classifies providers from **`orders.delivery_platform`**
([`services/historyOrderTaxonomy.ts:384-389`](../services/historyOrderTaxonomy.ts#L384-L389)),
but the marketplace names observed in the data come from
**`online_orders.delivery_company`** — a different column, inconsistently cased
(`UBEREATS`, `DOORDASH`, `grubhub`, `OrderOut`).

If `orders.delivery_platform` is null for `orderout` orders, every one falls to the
**Other** chip instead of DoorDash/UberEats/Grubhub, per
[`providerPredicate("other")`](../services/historyOrderTaxonomy.ts#L446-L453).

```sql
select coalesce(o.delivery_platform::text,'(null)') as delivery_platform,
       coalesce(oo.delivery_company,'(null)') as delivery_company,
       count(*)
from orders o
join online_orders oo on oo.order_id = o.id
where o.location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'
group by 1,2 order by 3 desc;
```

Relevant because previous-orders channel/provider filtering is under active development.

### 6e. `kiosk` orders reachable from no "Online" view

`order_source = 'kiosk'` (13 orders in July) is not in
`ONLINE_ORDER_SOURCES = ["online","orderout","online_store"]`
([`lib/orderSource.ts:5`](../lib/orderSource.ts#L5)), so kiosk orders never appear as
Online and fall through to the Takeaway catch-all. Yet the taxonomy lists `kiosk` as a
first-party *platform* for the House provider chip — a rule that can therefore never
fire. Decide which is intended.

---

## 7. Useful queries

```sql
-- Location config
select id, name, timezone, business_day_start_hour, business_day_end_hour
from locations where id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc';

-- What SHOULD show on the board vs what the old code showed, for a given day
with w as (
  select ('2026-08-12 00:00'::timestamp at time zone 'America/New_York') as s,
         ('2026-08-13 00:00'::timestamp at time zone 'America/New_York') as e
)
select o.display_number,
       to_char(o.created_at at time zone 'America/New_York','HH24:MI') as time_ny,
       o.status, oo.provider, oo.delivery_company,
       (o.status not in ('declined','cancelled','void','voided','refunded'))
         as should_show_on_board,
       (o.status in ('draft','pending','sent_to_kitchen','preparing','ready'))
         as survived_old_today
from orders o
join online_orders oo on oo.order_id = o.id
cross join w
where o.location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'
  and o.created_at >= w.s and o.created_at < w.e
order by o.created_at;

-- Nights worked past midnight (rollover relevance)
with ev as (
  select greatest(o.created_at, coalesce(o.updated_at, o.created_at))
           at time zone 'America/New_York' as ny_ts
  from orders o
  where o.location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'
    and o.created_at >= now() - interval '60 days'
)
select date(ny_ts - interval '2 hours') as business_night,
       bool_or(ny_ts::time < time '02:00') as worked_past_midnight
from ev group by 1 order by 1 desc;

-- Is the order-number timezone fix deployed?
select proname, prosrc like '%v_location_tz%' as has_timezone_fix
from pg_proc
where proname in ('generate_order_number','generate_order_number_internal');
```

**Note on reading status columns:** `orders.status` is the value *now*, not at the time
the user was looking. Use `updated_at` to reason about when an order reached its current
state — that's how the video timing was pinned down.

---

## 8. Suggested order of work

1. **Verify the `useOnlineOrdersByDate.ts` fix** (§5) — the actual complaint
2. **Deploy `20260629130000`** (§6a) — written, reviewed, visibly broken in production
3. **Decide the `business_day_start_hour` / `end_hour` story** (§6b) — a DB-only fix regresses
4. **Triage the UTC-date functions** (§6c), money ones first
5. **Check `delivery_platform`** (§6d) if provider chips are still in flight
