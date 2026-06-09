-- =====================================================================
-- One-shot prod data reconciliation: Charcoal Gardenia Batch 001 → 009
-- =====================================================================
--
-- Context
--   Castles pinpad "S1P2" (DexaPOS terminal 0eb81f35-e3e4-4455-bf50-0cb65bc9f451)
--   at Charcoal Gardenia (merchant 98a05710-…, location 5afc6641-…) kept
--   reporting batchNumber="001" after operator closed Batch 001 on
--   2026-06-01 04:09 UTC. 30 captured sales (2026-06-01 → 2026-06-03)
--   stayed linked to the already-settled batch row 1e8d2c55-… with
--   is_settled=false. On 2026-06-07 operator manually batched out; Luqra
--   confirms 30/30 settled today under acquirer TID 77683592 on MID
--   584600000192609. One additional row (7a0e9d91-…, $190.58, empty
--   card/RRN) is a Castles return2Idle phantom that was captured as a
--   payment — not in Luqra, must be marked failed.
--
-- Effect
--   • Insert new settlement_batches row (batch_number='009', settled today).
--   • Move 30 misrouted order_payments onto it (batch_number → '009';
--     is_settled flips via cascade trigger when batch closes).
--   • Apply 5 tip-drift corrections (Luqra-settled > captured by post-auth tip).
--   • Mark phantom payment status='failed' and its orphan batch 776cdb5c-…
--     status='failed'.
--   • Link 30 luqra_transactions rows back via reconciled_payment_id.
--
-- Scope: PROD-ONLY. Staging has none of this divergent data.
-- See plan: ~/.claude/plans/so-we-had-a-iterative-candy.md
-- Rollback at the bottom of this file (commented).
-- =====================================================================

BEGIN;

-- Lock the legit Batch 001 row so a concurrent close-cascade can't race us.
SELECT id FROM public.settlement_batches
 WHERE id = '1e8d2c55-ad74-44e2-8160-5c0e2dfd67b7' FOR UPDATE;

-- 1) Create new Batch 009 row in 'open' state, then re-link payments in same CTE.
WITH ins AS (
  INSERT INTO public.settlement_batches (
    batch_id, merchant_id, location_id, payment_terminal_id,
    acquirer, batch_number,
    business_date, business_date_start, business_date_end,
    opened_at, status, retry_count,
    failure_reason
  ) VALUES (
    'LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009',
    '98a05710-e778-4b1a-81ac-389d5f8fbd47',
    '5afc6641-e98f-4c81-8d9d-d9691b5c28dc',
    '0eb81f35-e3e4-4455-bf50-0cb65bc9f451',
    'TSYS', '009',
    DATE '2026-06-07', DATE '2026-06-01', DATE '2026-06-07',
    TIMESTAMPTZ '2026-06-01 21:04:09.676837+00',
    'open', 0,
    'Manual reconciliation: pinpad kept reporting batch 001 after 2026-06-01 close; operator manually batched out 2026-06-07; Luqra settled under TID 77683592 same day.'
  )
  RETURNING id
)
-- 2) Re-point the 30 misrouted payments.
UPDATE public.order_payments op
   SET settlement_batch_id = ins.id,
       batch_number        = '009'
  FROM ins
 WHERE op.merchant_id         = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
   AND op.terminal_id         = '0eb81f35-e3e4-4455-bf50-0cb65bc9f451'
   AND op.terminal_type       = 'castles'
   AND op.acquirer            = 'TSYS'
   AND op.batch_number        = '001'
   AND op.settlement_batch_id = '1e8d2c55-ad74-44e2-8160-5c0e2dfd67b7'
   AND op.is_settled          = false
   AND op.status              = 'captured'
   AND op.initiated_at        > TIMESTAMPTZ '2026-06-01 04:09:37.635355+00';

-- Verify exactly 30 rows moved.
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.order_payments
   WHERE batch_number = '009'
     AND terminal_id  = '0eb81f35-e3e4-4455-bf50-0cb65bc9f451';
  IF v_count <> 30 THEN RAISE EXCEPTION 'Expected 30 re-linked, got %', v_count; END IF;
END $$;

-- 3) Tip-drift corrections: Luqra-settled > DexaPOS-captured by post-auth tip.
UPDATE public.order_payments SET amount=146.81, total_amount=146.81, tip_amount=tip_amount+25.00, original_tip_amount=COALESCE(original_tip_amount, tip_amount), tip_adjusted_at=now() WHERE id='3bb67b0a-3cf8-4644-b167-62e422ccd1ea'; -- last4 1190 +$25.00
UPDATE public.order_payments SET amount= 62.02, total_amount= 62.02, tip_amount=tip_amount+10.00, original_tip_amount=COALESCE(original_tip_amount, tip_amount), tip_adjusted_at=now() WHERE id='d0ab666a-86ce-474a-ae9b-f6c3d240f7fa'; -- last4 6245 +$10.00
UPDATE public.order_payments SET amount= 94.39, total_amount= 94.39, tip_amount=tip_amount+15.73, original_tip_amount=COALESCE(original_tip_amount, tip_amount), tip_adjusted_at=now() WHERE id='450007ba-6703-48a4-be26-1983042239a2'; -- last4 8366 +$15.73
UPDATE public.order_payments SET amount= 98.88, total_amount= 98.88, tip_amount=tip_amount+16.40, original_tip_amount=COALESCE(original_tip_amount, tip_amount), tip_adjusted_at=now() WHERE id='4b5205e6-866e-4609-b022-fe6bbf6da084'; -- last4 7731 +$16.40
UPDATE public.order_payments SET amount=134.94, total_amount=134.94, tip_amount=tip_amount+ 4.00, original_tip_amount=COALESCE(original_tip_amount, tip_amount), tip_adjusted_at=now() WHERE id='956825bb-76fd-43bc-998f-ca8628e961f3'; -- last4 1161 +$4.00

-- 4) Close Batch 009. Cascade trigger flips is_settled on the 30 payments.
--    net_deposit = gross_amount matches every other batch on this merchant —
--    per-batch processor/interchange fees are tracked elsewhere, not deducted here.
WITH sums AS (
  SELECT SUM(amount) AS gross
    FROM public.order_payments
   WHERE settlement_batch_id = (
     SELECT id FROM public.settlement_batches
      WHERE batch_id='LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009')
)
UPDATE public.settlement_batches sb
   SET status            = 'settled',
       closed_at         = now(),
       settlement_date   = DATE '2026-06-07',
       transaction_count = 30,
       sales_count       = 30,
       gross_amount      = sums.gross,
       net_deposit       = sums.gross
  FROM sums
 WHERE sb.batch_id    = 'LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009'
   AND sb.merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47';

-- 5) Fail-out the phantom return2Idle payment.
UPDATE public.order_payments
   SET status        = 'failed',
       failed_at     = now(),
       error_message = 'Phantom return2Idle response captured as payment; not a real card txn. Confirmed absent from Luqra. Reconciled 2026-06-07.'
 WHERE id = '7a0e9d91-df6b-41b6-96f9-ebedebbd9989';

-- 6) Fail-out the orphan empty-batch settlement_batches row.
UPDATE public.settlement_batches
   SET status         = 'failed',
       closed_at      = now(),
       failure_reason = 'Empty batch_number; sole linked payment was a Castles return2Idle phantom, not a real txn. Reconciled 2026-06-07.'
 WHERE id = '776cdb5c-f80f-4924-bc4b-b5ce63f8b2e7';

-- 7) Link Luqra rows back to our payments (last4 + amount + 2026-06-07 + TID 77683592).
WITH our_batch_009 AS (
  SELECT op.id AS pid, op.order_id, op.amount, op.card_last_four
    FROM public.order_payments op
   WHERE op.settlement_batch_id = (
     SELECT id FROM public.settlement_batches
      WHERE batch_id='LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009')
)
UPDATE public.luqra_transactions lt
   SET reconciled_payment_id = b.pid,
       reconciled_order_id   = b.order_id,
       reconciled_at         = now()
  FROM our_batch_009 b
 WHERE lt.mid              = '584600000192609'
   AND lt.terminal_id      = '77683592'
   AND lt.transaction_date = DATE '2026-06-07'
   AND lt.amount_dollars   = b.amount
   AND lt.account_last4    = b.card_last_four
   AND lt.reconciled_payment_id IS NULL;

-- Final assertions before COMMIT.
DO $$
DECLARE
  v_legit_001 int; v_new_009 int; v_new_settled int;
  v_phantom_status text; v_luqra_linked int; v_gross numeric;
BEGIN
  SELECT COUNT(*) INTO v_legit_001
    FROM public.order_payments
   WHERE settlement_batch_id = '1e8d2c55-ad74-44e2-8160-5c0e2dfd67b7'
     AND is_settled = true;
  IF v_legit_001 <> 7 THEN RAISE EXCEPTION 'Legit batch 001 expected 7 settled, got %', v_legit_001; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE op.is_settled=true), SUM(op.amount)
    INTO v_new_009, v_new_settled, v_gross
    FROM public.order_payments op
    JOIN public.settlement_batches sb ON sb.id = op.settlement_batch_id
   WHERE sb.batch_id = 'LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009';
  IF v_new_009 <> 30 OR v_new_settled <> 30 THEN
    RAISE EXCEPTION 'Batch 009 expected 30/30 settled, got %/%', v_new_settled, v_new_009;
  END IF;
  -- Expected: 2207.43 captured + 71.13 tip-drift uplift = 2278.56
  IF ROUND(v_gross, 2) <> 2278.56 THEN
    RAISE EXCEPTION 'Batch 009 expected gross 2278.56, got %', v_gross;
  END IF;

  SELECT status INTO v_phantom_status
    FROM public.order_payments
   WHERE id='7a0e9d91-df6b-41b6-96f9-ebedebbd9989';
  IF v_phantom_status <> 'failed' THEN
    RAISE EXCEPTION 'Phantom expected status=failed, got %', v_phantom_status;
  END IF;

  SELECT COUNT(*) INTO v_luqra_linked
    FROM public.luqra_transactions
   WHERE mid='584600000192609' AND terminal_id='77683592'
     AND transaction_date='2026-06-07'
     AND reconciled_payment_id IS NOT NULL;
  IF v_luqra_linked < 30 THEN
    RAISE EXCEPTION 'Luqra link-back expected >=30, got %', v_luqra_linked;
  END IF;
END $$;

COMMIT;

-- ===== ROLLBACK (commented; uncomment to revert) =========================
-- BEGIN;
-- UPDATE public.order_payments SET amount=121.81, total_amount=121.81, tip_amount=tip_amount-25.00, tip_adjusted_at=NULL WHERE id='3bb67b0a-3cf8-4644-b167-62e422ccd1ea';
-- UPDATE public.order_payments SET amount= 52.02, total_amount= 52.02, tip_amount=tip_amount-10.00, tip_adjusted_at=NULL WHERE id='d0ab666a-86ce-474a-ae9b-f6c3d240f7fa';
-- UPDATE public.order_payments SET amount= 78.66, total_amount= 78.66, tip_amount=tip_amount-15.73, tip_adjusted_at=NULL WHERE id='450007ba-6703-48a4-be26-1983042239a2';
-- UPDATE public.order_payments SET amount= 82.48, total_amount= 82.48, tip_amount=tip_amount-16.40, tip_adjusted_at=NULL WHERE id='4b5205e6-866e-4609-b022-fe6bbf6da084';
-- UPDATE public.order_payments SET amount=130.94, total_amount=130.94, tip_amount=tip_amount- 4.00, tip_adjusted_at=NULL WHERE id='956825bb-76fd-43bc-998f-ca8628e961f3';
-- UPDATE public.order_payments SET settlement_batch_id='1e8d2c55-ad74-44e2-8160-5c0e2dfd67b7', batch_number='001', is_settled=false, settled_at=NULL
--  WHERE settlement_batch_id = (SELECT id FROM public.settlement_batches WHERE batch_id='LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009');
-- UPDATE public.luqra_transactions SET reconciled_payment_id=NULL, reconciled_order_id=NULL, reconciled_at=NULL
--  WHERE mid='584600000192609' AND terminal_id='77683592' AND transaction_date='2026-06-07';
-- DELETE FROM public.settlement_batches WHERE batch_id='LAZY-TSYS-0eb81f35-e3e4-4455-bf50-0cb65bc9f451-009';
-- UPDATE public.order_payments SET status='captured', failed_at=NULL, error_message=NULL WHERE id='7a0e9d91-df6b-41b6-96f9-ebedebbd9989';
-- UPDATE public.settlement_batches SET status='open', closed_at=NULL, failure_reason=NULL WHERE id='776cdb5c-f80f-4924-bc4b-b5ce63f8b2e7';
-- COMMIT;
