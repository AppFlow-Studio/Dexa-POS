-- =====================================================================
-- Rollback: closing/Z-report in-kind bucket
-- =====================================================================
-- Re-apply get_business_day_activity_summary_v1.sql verbatim to restore
-- the pre-in-kind body (same name + 3-arg signature, CREATE OR REPLACE).
--
-- Only do this if in-kind is being withdrawn entirely. While ANY in-kind
-- payment exists, rolling back re-introduces three reporting defects:
--   • in-kind silently merges into the 'other' methods bucket,
--   • net_deposit is inflated by revenue that never reached the bank,
--   • unsettled permanently counts payments that can never batch out.
--
-- No DDL is emitted here on purpose — restoring a function body by
-- duplicating it in a rollback file guarantees the two copies drift.
-- Run the source migration instead:
--
--   psql -f utils/supabase/migrations/get_business_day_activity_summary_v1.sql
--
-- (Or apply that file through the normal migration tooling.)
-- =====================================================================

DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.order_payments
    WHERE payment_method::text = 'inkind';

    IF v_count > 0 THEN
        RAISE WARNING
            '% in-kind payment(s) exist. Reverting the closing report will '
            'inflate net_deposit and unsettled for those rows.', v_count;
    END IF;

    RAISE NOTICE
        'No DDL run. Re-apply get_business_day_activity_summary_v1.sql to '
        'complete this rollback.';
END $$;
