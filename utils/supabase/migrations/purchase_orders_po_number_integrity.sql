-- =====================================================================
-- purchase_orders.po_number integrity — backfill, uniqueness, ownership
-- =====================================================================
-- Follow-up to "POS: Declare-Zero Button + PO Numbering". The sequential
-- PO-#### rewrite shipped and works, but verification surfaced two holes
-- it never covered.
--
-- HOLE 1 — blank po_number
--   Two rows carry po_number = '' (empty string, not NULL): one created
--   2026-04-14, one 2026-06-16. They are unidentifiable in any list,
--   search, or report. The column is NOT NULL with no default, so NULL
--   was never possible — but '' always was, and nothing rejected it.
--
-- HOLE 2 — no uniqueness
--   purchase_orders had exactly one constraint: the primary key on id.
--   Nothing at the database level stopped two POs from taking the same
--   number. The only guard was a count query in the mobile client.
--
-- SCOPE DECISION — per (merchant, location), NOT global.
--   Derived from the generator, not from preference. Both client
--   generators in stores/useInventoryStore.ts counted rows filtered by
--   `merchant_id = M AND location_id = L`:
--     - getNextPurchaseOrderNumber → prefix 'PO-',  is_adhoc_expense NOT true
--     - getNextExpenseNumber       → prefix 'EXP-', is_adhoc_expense = true
--   So two merchants both starting at PO-0001 is correct and expected,
--   and a global unique constraint would have collided on the second
--   merchant's first PO. The unique index below matches that scope
--   exactly. The two prefixes keep POs and ad-hoc expenses from
--   colliding with each other inside one scope.
--
--   location_id is NULLABLE, and in Postgres NULLs are distinct by
--   default — a plain UNIQUE(merchant_id, location_id, po_number) would
--   let unlimited duplicates through for any row with a NULL location.
--   The index therefore keys on COALESCE(location_id::text, ''), which
--   also avoids depending on the column's exact type.
--
-- WHY A TRIGGER AND NOT JUST A CONSTRAINT
--   The client generator is count-based: it reads COUNT(*) then writes
--   COUNT+1. Two stations creating a PO at the same moment both read N
--   and both write N+1. Today that silently duplicates. Add a unique
--   index alone and it becomes a hard insert failure in the user's face
--   — the constraint would convert a data bug into an outage.
--   Count-based numbering is also wrong after any delete (numbers get
--   reused) and after this migration's backfill.
--
--   So numbering moves into the database, where it can be made atomic:
--     - allocation is serialized per scope by an advisory xact lock
--     - the next value is MAX+1, not COUNT+1, so deletes and backfills
--       cannot cause reuse
--     - a blank or colliding po_number is replaced, never rejected
--   This binds every writer at once — the current app, the tablets still
--   running an older build, and anything else pointed at this database.
--   PO numbers are system-assigned (no UI anywhere accepts one as
--   input), so silently replacing a colliding value is correct behavior
--   rather than a surprise.
--
-- ORDER OF DEPLOY — this migration must land BEFORE the client change
-- that stops sending po_number, or those inserts fail NOT NULL.
--
-- Rollback: purchase_orders_po_number_integrity_rollback.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Preflight — fail loudly rather than half-apply against a table
--    that is not shaped the way this migration assumes.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_blank   bigint;
    v_dupes   bigint;
BEGIN
    IF to_regclass('public.purchase_orders') IS NULL THEN
        RAISE EXCEPTION 'po_number_integrity: public.purchase_orders does not exist';
    END IF;

    PERFORM 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
      AND column_name = 'po_number';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'po_number_integrity: purchase_orders.po_number is missing';
    END IF;

    SELECT count(*) INTO v_blank
    FROM public.purchase_orders
    WHERE po_number IS NULL OR btrim(po_number) = '';

    SELECT count(*) INTO v_dupes
    FROM (
        SELECT 1
        FROM public.purchase_orders
        WHERE po_number IS NOT NULL AND btrim(po_number) <> ''
        GROUP BY merchant_id, COALESCE(location_id::text, ''), po_number
        HAVING count(*) > 1
    ) d;

    RAISE NOTICE 'po_number_integrity preflight: % blank row(s), % duplicated number(s) in scope',
        v_blank, v_dupes;
END $$;

-- ---------------------------------------------------------------------
-- 1) Lock helper — one definition of the allocation key so the
--    generator and the trigger can never serialize on different locks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._lock_po_number_scope(
    p_prefix      text,
    p_merchant_id text,
    p_location_id text
) RETURNS void
LANGUAGE sql
AS $$
    SELECT pg_advisory_xact_lock(
        hashtextextended(
            p_prefix || '|' || COALESCE(p_merchant_id, '') || '|' || COALESCE(p_location_id, ''),
            0
        )
    );
$$;

COMMENT ON FUNCTION public._lock_po_number_scope(text, text, text) IS
    'Transaction-scoped advisory lock serializing purchase-order number allocation within one (prefix, merchant, location) scope.';

-- ---------------------------------------------------------------------
-- 2) The generator — MAX+1 within scope, atomic under the scope lock.
--
--    Parameters are text so this does not break if merchant_id or
--    location_id is uuid on one environment and text on another.
--
--    SECURITY DEFINER: under RLS the inserting user may not be able to
--    SELECT every row in its own scope. If the MAX query cannot see a
--    row, it hands out a number that already exists and the unique
--    index rejects the insert. Numbering has to see the whole scope.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_purchase_order_number(
    p_merchant_id text,
    p_location_id text,
    p_is_adhoc    boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefix text := CASE WHEN COALESCE(p_is_adhoc, false) THEN 'EXP-' ELSE 'PO-' END;
    v_next   bigint;
BEGIN
    PERFORM public._lock_po_number_scope(v_prefix, p_merchant_id, p_location_id);

    -- Only the sequential series participates. Legacy PO-YYYY-MM-NNN
    -- numbers contain dashes, so they never match and never perturb the
    -- counter — they simply keep the values they already have.
    -- The {1,15} bound stops a garbage row from overflowing bigint.
    SELECT COALESCE(
               MAX(substring(po.po_number FROM '^' || v_prefix || '(\d{1,15})$')::bigint),
               0
           ) + 1
      INTO v_next
      FROM public.purchase_orders po
     WHERE po.merchant_id::text = p_merchant_id
       AND COALESCE(po.location_id::text, '') = COALESCE(p_location_id, '')
       AND po.po_number ~ ('^' || v_prefix || '\d{1,15}$');

    -- Pad to at least 4 digits and let it grow past 4 on its own.
    -- lpad() TRUNCATES when the value is longer than the target length,
    -- so the target has to be GREATEST(4, len) — a bare lpad(v, 4, '0')
    -- would turn 10000 into '1000' and collide with PO-1000.
    RETURN v_prefix || lpad(v_next::text, GREATEST(4, length(v_next::text)), '0');
END;
$$;

COMMENT ON FUNCTION public.next_purchase_order_number(text, text, boolean) IS
    'Next purchase-order number for a (merchant, location) scope. PO- for purchase orders, EXP- for ad-hoc expenses. MAX+1 over the sequential series only; legacy PO-YYYY-MM-NNN rows are ignored. Serialized by _lock_po_number_scope.';

-- ---------------------------------------------------------------------
-- 3) Backfill the blank rows.
--
--    One row at a time and ordered by created_at, so each UPDATE is
--    visible to the next MAX and the older row takes the lower number.
--    Prefix follows is_adhoc_expense, so a blank ad-hoc expense becomes
--    EXP-#### rather than being dropped into the PO series.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r      record;
    v_new  text;
    v_done bigint := 0;
BEGIN
    FOR r IN
        SELECT id,
               merchant_id::text AS merchant_id,
               location_id::text AS location_id,
               is_adhoc_expense,
               created_at
        FROM public.purchase_orders
        WHERE po_number IS NULL OR btrim(po_number) = ''
        ORDER BY created_at NULLS LAST, id
    LOOP
        v_new := public.next_purchase_order_number(
            r.merchant_id, r.location_id, r.is_adhoc_expense);

        UPDATE public.purchase_orders
           SET po_number = v_new
         WHERE id = r.id;

        v_done := v_done + 1;
        RAISE NOTICE 'po_number_integrity backfill: % (created %) -> %',
            r.id, r.created_at, v_new;
    END LOOP;

    RAISE NOTICE 'po_number_integrity: backfilled % row(s)', v_done;
END $$;

-- ---------------------------------------------------------------------
-- 4) Reject blank going forward.
--    The trigger in step 6 fires BEFORE this is evaluated, so a caller
--    that sends '' gets a generated number rather than an error. This
--    constraint is the floor under that: if the trigger is ever dropped
--    or bypassed, a blank write fails instead of landing silently.
-- ---------------------------------------------------------------------
ALTER TABLE public.purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_po_number_not_blank;

ALTER TABLE public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_not_blank
    CHECK (po_number IS NOT NULL AND btrim(po_number) <> '');

-- ---------------------------------------------------------------------
-- 5) Uniqueness at the generator's own scope.
--    Not CONCURRENTLY: this runs in the migration transaction and the
--    table is small. Revisit if purchase_orders ever gets large.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_po_number_scope
    ON public.purchase_orders (
        merchant_id,
        (COALESCE(location_id::text, '')),
        po_number
    );

COMMENT ON INDEX public.uq_purchase_orders_po_number_scope IS
    'PO numbers are unique per (merchant, location) — the scope the generator counts in. COALESCE on location_id because NULLs would otherwise be distinct and allow duplicates.';

-- ---------------------------------------------------------------------
-- 6) The database owns numbering.
--
--    Blank or missing  → generate.
--    Supplied and free → keep (this is what preserves legacy
--                        PO-YYYY-MM-NNN values on any future restore).
--    Supplied and taken→ regenerate, because a caller-supplied duplicate
--                        is the count-based race, and failing the insert
--                        would just surface it to a user creating a
--                        perfectly valid PO.
--
--    The lock is taken before the collision check, not just inside the
--    generator, so two concurrent inserts supplying the same free number
--    cannot both pass the check.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_purchase_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefix text := CASE WHEN COALESCE(NEW.is_adhoc_expense, false) THEN 'EXP-' ELSE 'PO-' END;
    v_taken  boolean;
BEGIN
    IF NEW.po_number IS NOT NULL AND btrim(NEW.po_number) <> '' THEN
        PERFORM public._lock_po_number_scope(
            v_prefix, NEW.merchant_id::text, NEW.location_id::text);

        SELECT EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            WHERE po.merchant_id::text = NEW.merchant_id::text
              AND COALESCE(po.location_id::text, '') = COALESCE(NEW.location_id::text, '')
              AND po.po_number = NEW.po_number
        ) INTO v_taken;

        IF NOT v_taken THEN
            RETURN NEW;
        END IF;

        RAISE NOTICE 'assign_purchase_order_number: % already used in scope, reassigning',
            NEW.po_number;
    END IF;

    NEW.po_number := public.next_purchase_order_number(
        NEW.merchant_id::text, NEW.location_id::text, NEW.is_adhoc_expense);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_purchase_order_number() IS
    'BEFORE INSERT on purchase_orders: fills a blank po_number and reassigns one that is already used in the same (merchant, location) scope. Makes an empty or duplicate PO number impossible regardless of which client is writing.';

DROP TRIGGER IF EXISTS trg_assign_purchase_order_number ON public.purchase_orders;

CREATE TRIGGER trg_assign_purchase_order_number
    BEFORE INSERT ON public.purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_purchase_order_number();

-- ---------------------------------------------------------------------
-- 7) Post-verification — refuse to commit unless the table is actually
--    in the state this migration claims to have produced.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_blank bigint;
    v_dupes bigint;
BEGIN
    SELECT count(*) INTO v_blank
    FROM public.purchase_orders
    WHERE po_number IS NULL OR btrim(po_number) = '';
    IF v_blank > 0 THEN
        RAISE EXCEPTION 'po_number_integrity: % blank po_number row(s) remain after backfill', v_blank;
    END IF;

    SELECT count(*) INTO v_dupes
    FROM (
        SELECT 1
        FROM public.purchase_orders
        GROUP BY merchant_id, COALESCE(location_id::text, ''), po_number
        HAVING count(*) > 1
    ) d;
    IF v_dupes > 0 THEN
        RAISE EXCEPTION 'po_number_integrity: % duplicated po_number(s) in scope — resolve before adding the unique index', v_dupes;
    END IF;

    IF to_regclass('public.uq_purchase_orders_po_number_scope') IS NULL THEN
        RAISE EXCEPTION 'po_number_integrity: unique index uq_purchase_orders_po_number_scope missing';
    END IF;

    PERFORM 1 FROM pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND conname = 'purchase_orders_po_number_not_blank';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'po_number_integrity: CHECK purchase_orders_po_number_not_blank missing';
    END IF;

    PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public.purchase_orders'::regclass
      AND tgname = 'trg_assign_purchase_order_number'
      AND NOT tgisinternal;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'po_number_integrity: trigger trg_assign_purchase_order_number missing';
    END IF;

    RAISE NOTICE 'po_number_integrity: verified — no blanks, no in-scope duplicates, index + check + trigger present';
END $$;

COMMIT;
