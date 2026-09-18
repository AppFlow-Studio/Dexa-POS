-- =====================================================================
-- Re-attach the orphaned purchase order to its location — PROD ONLY
-- =====================================================================
-- Runs BEFORE purchase_orders_po_number_integrity.sql on production.
-- Not needed on staging (no orphaned rows there).
--
-- WHY
--   One purchase order (created 2026-06-16) carries location_id = NULL.
--   purchase_orders.location_id has ON DELETE SET NULL, so its location
--   was deleted out from under it. It also carries po_number = '' and is
--   one of the two rows the integrity migration backfills.
--
--   Left as-is it forms its own numbering scope — (merchant, NULL) —
--   and the backfill hands it PO-0001, giving production a third row
--   reading PO-0001. Legal under the unique index (three different
--   scopes, no collision) but indistinguishable in any merchant-level
--   list that is not scope-filtered.
--
--   It also leaves a live hazard: because ON DELETE SET NULL collapses a
--   deleted location's orders into the (merchant, NULL) scope, deleting
--   a location later can push its numbers into collision with whatever
--   already sits in that scope — and the unique index would then make
--   the location delete fail. Production has exactly one orphan today,
--   so clearing it removes that whole class of problem here.
--
--   Re-attaching first puts both blank rows in one scope, so the
--   backfill assigns PO-0001 (2026-04-14) and PO-0002 (2026-06-16) in
--   created_at order.
--
-- SAFETY
--   Idempotent — a second run finds no orphans and exits with a notice.
--   Every assumption is asserted before the write: the merchant and
--   location must exist, the location must belong to that merchant, and
--   there must be exactly one orphaned row. Anything else aborts rather
--   than guessing which location an order belonged to.
--
-- TO REVERSE
--   Set location_id back to NULL for the id printed below. Do this
--   before rolling back the integrity migration, not after.
-- =====================================================================

BEGIN;

DO $$
DECLARE
    v_merchant_id constant uuid := '33b2baaf-ae79-4e02-a489-52163a447b57';
    v_location_id constant uuid := '94dd8b80-7a92-4ddf-981a-372d98a938d6';
    v_orphans     bigint;
    v_orphan_id   uuid;
BEGIN
    SELECT count(*) INTO v_orphans
    FROM public.purchase_orders
    WHERE merchant_id = v_merchant_id
      AND location_id IS NULL;

    IF v_orphans = 0 THEN
        RAISE NOTICE 'reattach_orphan_location: no orphaned rows for merchant % — nothing to do', v_merchant_id;
        RETURN;
    END IF;

    IF v_orphans > 1 THEN
        RAISE EXCEPTION
            'reattach_orphan_location: expected exactly 1 orphaned row, found %. Re-attaching in bulk would guess at which location each order belonged to — resolve by hand.',
            v_orphans;
    END IF;

    -- The target location must exist and belong to this merchant.
    PERFORM 1
    FROM public.locations
    WHERE id = v_location_id
      AND merchant_id = v_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION
            'reattach_orphan_location: location % does not exist or does not belong to merchant %',
            v_location_id, v_merchant_id;
    END IF;

    SELECT id INTO v_orphan_id
    FROM public.purchase_orders
    WHERE merchant_id = v_merchant_id
      AND location_id IS NULL;

    UPDATE public.purchase_orders
       SET location_id = v_location_id
     WHERE id = v_orphan_id;

    RAISE NOTICE 'reattach_orphan_location: purchase order % re-attached to location % (was NULL). To reverse: UPDATE public.purchase_orders SET location_id = NULL WHERE id = ''%'';',
        v_orphan_id, v_location_id, v_orphan_id;
END $$;

-- Post-check: no purchase order anywhere may be left without a location,
-- or the integrity migration will mint a number in a phantom scope.
DO $$
DECLARE
    v_remaining bigint;
BEGIN
    SELECT count(*) INTO v_remaining
    FROM public.purchase_orders
    WHERE location_id IS NULL;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION
            'reattach_orphan_location: % purchase order(s) still have a NULL location_id — resolve before running purchase_orders_po_number_integrity.sql',
            v_remaining;
    END IF;

    RAISE NOTICE 'reattach_orphan_location: verified — no purchase orders with a NULL location_id remain';
END $$;

COMMIT;
