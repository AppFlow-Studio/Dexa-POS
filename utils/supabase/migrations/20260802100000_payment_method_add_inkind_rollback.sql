-- =====================================================================
-- Rollback: remove 'inkind' from the payment_method enum
-- =====================================================================
-- Postgres has no `ALTER TYPE ... DROP VALUE`. Removing a label requires
-- rebuilding the type and re-pointing every dependent column, which is a
-- lock-heavy, destructive operation.
--
-- In almost every case you do NOT want this file. To disable in-kind,
-- prefer the non-destructive path:
--   1. Ship the app build that removes the In-Kind tile, and/or
--   2. Re-point OrderService.processPayment back to 'process_payment_v16'
--      (see services/orderService.ts), which rejects 'inkind' anyway
--      because it has no in-kind branch.
-- The orphan enum label is harmless.
--
-- If the type MUST be rebuilt, this is the procedure. It is left commented
-- out deliberately — running it while any order_payments row uses 'inkind'
-- will fail on the USING cast (by design: that data would otherwise be
-- silently destroyed).
-- =====================================================================

-- Guard: refuse to proceed if the value is in use.
DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.order_payments
    WHERE payment_method::text = 'inkind';

    IF v_count > 0 THEN
        RAISE EXCEPTION
            'Cannot remove ''inkind'': % order_payments row(s) still use it. '
            'Reverse or re-classify those payments first.', v_count;
    END IF;

    RAISE NOTICE
        'No rows use ''inkind''. The enum label can be left in place safely; '
        'rebuild the type manually only if strictly required.';
END $$;

-- Manual rebuild procedure (uncomment only with a maintenance window):
--
-- ALTER TYPE public.payment_method RENAME TO payment_method_old;
-- CREATE TYPE public.payment_method AS ENUM (
--     'cash', 'card_spinapi', 'card_dvpaylite', 'card_manual',
--     'gift_card', 'house_account', 'external', 'card', 'card_online'
-- );
-- ALTER TABLE public.order_payments
--     ALTER COLUMN payment_method TYPE public.payment_method
--     USING payment_method::text::public.payment_method;
-- -- Repeat the ALTER TABLE for every other dependent column:
-- --   SELECT c.relname, a.attname
-- --   FROM pg_attribute a
-- --   JOIN pg_class c ON c.oid = a.attrelid
-- --   WHERE a.atttypid = 'public.payment_method_old'::regtype;
-- DROP TYPE public.payment_method_old;
