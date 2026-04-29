-- ============================================================
-- ROLLBACK: pos_staff_login_rate_limiting
-- ============================================================

-- Remove pg_cron job
SELECT cron.unschedule('pin-login-attempts-90d-retention');

-- Restore pos_staff_login_v2 to pre-rate-limit version
-- (re-run migrate_pin_auth_rpcs_to_plain_first.sql section 2)

-- Drop new tables
DROP TABLE IF EXISTS public.pin_login_attempts CASCADE;
DROP TABLE IF EXISTS public.security_alerts     CASCADE;

-- Drop perf indexes
DROP INDEX IF EXISTS public.idx_lm_location_pin_plain;
DROP INDEX IF EXISTS public.idx_lm_location_active;
