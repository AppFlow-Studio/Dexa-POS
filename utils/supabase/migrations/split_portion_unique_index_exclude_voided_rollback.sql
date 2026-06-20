-- ============================================================================
-- Rollback: restore the unconditional idx_order_payments_split_portion
--
-- Reverts split_portion_unique_index_exclude_voided.sql. Note: re-applying the
-- unconditional index will FAIL if any order currently has both a voided and a
-- non-voided payment sharing a split_portion_index (exactly the state the
-- forward migration was meant to allow). Clean those up before rolling back.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_order_payments_split_portion;

CREATE UNIQUE INDEX idx_order_payments_split_portion
  ON public.order_payments (order_id, split_portion_index)
  WHERE split_portion_index IS NOT NULL;
