-- =====================================================================
-- Backfill: re-settle orders stranded at payment_status='partial' despite
--           being collected in full (ORD-S2-0001 class)
-- =====================================================================
-- Companion to 20260616120000_process_payment_v15_item_payment_balance_fallback.
-- That migration stops NEW mixed pay-for-items orders from sticking at
-- 'partial'; this one re-settles rows already broken by the old behavior.
--
-- Conservative + idempotent by construction:
--   • Restricted to check_status='Closed' so an actively-splitting 'Opened'
--     order that transiently reads amount_due=0 between portions is never
--     wrongly settled.
--   • Excludes void/cancelled/refunded orders.
--   • Only touches rows where BOTH canonical dues are already ≤ 2¢ (money in).
--   • Step 1 flips status to 'paid', so any re-run selects nothing.
--   • sync_version bump triggers the existing version-gated client re-pull so
--     CFD / receipts / order breakdown self-correct.
--
-- effective_cash_amount_due is a PLAIN (is_generated='NEVER') writable column
-- on public.orders (verified on staging dfwqakoyittmrwbqvxgw), so step 3 zeroes
-- it too — otherwise a stale cash residual could survive the re-settle and
-- resurface in server-side reporting / receipts.
--
-- RECOMMENDED RUN ORDER (manual / supervised):
--   1. Run the PREVIEW select below on its own and eyeball check_status +
--      balances. For the very first run, uncomment the order_number filter to
--      target only ORD-20260610-S2-0001; broaden after the preview looks right.
--   2. Run the BEGIN..COMMIT block.
--   3. Re-run the preview → expect zero rows.
--
-- Apply to STAGING only (dfwqakoyittmrwbqvxgw); user runs prod manually.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PREVIEW (run first, on its own; not part of the transaction)
-- ---------------------------------------------------------------------
SELECT id, order_number, check_status, payment_status, status,
       amount_due, cash_amount_due, effective_cash_amount_due, total_amount
FROM public.orders
WHERE payment_status = 'partial'::payment_status
  AND check_status = 'Closed'
  AND status NOT IN ('void', 'cancelled', 'refunded')
  AND COALESCE(amount_due, 0) <= 0.02
  AND COALESCE(cash_amount_due, 0) <= 0.02
  -- first run only: also restrict to the single reported order
  -- AND order_number = 'ORD-20260610-S2-0001'
ORDER BY order_number;

-- ---------------------------------------------------------------------
-- BACKFILL (transactional)
-- ---------------------------------------------------------------------
BEGIN;

-- 2. Force-mark stray unpaid item quantities (mirrors the RPC force-mark block).
UPDATE public.order_items oi
SET paid_quantity   = oi.quantity,
    refunded_quantity = 0,
    refunded_amount = 0,
    price_paid      = COALESCE(oi.price_paid, oi.unit_price),
    updated_at      = now()
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.is_voided = false
  AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
  AND o.payment_status = 'partial'::payment_status
  AND o.check_status = 'Closed'
  AND o.status NOT IN ('void', 'cancelled', 'refunded')
  AND COALESCE(o.amount_due, 0) <= 0.02
  AND COALESCE(o.cash_amount_due, 0) <= 0.02;
  -- first run only: also  AND o.order_number = 'ORD-20260610-S2-0001'

-- 3. Settle the header (+ bump sync_version so clients re-pull).
UPDATE public.orders o
SET payment_status            = 'paid'::payment_status,
    amount_due                = 0,
    cash_amount_due           = 0,
    effective_cash_amount_due = 0,
    sync_version              = COALESCE(sync_version, 0) + 1,
    updated_at                = now()
WHERE o.payment_status = 'partial'::payment_status
  AND o.check_status = 'Closed'
  AND o.status NOT IN ('void', 'cancelled', 'refunded')
  AND COALESCE(o.amount_due, 0) <= 0.02
  AND COALESCE(o.cash_amount_due, 0) <= 0.02;
  -- first run only: also  AND o.order_number = 'ORD-20260610-S2-0001'

COMMIT;
