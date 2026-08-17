-- =====================================================================
-- Rollback — purchase_orders.po_number integrity
-- =====================================================================
-- Reverses purchase_orders_po_number_integrity.sql.
--
-- NOT REVERSED: the backfill. The two rows that held po_number = ''
-- keep the numbers they were assigned. Restoring them to empty strings
-- would recreate the defect this migration exists to fix, and the
-- original values carried no information — they were blank.
--
-- After this runs, purchase_orders is back to one constraint (its
-- primary key) and numbering is once again whatever the client sends.
-- Any client build that has stopped sending po_number will fail on
-- NOT NULL, so roll the client back first or expect PO creation to
-- break.
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_assign_purchase_order_number ON public.purchase_orders;

DROP FUNCTION IF EXISTS public.assign_purchase_order_number();

DROP INDEX IF EXISTS public.uq_purchase_orders_po_number_scope;

ALTER TABLE public.purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_po_number_not_blank;

DROP FUNCTION IF EXISTS public.next_purchase_order_number(text, text, boolean);

DROP FUNCTION IF EXISTS public._lock_po_number_scope(text, text, text);

DO $$
BEGIN
    RAISE NOTICE 'po_number_integrity rollback: trigger, index, check and helper functions dropped. Backfilled po_numbers retained by design.';
END $$;

COMMIT;
