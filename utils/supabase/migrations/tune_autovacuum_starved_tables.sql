-- ============================================================
-- Tune autovacuum on 14 starved tables (scale_factor 0.05)
-- File: utils/supabase/migrations/tune_autovacuum_starved_tables.sql
-- Workstream C — task C4
-- ============================================================
-- Rationale:
--   audit_logs, loyalty_programs, floor_plans, category_items,
--   cfd_carousel_images, kds_displays, loyalty_enrollments,
--   loyalty_rewards, marketing_campaigns, location_item_overrides,
--   customers, organizations, cash_drawers, cash_drawer_operations
--   are all high-velocity or medium-velocity tables that
--   accumulate bloat faster than the default 10% autovacuum
--   threshold can handle.
--
--   Setting scale_factor = 0.05 (5%) increases autovacuum
--   frequency, triggering more aggressive cleanup of dead tuples
--   and reducing bloat. Combined with analyze_scale_factor = 0.05,
--   ensures query planner stats stay fresh on frequently-mutated
--   tables.
--
--   Example: audit_logs grows with every order/payment event;
--   loyalty_programs/loyalty_rewards are updated during member
--   interactions; customers/organizations change during signups
--   and profile edits; marketing_campaigns/marketing_recipients
--   churn on campaign lifecycle; cash_drawer_* tables are high
--   during shift transitions.
--
-- Scope:
--   Staging (dfwqakoyittmrwbqvxgw) and Production
--   (hifouuofcaytijrkbvcy). Idempotent.
-- ============================================================

-- audit_logs: high-volume, every order/payment creates entries
ALTER TABLE public.audit_logs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- loyalty_programs: updated during signup/profile changes
ALTER TABLE public.loyalty_programs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- floor_plans: modified when tables added/removed per location
ALTER TABLE public.floor_plans SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- category_items: menu category links, updated on menu changes
ALTER TABLE public.category_items SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- cfd_carousel_images: updated on carousel config changes
ALTER TABLE public.cfd_carousel_images SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- kds_displays: updated on KDS config changes
ALTER TABLE public.kds_displays SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- loyalty_enrollments: updated when members join/leave
ALTER TABLE public.loyalty_enrollments SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- loyalty_rewards: updated on reward issuance/redemption
ALTER TABLE public.loyalty_rewards SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- marketing_campaigns: updated on campaign lifecycle (create/edit/archive)
ALTER TABLE public.marketing_campaigns SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- location_item_overrides: updated on per-location menu/pricing changes
ALTER TABLE public.location_item_overrides SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- customers: updated on profile edits, member joins
ALTER TABLE public.customers SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- organizations: relatively low-churn, but still benefited by faster cleanup
ALTER TABLE public.organizations SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- cash_drawers: physical drawer metadata, moderate churn
ALTER TABLE public.cash_drawers SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- cash_drawer_operations: high-velocity, every cash transaction creates entry
ALTER TABLE public.cash_drawer_operations SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- Verification (run after apply):
--   SELECT relname, reloptions
--   FROM pg_class
--   WHERE relname = ANY (ARRAY[
--     'audit_logs', 'loyalty_programs', 'floor_plans', 'category_items',
--     'cfd_carousel_images', 'kds_displays', 'loyalty_enrollments',
--     'loyalty_rewards', 'marketing_campaigns', 'location_item_overrides',
--     'customers', 'organizations', 'cash_drawers', 'cash_drawer_operations'
--   ])
--   ORDER BY relname;
-- Expected: all 14 tables have autovacuum_vacuum_scale_factor=0.05 and autovacuum_analyze_scale_factor=0.05
