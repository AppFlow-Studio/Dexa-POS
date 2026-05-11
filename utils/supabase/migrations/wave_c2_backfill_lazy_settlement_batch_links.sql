-- =====================================================================
-- Wave C.2 — backfill lazy settlement_batches links for historical rows
-- =====================================================================
-- Why: Wave C.1's BEFORE INSERT trigger only fires on new payments. The
-- 72 historical Castles rows that Wave A.3 backfilled with acquirer +
-- batch_number still have settlement_batch_id NULL. This script does
-- the same lazy-create-and-link logic over them in one shot so Luqra
-- reconciliation has full coverage immediately.
--
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING and only updates
-- order_payments rows where settlement_batch_id IS NULL.
--
-- Apply AFTER:
--   - wave_c1_lazy_settlement_batch_link.sql
-- =====================================================================

BEGIN;

-- 1. Materialize the distinct host batches that need a settlement_batches row.
-- order_payments.terminal_id is TEXT (stringified UUID); cast to uuid
-- to match settlement_batches.payment_terminal_id (uuid).
WITH distinct_batches AS (
    SELECT
        terminal_id AS terminal_id_text,
        terminal_id::uuid AS payment_terminal_id,
        acquirer,
        batch_number,
        merchant_id,
        location_id,
        MIN(captured_at) AS opened_at,
        (MIN(captured_at) AT TIME ZONE 'America/New_York')::date AS business_date
    FROM public.order_payments
    WHERE settlement_batch_id IS NULL
      AND acquirer IS NOT NULL
      AND batch_number IS NOT NULL
      AND terminal_id IS NOT NULL
      AND terminal_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY terminal_id, acquirer, batch_number, merchant_id, location_id
)
INSERT INTO public.settlement_batches (
    batch_id, merchant_id, location_id, payment_terminal_id,
    acquirer, batch_number,
    business_date, business_date_start, business_date_end,
    opened_at, status, retry_count
)
SELECT
    'LAZY-' || db.acquirer || '-' || db.terminal_id_text || '-' || db.batch_number,
    db.merchant_id, db.location_id, db.payment_terminal_id,
    db.acquirer, db.batch_number,
    db.business_date, db.business_date, db.business_date,
    db.opened_at, 'open', 0
FROM distinct_batches db
ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL
DO NOTHING;

-- 2. Stamp settlement_batch_id onto the orphaned payments.
UPDATE public.order_payments op
SET settlement_batch_id = sb.id
FROM public.settlement_batches sb
WHERE op.settlement_batch_id IS NULL
  AND op.acquirer IS NOT NULL
  AND op.batch_number IS NOT NULL
  AND op.terminal_id IS NOT NULL
  AND op.terminal_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND sb.payment_terminal_id = op.terminal_id::uuid
  AND sb.merchant_id = op.merchant_id
  AND sb.acquirer = op.acquirer
  AND sb.batch_number = op.batch_number;

COMMIT;
