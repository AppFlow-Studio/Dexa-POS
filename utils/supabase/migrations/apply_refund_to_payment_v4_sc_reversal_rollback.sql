-- Rollback for apply_refund_to_payment_v4_sc_reversal.sql
-- Drops v4. Client wrappers must be reverted to point at apply_refund_to_payment_v3
-- before applying this. v3 remains deployed alongside v4.
DROP FUNCTION IF EXISTS public.apply_refund_to_payment_v4(
  uuid, numeric, reversal_type, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid
);
