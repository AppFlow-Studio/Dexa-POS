-- =====================================================================
-- Migration: order_number uniqueness must be PER-MERCHANT, not global
-- =====================================================================
-- INCIDENT (2026-06-14, PROD): "Saucy - 1144 Hylan Blvd" Station 1 (Front
-- Counter) could not create any order — the POS sat on "Creating order"
-- forever, on every device, surviving app restarts.
--
-- ROOT CAUSE: order_number is generated from a PER-MERCHANT, per-day,
-- per-station Postgres sequence (generate_order_number ->
-- ord_seq_<merchant>_<YYYYMMDD>_s<N>), producing strings like
-- 'ORD-20260614-S1-0001'. But the uniqueness guard was:
--
--     orders_order_number_key  UNIQUE (order_number)   -- GLOBAL
--
-- Two different merchants that both have a station_number 1 therefore
-- generate the SAME order_number string. On 2026-06-14, merchant
-- 98a05710 (CHARCOAL GARDENIA) raced ahead to ORD-20260614-S1-0048.
-- Merchant 33b2baaf (Saucy) Station 1 starts its own sequence at 0001,
-- so its first order ('ORD-20260614-S1-0001') collided with CHARCOAL's
-- existing row -> duplicate key on orders_order_number_key.
--
-- It became a PERMANENT loop because generate_order_number runs
-- CREATE SEQUENCE inside the create_order_v3 transaction: the duplicate
-- on the orders INSERT rolls back the whole txn INCLUDING the sequence
-- creation, so Saucy's S1 sequence never persists and restarts at 0001
-- on every attempt — it can never climb past CHARCOAL's numbers.
--
-- FIX: scope uniqueness to the merchant. order_numbers are only ever
-- meant to be unique within a merchant (the generating sequence is
-- per-merchant). RLS already scopes all order_number lookups per
-- merchant, so nothing depends on global uniqueness.
--
-- SAFETY: the new constraint is strictly WEAKER than the old global one,
-- so all existing rows already satisfy it (verified on prod: 0
-- per-merchant duplicates). orders is small; this is effectively instant.
-- =====================================================================

BEGIN;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_key;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_number_merchant_key UNIQUE (merchant_id, order_number);

COMMIT;

-- Rollback (only safe if no cross-merchant duplicate order_numbers exist):
--   ALTER TABLE public.orders DROP CONSTRAINT orders_order_number_merchant_key;
--   ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
