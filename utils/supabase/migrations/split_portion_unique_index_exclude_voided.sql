-- ============================================================================
-- Fix: idx_order_payments_split_portion blocks re-split after a void
--
-- Problem:
--   The unique index on (order_id, split_portion_index) was UNCONDITIONAL, so a
--   *voided* split-portion payment row still reserved its portion index. When a
--   user discarded an in-progress split and re-split the same check, the new
--   portion-1 INSERT collided with the old (now-voided) portion-1 row:
--
--     ERROR 23505 duplicate key value violates unique constraint
--     "idx_order_payments_split_portion"
--     Key (order_id, split_portion_index)=(<order>, 1) already exists.
--
--   This contradicts process_payment's own business logic, which already gates
--   re-payment on `status = 'captured'` (see process_payment_v15, the
--   "Split portion % has already been paid" guard). void_payment soft-voids the
--   row (is_voided = true, status = 'void') rather than deleting it, so the
--   index — which ignored is_voided — was stricter than the RPC intended.
--
-- Fix:
--   Make the uniqueness PARTIAL: only enforce one row per
--   (order_id, split_portion_index) among NON-voided payments. A voided portion
--   then frees its index for re-split, matching the RPC's captured-only rule.
--
-- Safe to run repeatedly (DROP IF EXISTS + CREATE).
-- ============================================================================

DROP INDEX IF EXISTS public.idx_order_payments_split_portion;

CREATE UNIQUE INDEX idx_order_payments_split_portion
  ON public.order_payments (order_id, split_portion_index)
  WHERE split_portion_index IS NOT NULL
    AND is_voided = false;
