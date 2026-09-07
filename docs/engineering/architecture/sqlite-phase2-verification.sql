-- ===========================================================================
-- Phase 2 verification — run before marking the delta sync engine done.
--
-- Run against STAGING first (dfwqakoyittmrwbqvxgw), then PRODUCTION
-- (hifouuofcaytijrkbvcy) for the sizing queries in section B — staging row
-- counts are not representative and would produce meaningless retention caps.
--
-- Record the answer under each query. Section A is blocking: if any of those
-- fail, the engine is wrong (not just unmeasured) and the fix comes before
-- integration.
-- ===========================================================================


-- ###########################################################################
-- SECTION A — BLOCKING
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- A1. Is there an index supporting the delta query?   ** MOST IMPORTANT **
--
-- The engine filters and orders on (location_id, updated_at, id). Without a
-- matching index every delta page is a sequential scan of `orders` — which
-- would make the delta SLOWER than the full fetch it replaces, and the whole
-- Phase 2 design would need rethinking (or an index migration filed first).
--
-- PASS: an index whose leading columns are (location_id, updated_at) or
--       (location_id, updated_at, id).
-- FAIL: only (location_id, created_at) / (location_id, status) / nothing.
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'order_payments')
ORDER BY tablename, indexname;


-- ---------------------------------------------------------------------------
-- A2. Does the delta query actually USE that index, and what does RLS cost?
--
-- Substitute a real location_id and a recent timestamp. Run it twice: once as
-- shown, once with the `or (...)` clause removed, to isolate the keyset cost.
--
-- PASS: Index Scan / Index Only Scan on the A1 index, execution time in the
--       low tens of ms.
-- FAIL: Seq Scan on orders, or a Filter line mentioning an RLS policy that
--       dominates the runtime.
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, updated_at
FROM public.orders
WHERE location_id = '<PASTE-LOCATION-UUID>'
  AND (updated_at > '2026-08-01T00:00:00Z'
       OR (updated_at = '2026-08-01T00:00:00Z' AND id > '00000000-0000-0000-0000-000000000000'))
ORDER BY updated_at ASC, id ASC
LIMIT 200;


-- ---------------------------------------------------------------------------
-- A3. VERIFY-PAYMENT-TOUCH  ** THE ONE I FLAGGED **
--
-- order_payments has NO updated_at, so payments are re-pulled only when the
-- PARENT order's updated_at moves. That is correct only if every payment
-- mutation touches the order row.
--
-- PASS: touches_orders = true for void_payment AND adjust_tips_v2.
-- FAIL: either is false -> a voided payment or a tip adjustment stays stale in
--       the mirror forever. Money-visible. Fix belongs in the RPC.
-- ---------------------------------------------------------------------------
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) ~* 'update\s+(public\.)?orders'        AS touches_orders,
  pg_get_functiondef(p.oid) ~* 'updated_at'                        AS mentions_updated_at,
  pg_get_functiondef(p.oid) ~* 'sync_version'                      AS bumps_sync_version
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'void_payment', 'adjust_tips_v2', 'process_payment_v8',
    'void_order_item', 'remove_order_item', 'add_order_item_v4',
    'update_order_item_v2', 'close_check', 'reopen_check',
    'cancel_order', 'send_order_to_kitchen_v1'
  )
ORDER BY touches_orders, p.proname;


-- ---------------------------------------------------------------------------
-- A4. Is updated_at maintained by a TRIGGER, or by RPC discipline?
--
-- This is the difference between "the delta is structurally safe" and "the
-- delta is safe as long as every one of ~90 RPCs remembers".
--
-- PASS (best): a BEFORE UPDATE trigger on orders setting updated_at = now().
--              Then A3 only needs to show the orders row is touched at all.
-- ELSE:        A3 becomes the real gate, and any future RPC that forgets is a
--              silent mirror bug. Worth filing the trigger as a ticket.
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  t.tgname  AS trigger_name,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('orders', 'order_items', 'order_payments')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ---------------------------------------------------------------------------
-- A5. Do ties on updated_at actually occur?
--
-- The (updated_at, id) keyset tiebreak exists because two rows can share a
-- timestamp — and Postgres now() is transaction-start, so anything updating
-- multiple orders in one transaction produces EXACT ties.
--
-- Any non-zero tied_rows proves the tiebreak is load-bearing, not defensive
-- code. Zero would be worth a second look — it may mean this query's window is
-- too small rather than that ties never happen.
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                              AS rows_30d,
  count(DISTINCT (location_id, updated_at))             AS distinct_pairs,
  count(*) - count(DISTINCT (location_id, updated_at))  AS tied_rows
FROM public.orders
WHERE updated_at > now() - interval '30 days';

-- The worst tie group — page size must comfortably exceed this, or a single
-- page could be entirely one timestamp and the cursor could fail to advance.
SELECT location_id, updated_at, count(*) AS n
FROM public.orders
WHERE updated_at > now() - interval '30 days'
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY n DESC
LIMIT 10;


-- ---------------------------------------------------------------------------
-- A6. Every promoted column exists, spelled exactly as the local schema has it.
--
-- A typo here is silent: the column comes back undefined, maps to NULL, and
-- the mirror quietly holds nothing for that field. This is the check that a
-- draft of this plan needed and did not have — several column names were
-- invented (total_cents, is_available, last_order_at).
--
-- PASS: zero rows returned.
-- FAIL: any row = a column my schema promotes that does not exist on remote.
-- ---------------------------------------------------------------------------
WITH expected(col) AS (VALUES
  ('id'),('location_id'),('merchant_id'),('order_number'),('display_number'),
  ('order_type'),('order_source'),('status'),('payment_status'),('check_status'),
  ('customer_id'),('customer_name'),('customer_phone'),('customer_email'),
  ('table_number'),('seat_number'),('session_id'),
  ('assigned_server_id'),('created_by_staff_id'),('station_id'),('device_id'),
  ('subtotal'),('tax_amount'),('total_amount'),('discount_amount'),
  ('service_charge'),('tip_amount'),('amount_due'),('amount_paid'),
  ('card_subtotal'),('card_tax_amount'),('card_total'),
  ('cash_subtotal'),('cash_tax_amount'),('cash_total'),('cash_amount_due'),
  ('cash_discount_amount'),('effective_total'),
  ('voided_at'),('void_reason'),('voided_by'),('cancelled_at'),('cancellation_reason'),
  ('sent_to_kitchen_at'),('ready_at'),('completed_at'),
  ('is_offline'),('reopen_count'),('created_at'),('updated_at'),('sync_version')
)
SELECT e.col AS missing_from_remote
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name   = 'orders'
 AND c.column_name  = e.col
WHERE c.column_name IS NULL;

-- Same check for order_items.
WITH expected(col) AS (VALUES
  ('id'),('order_id'),('menu_item_id'),('menu_id'),('category_id'),
  ('item_name'),('category_name'),('menu_name'),('quantity'),
  ('unit_price'),('subtotal'),('tax_amount'),
  ('cash_unit_price'),('cash_subtotal'),('cash_tax_amount'),
  ('discount_amount'),('pre_discount_subtotal'),
  ('item_status'),('kitchen_status'),('course_number'),('seat_number'),
  ('display_order'),('is_voided'),('voided_at'),('void_reason'),
  ('is_to_go'),('is_prioritized'),('rush'),
  ('special_instructions'),('kitchen_notes'),
  ('selected_size_id'),('selected_size_name'),('created_at'),('updated_at')
)
SELECT e.col AS missing_from_remote
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = 'order_items' AND c.column_name = e.col
WHERE c.column_name IS NULL;

-- Same check for order_payments.
WITH expected(col) AS (VALUES
  ('id'),('order_id'),('location_id'),('device_id'),('payment_method'),
  ('amount'),('tip_amount'),('amount_tendered'),('change_given'),
  ('dual_pricing_fee'),('discount_portion'),
  ('is_cash_priced'),('is_voided'),('is_returned'),('is_settled'),
  ('card_last_four'),('card_type'),('auth_code'),('covers_items'),
  ('idempotency_key'),('initiated_at'),('approved_at'),('captured_at'),
  ('failed_at'),('voided_at')
)
SELECT e.col AS missing_from_remote
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = 'order_payments' AND c.column_name = e.col
WHERE c.column_name IS NULL;


-- ---------------------------------------------------------------------------
-- A7. Confirm order_payments genuinely has no watermark of its own.
--
-- The whole "payments as children of the parent order" design rests on this.
-- If an updated_at was added since database.types.ts was generated, payments
-- should get their own cursor and the parent-touch dependency disappears.
--
-- PASS: updated_at and created_at both absent.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_payments'
  AND column_name IN ('updated_at','created_at','initiated_at','approved_at','voided_at')
ORDER BY column_name;


-- ---------------------------------------------------------------------------
-- A8. Can an order ever be HARD deleted?
--
-- Decides whether the manifest reconcile is a real mechanism or a formality.
-- confdeltype: a = no action, r = restrict, c = cascade, n = set null.
--
-- 'a'/'r' on order_items -> an order with items cannot be deleted at all, so
--          hard deletes are effectively impossible and the manifest can run
--          rarely (business-day rollover is plenty).
-- 'c'    -> hard deletes are possible and silent; keep the manifest honest.
-- ---------------------------------------------------------------------------
SELECT
  con.conname,
  src.relname  AS child_table,
  tgt.relname  AS parent_table,
  con.confdeltype AS on_delete
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
WHERE con.contype = 'f'
  AND tgt.relname = 'orders'
ORDER BY src.relname;


-- ---------------------------------------------------------------------------
-- A9. Sanity: does updated_at ever go BACKWARDS or precede created_at?
--
-- A bulk restore or a migration that rewrote timestamps would make the delta
-- skip rows permanently — the cursor would already be past them.
--
-- PASS: zero rows.
-- ---------------------------------------------------------------------------
SELECT count(*) AS rows_with_updated_before_created
FROM public.orders
WHERE updated_at < created_at;


-- ###########################################################################
-- SECTION B — SIZING (run on PRODUCTION; feeds the retention caps)
--
-- The caps in lib/db/entities.ts are marked PROVISIONAL and are NOT derived
-- values. These are the server half of the derivation; the device half is
-- lib/db/measure.ts (bytes-per-row on the lowest-spec tablet).
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- B1. Order volume per location — "how many orders is a day, really?"
-- Feeds: how far back `maxRows: 2000` actually reaches at a busy site.
-- ---------------------------------------------------------------------------
SELECT
  location_id,
  count(*)                                             AS orders_30d,
  round(count(*)::numeric / 30, 1)                     AS orders_per_day,
  round(2000.0 / NULLIF(count(*)::numeric / 30, 0), 1) AS days_of_history_at_cap_2000
FROM public.orders
WHERE created_at > now() - interval '30 days'
GROUP BY location_id
ORDER BY orders_30d DESC
LIMIT 20;


-- ---------------------------------------------------------------------------
-- B2. Payload weight — items and payments per order.
-- Feeds: bytes-per-row, which varies a lot between a 2-item and a 20-item order.
-- ---------------------------------------------------------------------------
SELECT
  round(avg(item_count), 2)                                        AS avg_items,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY item_count)         AS p95_items,
  max(item_count)                                                  AS max_items,
  round(avg(payment_count), 2)                                     AS avg_payments
FROM (
  SELECT o.id,
         (SELECT count(*) FROM order_items    i WHERE i.order_id = o.id) AS item_count,
         (SELECT count(*) FROM order_payments p WHERE p.order_id = o.id) AS payment_count
  FROM public.orders o
  WHERE o.created_at > now() - interval '7 days'
) s;


-- ---------------------------------------------------------------------------
-- B3. Server-side bytes per order, as a first approximation of local size.
-- The local row is smaller (no indexes we don't build, payload is trimmed) but
-- this brackets the answer before the device measurement runs.
-- ---------------------------------------------------------------------------
SELECT
  pg_size_pretty(pg_total_relation_size('public.orders'))         AS orders_total,
  pg_size_pretty(pg_total_relation_size('public.order_items'))    AS items_total,
  pg_size_pretty(pg_total_relation_size('public.order_payments')) AS payments_total,
  (SELECT count(*) FROM public.orders)                            AS order_rows,
  pg_total_relation_size('public.orders')
    / NULLIF((SELECT count(*) FROM public.orders), 0)             AS bytes_per_order_row;


-- ---------------------------------------------------------------------------
-- B4. Delta churn — how many orders change per minute at peak?
-- Validates DEFAULT_PAGE_SIZE = 200 and the sync interval. If a busy minute
-- changes 40 orders, one 200-row page per cycle is comfortable.
-- ---------------------------------------------------------------------------
SELECT
  date_trunc('minute', updated_at) AS minute,
  count(*)                          AS orders_changed
FROM public.orders
WHERE updated_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY orders_changed DESC
LIMIT 20;


-- ###########################################################################
-- SECTION C — FORWARD (not blocking Phase 2; bank the answers now)
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- C1. Is orders.id client-suppliable? (The Phase 6 Identity Gate.)
-- PASS: data_type = uuid, column_default = gen_random_uuid() (or similar).
--       A default means the column accepts a supplied value AND generates one
--       when omitted — which is exactly what client-minted UUIDs need.
-- ---------------------------------------------------------------------------
SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders','order_items')
  AND column_name = 'id';


-- ---------------------------------------------------------------------------
-- C2. Does create_order_v3 / add_order_item_v4 already have an id parameter?
-- Confirms the Phase 6 server work is genuinely needed and scopes it.
-- ---------------------------------------------------------------------------
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_order_v3','create_order_v2','add_order_item_v4','add_order_item_v3')
ORDER BY p.proname;


-- ---------------------------------------------------------------------------
-- C3. Menu price resolution — confirms the local menu must mirror the RESOLVED
-- RPC output rather than the normalized tables (Phase 4).
-- Lists the tables that participate in an item's effective price/availability.
-- ---------------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('custom_price','custom_cash_price','is_available','availability','price','cash_price')
ORDER BY table_name, column_name;


-- ---------------------------------------------------------------------------
-- C4. Tombstone coverage — which mirrored tables can express "deleted"?
-- Confirms the §7.4 correction (voids/deactivations ARE soft deletes and ride
-- the delta) across every entity, not just orders.
-- ---------------------------------------------------------------------------
SELECT table_name,
       bool_or(column_name = 'is_active')   AS has_is_active,
       bool_or(column_name = 'is_voided')   AS has_is_voided,
       bool_or(column_name = 'voided_at')   AS has_voided_at,
       bool_or(column_name = 'availability') AS has_availability,
       bool_or(column_name = 'deleted_at')  AS has_deleted_at
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders','order_items','order_payments','menu_items',
                     'menu_categories','inventory_items','vendors','customers',
                     'location_members','staff_profiles')
GROUP BY table_name
ORDER BY table_name;


-- ###########################################################################
-- SECTION D — FOLLOW-UPS RAISED BY THE A4 RESULTS (2026-08-28)
--
-- A4 answered better than hoped: `update_orders_updated_at` is an
-- UNCONDITIONAL BEFORE UPDATE FOR EACH ROW trigger, so any write to an order
-- bumps updated_at. The delta is structurally safe, not dependent on ~90 RPCs
-- each remembering. Same for order_items.
--
-- Two follow-ups fall out of it.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- D1. Does now() vs clock_timestamp() confirm the late-commit hazard?
--
-- update_updated_at_column() is the linchpin: every mirrored table's watermark
-- comes from it. If it stamps now() (transaction START), then a long
-- transaction writes a timestamp EARLIER than rows already committed by
-- shorter transactions that began later — and a naive cursor skips it
-- permanently. lib/db/syncEngine.ts WATERMARK_LAG_MS defends against exactly
-- this; this query confirms the premise.
--
-- EXPECT: 'now()' or 'CURRENT_TIMESTAMP' (both transaction-start) -> the lag is
--         required, keep it.
-- IF     'clock_timestamp()' -> stamps wall-clock at statement time. The hazard
--         is narrower but NOT gone (visibility still lags assignment), so keep
--         the lag; it could be reduced.
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column';


-- ---------------------------------------------------------------------------
-- D2. Does the payment trigger actually touch the ORDER row?
--
-- This is what would close VERIFY-PAYMENT-TOUCH structurally.
--
-- trg_update_effective_totals_on_payment fires AFTER INSERT OR DELETE OR
-- UPDATE on order_payments. If trigger_update_effective_totals_on_payment()
-- runs `UPDATE orders ...`, that fires update_orders_updated_at, the order's
-- watermark moves, and the delta re-pulls the order WITH its payments. Every
-- payment mutation then propagates, no matter which RPC made it — and
-- void_payment / adjust_tips_v2 stop mattering individually.
--
-- PASS: updates_orders = true AND unconditional_update = true.
-- CAUTION: if the function early-returns when totals are unchanged, a
--          TIP-ONLY adjustment might not bump the order (tips may not be part
--          of "effective totals"). Read the body for guard clauses — that is
--          the one case this trigger might not cover.
-- ---------------------------------------------------------------------------
SELECT
  p.proname,
  pg_get_functiondef(p.oid) ~* 'update\s+(public\.)?orders'  AS updates_orders,
  pg_get_functiondef(p.oid) ~* '\breturn\b.*\bif\b|\bif\b.*\breturn\b' AS has_guard_clauses,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'trigger_update_effective_totals_on_payment';


-- ---------------------------------------------------------------------------
-- D3. Do the other mirrored tables have the same updated_at trigger?
--
-- Phases 4-6 depend on menu_items / inventory_items / customers /
-- location_members carrying a trustworthy watermark. A table WITHOUT this
-- trigger needs its RPCs audited before its delta can be trusted.
--
-- PASS: every table listed has an `update_*_updated_at` BEFORE UPDATE trigger.
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  count(*) FILTER (
    WHERE pg_get_triggerdef(t.oid) ~* 'BEFORE UPDATE'
      AND pg_get_triggerdef(t.oid) ~* 'update_updated_at_column'
  ) AS has_updated_at_trigger
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND NOT t.tgisinternal
WHERE n.nspname = 'public'
  AND c.relname IN ('menu_items','menu_categories','modifier_groups',
                    'inventory_items','vendors','customers',
                    'location_members','staff_profiles')
GROUP BY c.relname
ORDER BY has_updated_at_trigger, c.relname;
