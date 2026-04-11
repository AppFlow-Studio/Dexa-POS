# RLS Enablement Plan — 52 Tables + 18 Always-True Policies
## Status: STEP 0 DONE — Execute steps 1–5 in order

Every column reference below was verified directly from `database.types.ts`.
No assumptions. No guessing.

---

## Complete column audit (source of truth)

| Table | Scope column | Policy pattern |
|-------|-------------|----------------|
| chargebacks | merchant_id ✅ | direct |
| customer_feedback | merchant_id ✅ | direct |
| device_alerts | merchant_id ✅ | direct |
| device_heartbeats | location_id only | direct location |
| discount_usage_log | location_id only | direct location |
| employee_daily_tips | merchant_id ✅ | direct |
| floor_plan_objects | merchant_id ✅ | direct |
| floor_plans | merchant_id ✅ | direct |
| invoice_number_sequences | merchant_id ✅ | direct |
| kds_displays | merchant_id ✅ | direct |
| kds_item_status | kds_display_id → kds_displays.merchant_id | subquery |
| kds_routing_rules | kds_display_id → kds_displays.merchant_id | subquery |
| location_category_item_overrides | location_id only | direct location |
| location_item_overrides | location_id only | direct location |
| location_menu_category_overrides | location_id only | direct location |
| location_modifier_group_overrides | merchant_id ✅ | direct |
| location_modifier_item_overrides | merchant_id ✅ | direct |
| loyalty_enrollments | merchant_id ✅ | direct |
| loyalty_programs | merchant_id ✅ | direct |
| loyalty_rewards | merchant_id ✅ | direct |
| loyalty_transactions | merchant_id ✅ | direct |
| open_item_categories | merchant_id ✅ | direct |
| order_discounts | order_id → orders.merchant_id | subquery |
| order_item_modifiers | order_item_id → order_items.order_id → orders.merchant_id | subquery |
| order_refund_items | reversal_id → reversals.merchant_id | subquery |
| order_sequences | location_id only | direct location |
| order_status_history | order_id → orders.merchant_id | subquery |
| payment_audit_log | merchant_id ✅ | direct |
| permissions | static catalog | SELECT only, true |
| printer_routing_rules | printer_id → printers.merchant_id | subquery |
| promotion_usage | merchant_id ✅ | direct |
| promotions | merchant_id ✅ | direct |
| pto_ledger | employee_id → staff_profiles.merchant_id | subquery |
| pto_policies | merchant_id ✅ | direct |
| reversals | merchant_id ✅ | direct |
| role_permissions | static catalog | SELECT only, true |
| settlement_batches | merchant_id ✅ | direct |
| shift_trade_requests | merchant_id ✅ | direct |
| shifts | merchant_id ✅ | direct |
| table_metrics | location_id only | direct location |
| table_session_events | session_id → table_sessions.merchant_id | subquery |
| table_session_tables | session_id → table_sessions.merchant_id | subquery |
| table_sessions | merchant_id ✅ | direct |
| tax_rates | location_id only | direct location |
| time_off_requests | merchant_id ✅ | direct |
| tip_distribution_details | session_id → tip_distribution_sessions.merchant_id | subquery (col is session_id NOT tip_distribution_session_id) |
| tip_distribution_sessions | merchant_id ✅ | direct |
| tip_out_rules | merchant_id ✅ | direct |
| tip_pool_configs | merchant_id ✅ | direct |
| tip_pool_role_shares | tip_pool_config_id → tip_pool_configs.merchant_id | subquery |
| user_roles | user_id = auth.uid() | self-scoped |
| carriers | clerk_org_id (no user_id) | ⚠️ see note below |

**carriers note:** The `carriers` table has no `user_id` column — it has `clerk_org_id`. The `get_my_carrier_id()` function created in Step 0 joins on `user_id` which does not exist. Before running Step 4 (carriers), someone must update `get_my_carrier_id()` to use `clerk_org_id` instead. Step 4 is isolated so all other steps can run without it.

---

## STEP 1 — Direct merchant_id tables (27 tables)

All 27 tables verified to have a `merchant_id` column. One block, safe to run.

```sql
-- utils/supabase/migrations/YYYYMMDDHHMMSS_rls_step1_direct_merchant.sql

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'chargebacks',
    'customer_feedback',
    'device_alerts',
    'employee_daily_tips',
    'floor_plan_objects',
    'floor_plans',
    'invoice_number_sequences',
    'kds_displays',
    'location_modifier_group_overrides',
    'location_modifier_item_overrides',
    'loyalty_enrollments',
    'loyalty_programs',
    'loyalty_rewards',
    'loyalty_transactions',
    'open_item_categories',
    'payment_audit_log',
    'promotion_usage',
    'promotions',
    'pto_policies',
    'reversals',
    'settlement_batches',
    'shift_trade_requests',
    'shifts',
    'table_sessions',
    'time_off_requests',
    'tip_distribution_sessions',
    'tip_out_rules',
    'tip_pool_configs'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_merchant_scope', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (
        (SELECT is_dexapos_admin())
        OR merchant_id = (SELECT user_merchant_id())
      )
      WITH CHECK (
        (SELECT is_dexapos_admin())
        OR merchant_id = (SELECT user_merchant_id())
      )
    $f$, t || '_merchant_scope', t);
    RAISE NOTICE 'Done: %', t;
  END LOOP;
END $$;
```

**Verify Step 1 ran correctly:**
```sql
SELECT t.tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relkind = 'r'
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'chargebacks','customer_feedback','device_alerts','employee_daily_tips',
    'floor_plan_objects','floor_plans','invoice_number_sequences','kds_displays',
    'location_modifier_group_overrides','location_modifier_item_overrides',
    'loyalty_enrollments','loyalty_programs','loyalty_rewards','loyalty_transactions',
    'open_item_categories','payment_audit_log','promotion_usage','promotions',
    'pto_policies','reversals','settlement_batches','shift_trade_requests','shifts',
    'table_sessions','time_off_requests','tip_distribution_sessions',
    'tip_out_rules','tip_pool_configs'
  )
ORDER BY t.tablename;
-- Every row must show: rowsecurity = true, forcerowsecurity = true
-- Count must be 28 rows
```

---

## STEP 2 — Direct location_id tables (9 tables)

All 9 verified to have `location_id` and no `merchant_id`.

```sql
-- utils/supabase/migrations/YYYYMMDDHHMMSS_rls_step2_direct_location.sql

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'device_heartbeats',
    'discount_usage_log',
    'location_category_item_overrides',
    'location_item_overrides',
    'location_menu_category_overrides',
    'order_sequences',
    'table_metrics',
    'tax_rates'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_location_scope', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL TO authenticated
      USING (
        (SELECT is_dexapos_admin())
        OR location_id = ANY(user_location_ids())
      )
      WITH CHECK (
        (SELECT is_dexapos_admin())
        OR location_id = ANY(user_location_ids())
      )
    $f$, t || '_location_scope', t);
    RAISE NOTICE 'Done: %', t;
  END LOOP;
END $$;
```

**Verify Step 2:**
```sql
SELECT t.tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relkind = 'r'
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'device_heartbeats','discount_usage_log','location_category_item_overrides',
    'location_item_overrides','location_menu_category_overrides',
    'order_sequences','table_metrics','tax_rates'
  )
ORDER BY t.tablename;
-- Count must be 8 rows, all rowsecurity=true, forcerowsecurity=true
```

---

## STEP 3 — Subquery-scoped tables (11 tables)

**Must run AFTER Steps 1 and 2.** Each subquery hits a parent table that must already have RLS enabled so that a user can't bypass tenant isolation by directly enumerating the parent.

Run as individual statements (not a loop) so a failure pinpoints the exact table.

```sql
-- utils/supabase/migrations/YYYYMMDDHHMMSS_rls_step3_subquery_scoped.sql

-- ── kds_item_status → kds_displays.merchant_id ────────────────────────────────
-- kds_displays.merchant_id verified ✅  |  FK: kds_item_status.kds_display_id → kds_displays.id
ALTER TABLE public.kds_item_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_item_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kds_item_status_merchant_scope ON public.kds_item_status;
CREATE POLICY kds_item_status_merchant_scope ON public.kds_item_status
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR kds_display_id IN (
      SELECT id FROM public.kds_displays
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR kds_display_id IN (
      SELECT id FROM public.kds_displays
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── kds_routing_rules → kds_displays.merchant_id ─────────────────────────────
-- FK: kds_routing_rules.kds_display_id → kds_displays.id
ALTER TABLE public.kds_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_routing_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kds_routing_rules_merchant_scope ON public.kds_routing_rules;
CREATE POLICY kds_routing_rules_merchant_scope ON public.kds_routing_rules
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR kds_display_id IN (
      SELECT id FROM public.kds_displays
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR kds_display_id IN (
      SELECT id FROM public.kds_displays
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── order_discounts → orders.merchant_id ─────────────────────────────────────
-- FK: order_discounts.order_id → orders.id  |  orders.merchant_id verified ✅
ALTER TABLE public.order_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_discounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_discounts_merchant_scope ON public.order_discounts;
CREATE POLICY order_discounts_merchant_scope ON public.order_discounts
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── order_item_modifiers → order_items.order_id → orders.merchant_id ─────────
-- FK: order_item_modifiers.order_item_id → order_items.id
-- order_items.order_id → orders.id  |  orders.merchant_id verified ✅
-- order_items has NO merchant_id of its own — two-hop join required
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_item_modifiers_merchant_scope ON public.order_item_modifiers;
CREATE POLICY order_item_modifiers_merchant_scope ON public.order_item_modifiers
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── order_refund_items → reversals.merchant_id ───────────────────────────────
-- FK: order_refund_items.reversal_id → reversals.id  |  reversals.merchant_id verified ✅
ALTER TABLE public.order_refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refund_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_refund_items_merchant_scope ON public.order_refund_items;
CREATE POLICY order_refund_items_merchant_scope ON public.order_refund_items
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR reversal_id IN (
      SELECT id FROM public.reversals
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR reversal_id IN (
      SELECT id FROM public.reversals
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── order_status_history → orders.merchant_id ────────────────────────────────
-- FK: order_status_history.order_id → orders.id  |  orders.merchant_id verified ✅
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_status_history_merchant_scope ON public.order_status_history;
CREATE POLICY order_status_history_merchant_scope ON public.order_status_history
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── printer_routing_rules → printers.merchant_id ─────────────────────────────
-- FK: printer_routing_rules.printer_id → printers.id  |  printers.merchant_id verified ✅
ALTER TABLE public.printer_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_routing_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS printer_routing_rules_merchant_scope ON public.printer_routing_rules;
CREATE POLICY printer_routing_rules_merchant_scope ON public.printer_routing_rules
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR printer_id IN (
      SELECT id FROM public.printers
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR printer_id IN (
      SELECT id FROM public.printers
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── pto_ledger → staff_profiles.merchant_id ──────────────────────────────────
-- FK: pto_ledger.employee_id → staff_profiles.id  |  staff_profiles.merchant_id verified ✅
-- Direct one-hop — staff_profiles has merchant_id, no need to go through location_members
ALTER TABLE public.pto_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pto_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pto_ledger_merchant_scope ON public.pto_ledger;
CREATE POLICY pto_ledger_merchant_scope ON public.pto_ledger
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR employee_id IN (
      SELECT id FROM public.staff_profiles
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR employee_id IN (
      SELECT id FROM public.staff_profiles
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── table_session_events → table_sessions.merchant_id ────────────────────────
-- FK: table_session_events.session_id → table_sessions.id  |  table_sessions.merchant_id verified ✅
ALTER TABLE public.table_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS table_session_events_merchant_scope ON public.table_session_events;
CREATE POLICY table_session_events_merchant_scope ON public.table_session_events
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.table_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.table_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── table_session_tables → table_sessions.merchant_id ────────────────────────
-- FK: table_session_tables.session_id → table_sessions.id  |  table_sessions.merchant_id verified ✅
ALTER TABLE public.table_session_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_tables FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS table_session_tables_merchant_scope ON public.table_session_tables;
CREATE POLICY table_session_tables_merchant_scope ON public.table_session_tables
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.table_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.table_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── tip_distribution_details → tip_distribution_sessions.merchant_id ─────────
-- IMPORTANT: column is session_id, NOT tip_distribution_session_id
-- FK: tip_distribution_details.session_id → tip_distribution_sessions.id
-- tip_distribution_sessions.merchant_id verified ✅
ALTER TABLE public.tip_distribution_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_distribution_details FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tip_distribution_details_merchant_scope ON public.tip_distribution_details;
CREATE POLICY tip_distribution_details_merchant_scope ON public.tip_distribution_details
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.tip_distribution_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR session_id IN (
      SELECT id FROM public.tip_distribution_sessions
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );

-- ── tip_pool_role_shares → tip_pool_configs.merchant_id ──────────────────────
-- FK: tip_pool_role_shares.tip_pool_config_id → tip_pool_configs.id
-- tip_pool_configs.merchant_id verified ✅
ALTER TABLE public.tip_pool_role_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_pool_role_shares FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tip_pool_role_shares_merchant_scope ON public.tip_pool_role_shares;
CREATE POLICY tip_pool_role_shares_merchant_scope ON public.tip_pool_role_shares
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR tip_pool_config_id IN (
      SELECT id FROM public.tip_pool_configs
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR tip_pool_config_id IN (
      SELECT id FROM public.tip_pool_configs
      WHERE merchant_id = (SELECT user_merchant_id())
    )
  );
```

**Verify Step 3:**
```sql
SELECT t.tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relkind = 'r'
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'kds_item_status','kds_routing_rules','order_discounts','order_item_modifiers',
    'order_refund_items','order_status_history','printer_routing_rules','pto_ledger',
    'table_session_events','table_session_tables','tip_distribution_details','tip_pool_role_shares'
  )
ORDER BY t.tablename;
-- Count must be 12 rows, all rowsecurity=true, forcerowsecurity=true
```

---

## STEP 4 — Reference + user_roles (3 tables)

```sql
-- utils/supabase/migrations/YYYYMMDDHHMMSS_rls_step4_reference.sql

-- permissions: static catalog, all staff need to read this to check their permissions
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_authenticated_read ON public.permissions;
CREATE POLICY permissions_authenticated_read ON public.permissions
  FOR SELECT TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy — only service_role can write

-- role_permissions: static role-to-permission mapping, read-only for all staff
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_authenticated_read ON public.role_permissions;
CREATE POLICY role_permissions_authenticated_read ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy — only service_role can write

-- user_roles: per-user Clerk role assignments
-- user_id stores the Clerk user ID as text matching auth.uid()
-- Users may only read their own row; writes are service_role only
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);
-- No write policy — service_role manages role assignments
```

**Verify Step 4:**
```sql
SELECT t.tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relkind = 'r'
WHERE t.schemaname = 'public'
  AND t.tablename IN ('permissions','role_permissions','user_roles')
ORDER BY t.tablename;
-- Count: 3 rows, all true

-- Confirm a regular user can read permissions catalog:
SELECT count(*) FROM permissions;         -- expect: > 0 (all catalog rows)
SELECT count(*) FROM role_permissions;    -- expect: > 0 (all catalog rows)

-- Confirm user_roles is self-scoped (run as a regular logged-in user):
SELECT count(*) FROM user_roles;          -- expect: 1 (only own row)
```

---

## STEP 5 — Fix always-true policies (13 tables)

Before running, get the **exact** existing policy names so the DROP statements hit correctly:

```sql
-- Run this FIRST and compare output to the DROP statements below.
-- If names differ, update the DROP statements to match exactly.
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN (
  'phone_verifications',
  'session_kick_notifications',
  'online_orders',
  'online_order_sessions',
  'online_order_payment_intents',
  'online_store_config',
  'online_store_pages',
  'customer_saved_addresses',
  'menu_item_discounts',
  'modifier_group_item_recipes',
  'delivery_zones',
  'cfd_carousel_images',
  'cfd_ordering_panel_images'
)
ORDER BY tablename, policyname;
```

```sql
-- ── phone_verifications ⚠️ CRITICAL ──────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to phone verifications" ON public.phone_verifications;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verifications FORCE ROW LEVEL SECURITY;

-- ── session_kick_notifications ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow insert kick notifications" ON public.session_kick_notifications;
DROP POLICY IF EXISTS "Anyone can view kick notifications" ON public.session_kick_notifications;
DROP POLICY IF EXISTS "Devices can view their own kick notifications" ON public.session_kick_notifications;
ALTER TABLE public.session_kick_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_kick_notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY session_kick_notifications_location_scope 
ON public.session_kick_notifications
FOR ALL TO authenticated
USING (
  session_id IN (
    SELECT id FROM public.station_sessions
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
)
WITH CHECK (
  session_id IN (
    SELECT id FROM public.station_sessions
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
);

-- ── online_orders ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on online_orders" ON public.online_orders;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY online_orders_merchant_scope 
ON public.online_orders
FOR ALL TO authenticated
USING (merchant_id = (SELECT user_merchant_id())::uuid)
WITH CHECK (merchant_id = (SELECT user_merchant_id())::uuid);

-- ── online_order_sessions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to order sessions" ON public.online_order_sessions;
DROP POLICY IF EXISTS "Sessions readable by session owner or service role" ON public.online_order_sessions;
ALTER TABLE public.online_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY online_order_sessions_merchant_scope 
ON public.online_order_sessions
FOR SELECT TO authenticated
USING (
  store_config_id IN (
    SELECT id FROM public.online_store_config
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
);

-- ── online_order_payment_intents ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to payment intents" ON public.online_order_payment_intents;
ALTER TABLE public.online_order_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_payment_intents FORCE ROW LEVEL SECURITY;

CREATE POLICY online_order_payment_intents_merchant_scope 
ON public.online_order_payment_intents
FOR ALL TO authenticated
USING (merchant_id = (SELECT user_merchant_id())::uuid)
WITH CHECK (merchant_id = (SELECT user_merchant_id())::uuid);

-- ── online_store_config ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to store configs" ON public.online_store_config;
DROP POLICY IF EXISTS "Public can read active store configs" ON public.online_store_config;
ALTER TABLE public.online_store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_store_config FORCE ROW LEVEL SECURITY;

CREATE POLICY online_store_config_public_read 
ON public.online_store_config
FOR SELECT TO anon, authenticated
USING (is_active = true);

CREATE POLICY online_store_config_merchant_write 
ON public.online_store_config
FOR ALL TO authenticated
USING (merchant_id = (SELECT user_merchant_id())::uuid)
WITH CHECK (merchant_id = (SELECT user_merchant_id())::uuid);

-- ── online_store_pages ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to store pages" ON public.online_store_pages;
DROP POLICY IF EXISTS "Public can read visible store pages" ON public.online_store_pages;
ALTER TABLE public.online_store_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_store_pages FORCE ROW LEVEL SECURITY;

CREATE POLICY online_store_pages_public_read 
ON public.online_store_pages
FOR SELECT TO anon, authenticated
USING (is_visible = true);

CREATE POLICY online_store_pages_merchant_write 
ON public.online_store_pages
FOR ALL TO authenticated
USING (
  store_config_id IN (
    SELECT id FROM public.online_store_config
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
)
WITH CHECK (
  store_config_id IN (
    SELECT id FROM public.online_store_config
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
);

-- ── customer_saved_addresses ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to saved addresses" ON public.customer_saved_addresses;
ALTER TABLE public.customer_saved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_saved_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_saved_addresses_own 
ON public.customer_saved_addresses
FOR ALL TO authenticated
USING (customer_id = (SELECT auth.uid()))
WITH CHECK (customer_id = (SELECT auth.uid()));

-- ── menu_item_discounts ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "menu_item_discounts_all" ON public.menu_item_discounts;
ALTER TABLE public.menu_item_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_discounts FORCE ROW LEVEL SECURITY;

CREATE POLICY menu_item_discounts_merchant_scope 
ON public.menu_item_discounts
FOR ALL TO authenticated
USING (merchant_id = (SELECT user_merchant_id())::uuid)
WITH CHECK (merchant_id = (SELECT user_merchant_id())::uuid);

-- ── modifier_group_item_recipes ───────────────────────────────────────────────
DROP POLICY IF EXISTS "grant all to auth users" ON public.modifier_group_item_recipes;
DROP POLICY IF EXISTS "modifier_group_item_recipes_delete" ON public.modifier_group_item_recipes;
DROP POLICY IF EXISTS "modifier_group_item_recipes_insert" ON public.modifier_group_item_recipes;
DROP POLICY IF EXISTS "modifier_group_item_recipes_select" ON public.modifier_group_item_recipes;
DROP POLICY IF EXISTS "modifier_group_item_recipes_update" ON public.modifier_group_item_recipes;
ALTER TABLE public.modifier_group_item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_group_item_recipes FORCE ROW LEVEL SECURITY;

CREATE POLICY modifier_group_item_recipes_merchant_scope 
ON public.modifier_group_item_recipes
FOR ALL TO authenticated
USING (merchant_id = (SELECT user_merchant_id())::uuid)
WITH CHECK (merchant_id = (SELECT user_merchant_id())::uuid);

-- ── delivery_zones ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read active delivery zones" ON public.delivery_zones;
DROP POLICY IF EXISTS "Service role full access to delivery zones" ON public.delivery_zones;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones FORCE ROW LEVEL SECURITY;

CREATE POLICY delivery_zones_public_read 
ON public.delivery_zones
FOR SELECT TO anon, authenticated
USING (is_active = true);

CREATE POLICY delivery_zones_merchant_write 
ON public.delivery_zones
FOR ALL TO authenticated
USING (
  store_config_id IN (
    SELECT id FROM public.online_store_config
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
)
WITH CHECK (
  store_config_id IN (
    SELECT id FROM public.online_store_config
    WHERE merchant_id = (SELECT user_merchant_id())::uuid
  )
);

-- ── cfd_carousel_images ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.cfd_carousel_images;
DROP POLICY IF EXISTS "Enable read access for public" ON public.cfd_carousel_images;
ALTER TABLE public.cfd_carousel_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfd_carousel_images FORCE ROW LEVEL SECURITY;

CREATE POLICY cfd_carousel_images_public_read 
ON public.cfd_carousel_images
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY cfd_carousel_images_location_write 
ON public.cfd_carousel_images
FOR ALL TO authenticated
USING (location_id = ANY((SELECT user_location_ids())::uuid[]))
WITH CHECK (location_id = ANY((SELECT user_location_ids())::uuid[]));

-- ── cfd_ordering_panel_images ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated users to delete CFD ordering panel images" ON public.cfd_ordering_panel_images;
DROP POLICY IF EXISTS "Allow authenticated users to insert CFD ordering panel images" ON public.cfd_ordering_panel_images;
DROP POLICY IF EXISTS "Allow authenticated users to read CFD ordering panel images" ON public.cfd_ordering_panel_images;
DROP POLICY IF EXISTS "Allow authenticated users to update CFD ordering panel images" ON public.cfd_ordering_panel_images;
ALTER TABLE public.cfd_ordering_panel_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfd_ordering_panel_images FORCE ROW LEVEL SECURITY;

CREATE POLICY cfd_ordering_panel_images_public_read 
ON public.cfd_ordering_panel_images
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY cfd_ordering_panel_images_location_write 
ON public.cfd_ordering_panel_images
FOR ALL TO authenticated
USING (location_id = ANY((SELECT user_location_ids())::uuid[]))
WITH CHECK (location_id = ANY((SELECT user_location_ids())::uuid[]));
```

---

## STEP 6 — Carriers (blocked — fix get_my_carrier_id() first)

The `carriers` table has columns: `clerk_org_id, created_at, id, name, public_metadata, updated_at`.
There is **no `user_id` column**. The `get_my_carrier_id()` function created in Step 0 joins on `user_id` which does not exist — it will always return NULL, which would lock everyone out.

**Before running this step:**
1. Determine how a logged-in user maps to a carrier (via `clerk_org_id`? via a junction table?)
2. Update `get_my_carrier_id()` to use the correct column
3. Then run:

```sql
-- utils/supabase/migrations/YYYYMMDDHHMMSS_rls_step6_carriers.sql
-- Only run after fixing get_my_carrier_id()

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carriers_scope ON public.carriers;
CREATE POLICY carriers_scope ON public.carriers
  FOR ALL TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR id = (SELECT get_my_carrier_id())
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR id = (SELECT get_my_carrier_id())
  );
```

---

## Final verification — run after all steps complete

```sql
-- 1. Confirm all 52 tables have RLS enabled
SELECT t.tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relkind = 'r'
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    -- Step 1 (28)
    'chargebacks','customer_feedback','device_alerts','employee_daily_tips',
    'floor_plan_objects','floor_plans','invoice_number_sequences','kds_displays',
    'location_modifier_group_overrides','location_modifier_item_overrides',
    'loyalty_enrollments','loyalty_programs','loyalty_rewards','loyalty_transactions',
    'open_item_categories','payment_audit_log','promotion_usage','promotions',
    'pto_policies','reversals','settlement_batches','shift_trade_requests','shifts',
    'table_sessions','time_off_requests','tip_distribution_sessions',
    'tip_out_rules','tip_pool_configs',
    -- Step 2 (8)
    'device_heartbeats','discount_usage_log','location_category_item_overrides',
    'location_item_overrides','location_menu_category_overrides',
    'order_sequences','table_metrics','tax_rates',
    -- Step 3 (12)
    'kds_item_status','kds_routing_rules','order_discounts','order_item_modifiers',
    'order_refund_items','order_status_history','printer_routing_rules','pto_ledger',
    'table_session_events','table_session_tables','tip_distribution_details','tip_pool_role_shares',
    -- Step 4 (3)
    'permissions','role_permissions','user_roles'
  )
ORDER BY c.relrowsecurity, t.tablename;
-- Expected: 51 rows, ALL rowsecurity=true, ALL forcerowsecurity=true
-- (carriers excluded until Step 6 is unblocked)

-- 2. Cross-tenant isolation test (run as merchant_a, replace uuid with a real merchant_b id)
SELECT count(*) FROM shifts            WHERE merchant_id = '<merchant_b_uuid>'; -- expect: 0
SELECT count(*) FROM table_sessions    WHERE merchant_id = '<merchant_b_uuid>'; -- expect: 0
SELECT count(*) FROM kds_displays      WHERE merchant_id = '<merchant_b_uuid>'; -- expect: 0

-- 3. Cross-tenant write blocked test
UPDATE shifts SET notes = 'hack' WHERE merchant_id = '<merchant_b_uuid>'; -- expect: 0 rows affected

-- 4. phone_verifications locked down
SELECT count(*) FROM phone_verifications; -- expect: 0 rows or "permission denied"

-- 5. HQ admin bypass (run as a user whose user_roles.role_code = 'hq_admin')
SELECT count(*) FROM shifts; -- expect: all rows across all merchants
```

---

## Execution order summary

| Step | File suffix | Tables | Prerequisite |
|------|------------|--------|-------------|
| 1 | rls_step1_direct_merchant | 28 | Step 0 done ✅ |
| 2 | rls_step2_direct_location | 8 | Step 0 done ✅ |
| 3 | rls_step3_subquery_scoped | 12 | Steps 1 + 2 must be done first |
| 4 | rls_step4_reference | 3 | Independent |
| 5 | rls_step5_fix_always_true | 13 | Independent |
| 6 | rls_step6_carriers | 1 | ⚠️ Blocked — fix get_my_carrier_id() first |
