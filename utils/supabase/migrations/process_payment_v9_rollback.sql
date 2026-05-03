-- Rollback for process_payment_v9.sql
-- Safe to run while clients have process_payment flag OFF (so v8 is being
-- used). Do NOT run while any client has process_payment idempotency
-- enabled — drop the function out from under them and the flag-gated
-- RPC call will 42883.
DROP FUNCTION IF EXISTS public.process_payment_v9(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid, uuid, uuid
);
