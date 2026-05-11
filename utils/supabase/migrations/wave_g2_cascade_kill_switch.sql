-- =====================================================================
-- Wave G.2 — F.1 cascade kill switch (per-merchant flag)
-- =====================================================================
-- Why (review item #8): disabling the cascade trigger today requires an
-- emergency migration. Add a per-merchant boolean flag so we can flip
-- the cascade off in seconds without DDL — surgical for a single bad
-- tenant, immediate for an incident.
--
-- Default: TRUE. Existing merchants opt-in by inheriting the default.
-- Trigger reads NEW.merchant_id's flag; if FALSE, returns NEW unchanged.
--
-- Apply AFTER:
--   - wave_f1_cascade_is_settled_on_batch_close.sql
--   - wave_g1_review_must_fixes.sql (latest cascade body)
-- =====================================================================

BEGIN;

ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS cascade_is_settled_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.merchants.cascade_is_settled_enabled IS
    'Kill switch for the _cascade_is_settled_on_batch_close trigger. '
    'When FALSE, settlement_batches status flips do NOT auto-flip linked '
    'order_payments.is_settled. Used to disable the cascade for a single '
    'merchant during an incident or data-correction window without DDL.';

CREATE OR REPLACE FUNCTION public._cascade_is_settled_on_batch_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_enabled boolean;
BEGIN
    IF NEW.status NOT IN ('settled','closed','funded') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    SELECT cascade_is_settled_enabled INTO v_enabled
    FROM public.merchants WHERE id = NEW.merchant_id;

    IF NOT COALESCE(v_enabled, true) THEN
        RETURN NEW;
    END IF;

    UPDATE public.order_payments
       SET is_settled = true,
           settled_at = COALESCE(NEW.closed_at, settled_at, now())
     WHERE settlement_batch_id = NEW.id
       AND is_settled = false;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._cascade_is_settled_on_batch_close IS
    'AFTER INSERT/UPDATE-OF-status trigger on settlement_batches. When a batch enters a terminal status (settled/closed/funded), flips is_settled=true and stamps settled_at on linked order_payments rows. Gated by merchants.cascade_is_settled_enabled (kill switch). settled_at prefers NEW.closed_at so a later authoritative Luqra close-time wins over an earlier cascade stamp.';

COMMIT;
