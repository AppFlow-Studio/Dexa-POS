-- =====================================================================
-- Wave H.3 — Sentinel for the dejavoo_batch_number Castles shim
-- =====================================================================
-- Why (follow-up): A.1 / B.1 promised the legacy
-- order_payments.dejavoo_batch_number column would survive "one release"
-- as a read-only shim for Castles batches before being dropped, since
-- A.2 (process_payment_v11) now populates the canonical batch_number
-- column. Without a deadline this shim quietly survives forever and any
-- new code that reads it perpetuates the bug-shaped overload.
--
-- This migration is a tripwire. After the deadline, if the column still
-- exists, it raises and blocks further migrations until someone drops
-- the column (or moves the deadline with explicit justification).
--
-- Resolution path when this fires:
--   1. Confirm no production reader still references dejavoo_batch_number
--      for Castles rows. v11 is the only writer; readers should already
--      be on order_payments.batch_number.
--   2. Apply a migration: ALTER TABLE order_payments DROP COLUMN dejavoo_batch_number;
--   3. Re-apply this sentinel — it becomes a no-op once the column is gone.
--
-- Deadline: 2026-08-10 (90 days after H.3 ships, 2026-05-10).
-- =====================================================================

DO $$
DECLARE
    v_deadline date := DATE '2026-08-10';
    v_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_payments'
          AND column_name = 'dejavoo_batch_number'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE NOTICE 'wave_h3: dejavoo_batch_number already dropped — sentinel is a no-op.';
        RETURN;
    END IF;

    IF current_date >= v_deadline THEN
        RAISE EXCEPTION
          'wave_h3 tripwire: order_payments.dejavoo_batch_number is past its removal deadline (%). The Castles batch shim was meant to last one release. Drop the column or move the deadline with a written justification.',
          v_deadline;
    END IF;

    RAISE NOTICE
      'wave_h3: dejavoo_batch_number shim still present; deadline % (% days remaining).',
      v_deadline, v_deadline - current_date;
END
$$;
