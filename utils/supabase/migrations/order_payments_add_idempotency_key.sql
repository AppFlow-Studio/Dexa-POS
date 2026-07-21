-- =====================================================================
-- Migration: order_payments_add_idempotency_key — Cat-B partial unique index
-- =====================================================================
-- The order_payments.idempotency_key column was added by NMI migration
-- 20260502212621 (nmi_link_payment_device_to_payments_and_sites) as TEXT,
-- scoped by composite unique index uq_order_payments_idempotency on
-- (payment_device_id, idempotency_key) WHERE idempotency_key IS NOT NULL.
--
-- That composite covers NMI's per-device idempotency contract. It does
-- NOT cover Wave Cat-B because POS-side payments (Castles, Dejavoo, cash)
-- don't populate payment_device_id — so the same idempotency key on two
-- of those payments would slip through (NULL is distinct in unique
-- indexes by default).
--
-- This migration adds a complementary partial unique index scoped to the
-- "no NMI device" subspace. NMI rows continue to use the composite index
-- exclusively (their rows have payment_device_id IS NOT NULL); Cat-B
-- rows hit the new partial index. Two indexes, two non-overlapping
-- regions, zero conflict.
--
-- Defense-in-depth: process_payment_v9's first wall is the
-- idempotency_keys cache (_idempotency_claim). This index is the second
-- wall — if the cache row is dropped early (32 KB cap, daily purge),
-- a duplicate INSERT raises 23505 instead of producing a duplicate row.
--
-- Apply after: nmi_link_payment_device_to_payments_and_sites
-- (the column it indexes must exist first).
-- Rollback: order_payments_add_idempotency_key_rollback.sql
-- =====================================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  order_payments_idempotency_key_pos_uniq
  ON public.order_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND payment_device_id IS NULL;

COMMENT ON INDEX public.order_payments_idempotency_key_pos_uniq IS
  'Wave Cat-B partial unique: enforces dedupe of order_payments rows written by process_payment_v9 (where payment_device_id is NULL). Complements NMI''s uq_order_payments_idempotency which scopes by (payment_device_id, idempotency_key) for NMI gateway rows. The two regions never overlap.';

-- =====================================================================
-- Verification (run on staging after apply):
--
-- 1. Confirm both indexes coexist:
--      SELECT indexname FROM pg_indexes
--        WHERE tablename = 'order_payments' AND indexname LIKE '%idempotency%';
--      -- Expect both: uq_order_payments_idempotency, order_payments_idempotency_key_pos_uniq
--
-- 2. Cat-B duplicate insert (no payment_device_id) — should fail on the second:
--      INSERT INTO public.order_payments
--        (id, order_id, amount, payment_method, status, idempotency_key)
--        VALUES (gen_random_uuid(), <test_order>, 1, 'card', 'captured',
--                'cat_b_test_key_1');
--      INSERT INTO public.order_payments
--        (id, order_id, amount, payment_method, status, idempotency_key)
--        VALUES (gen_random_uuid(), <test_order>, 1, 'card', 'captured',
--                'cat_b_test_key_1');
--      -- Expect: ERROR  duplicate key value violates unique constraint
--      --         "order_payments_idempotency_key_pos_uniq"
--      DELETE FROM public.order_payments WHERE idempotency_key = 'cat_b_test_key_1';
--
-- 3. NMI insert (with payment_device_id) — bypasses Cat-B index, hits composite:
--      <same key, but with a payment_device_id value> — composite enforces dedupe per device.
-- =====================================================================
