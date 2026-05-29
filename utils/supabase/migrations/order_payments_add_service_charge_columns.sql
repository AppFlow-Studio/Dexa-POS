-- =====================================================================
-- Migration: order_payments_add_service_charge_columns
-- =====================================================================
-- Wave D — per-payment SC tracking. Mirrors the dual_pricing_fee /
-- refunded_dual_pricing_fee pair already on this table:
--
--   service_charge           — snapshot of this payment's share of
--                              orders.service_charge at the moment
--                              process_payment_v13 inserted the row.
--                              For a non-split full payment this equals
--                              orders.service_charge. For a partial /
--                              split / item payment it's proportional to
--                              v_payment_total / orders.card_total, with
--                              the last split-portion snapping to gross
--                              so SUM(service_charge) across all payments
--                              equals orders.service_charge exactly.
--
--   service_charge_refunded  — cumulative SC portion reversed by
--                              apply_refund_to_payment_v4. LEAST-clamped
--                              on partial refunds, snapped to gross on
--                              full void / final refund. Drift invariant:
--                              service_charge_refunded ≤ service_charge.
--
-- Legacy rows pre-dating Wave D get the DEFAULT 0 for both columns. v4
-- multiplies by service_charge in its delta, so a zero snapshot means
-- the row contributes nothing to SC reversal — clean fall-through with
-- no special-casing required.
--
-- Apply BEFORE:
--   - process_payment_v13_sc_snapshot.sql
--   - apply_refund_to_payment_v4_sc_reversal.sql
-- Rollback: order_payments_add_service_charge_columns_rollback.sql
-- =====================================================================

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS service_charge numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS service_charge_refunded numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_payments.service_charge IS
  'Snapshot of this payment''s share of orders.service_charge captured at process_payment_v13 insert time. Proportional to v_payment_total / orders.card_total; last split-portion snaps to gross so SUM across payments equals orders.service_charge. Basis for proportional SC reversal in apply_refund_to_payment_v4.';

COMMENT ON COLUMN public.order_payments.service_charge_refunded IS
  'Cumulative SC portion refunded across all reversals on this payment. Mirrors refunded_dual_pricing_fee. LEAST-clamped on partial refunds and snapped to gross on full void / final refund — invariant: service_charge_refunded ≤ service_charge.';
