-- Rollback for process_payment_v13_sc_snapshot.sql
-- Drops v13. Client wrappers must be reverted to point at process_payment_v12
-- before applying this. v12 remains deployed alongside v13.
DROP FUNCTION IF EXISTS public.process_payment_v13(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb, integer, integer, boolean, uuid, uuid, uuid
);
