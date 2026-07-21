-- Rollback for process_payment_v15_closing_item_balance.sql.
-- Client wrappers must point back to process_payment_v14 before applying.
DROP FUNCTION IF EXISTS public.process_payment_v15(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid, uuid, uuid
);
