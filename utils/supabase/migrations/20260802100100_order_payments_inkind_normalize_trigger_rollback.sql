-- =====================================================================
-- Rollback: trg_inkind_normalize
-- =====================================================================
-- Drops the in-kind normalisation trigger and its function.
--
-- Safe to run at any time: the trigger only ever touched rows with
-- payment_method = 'inkind', and it is a BEFORE INSERT hook, so removing
-- it cannot alter any row that already exists. Historical in-kind
-- payments keep the values it stamped.
--
-- Consequence of rolling back while in-kind remains reachable in the UI:
-- NEW in-kind payments would be recorded with process_payment's default
-- non-cash metadata — terminal_type 'dejavoo' (a terminal that never ran
-- the transaction), a dual_pricing_fee for a processor that was never
-- involved, and — if the caller ever supplied an acquirer/batch_number —
-- a link into a real settlement batch, inflating the figure the merchant
-- reconciles against the processor.
--
-- So: ship the client build that removes the In-Kind payment method
-- BEFORE applying this, or leave the trigger in place (it is inert for
-- every other payment method).
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
            '% existing in-kind payment(s) keep their normalised values, but '
            'any NEW in-kind payment recorded after this rollback will carry '
            'phantom terminal/fee metadata. Remove the In-Kind method from the '
            'client first.', v_count;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_inkind_normalize ON public.order_payments;
DROP FUNCTION IF EXISTS public._inkind_normalize_payment();
