-- =====================================================================
-- Migration: calculate_order_totals_fast — dynamic percent-mode manual SC
-- =====================================================================
-- Before this migration, manual SC overrides were frozen flat-dollar:
-- override_service_charge_v3 in percent mode resolved p_rate × base once,
-- persisted that dollar amount in orders.service_charge, and the totals
-- function then read v_service_charge = COALESCE(orders.service_charge, 0)
-- on every recompute. Adding or removing items did not move SC.
--
-- This migration teaches calculate_order_totals_fast to recompute SC from
-- the persisted service_charge_rate when:
--    service_charge_is_manual = true  AND  service_charge_rate IS NOT NULL
--
-- Amount-mode overrides (rate IS NULL) stay frozen — the manager said
-- "set it to exactly $X" and that intent is preserved.
--
-- Auto-rule SC continues to flow through apply_service_charge_v1 → totals
-- (apply_service_charge_v1 writes service_charge before calling totals, so
-- the auto path lands in the ELSE branch here just like before).
--
-- Base for the dynamic recompute mirrors override_service_charge_v3 §5
-- (lines 136-149): pre_discount uses gross subtotal, post_discount nets
-- the order-level discount out. We use the just-computed v_card_subtotal
-- and v_discount instead of v_order.* so SC reflects the current item set
-- in the same call, not a stale snapshot.
--
-- The dynamic SC dollar is written back into orders.service_charge in
-- the existing totals UPDATE — keeping orders.service_charge in sync with
-- the recomputed value so process_payment_v15 and other consumers that
-- read the column directly stay correct.
--
-- All other math is verbatim from v2 (effective_paid_cash tracking, cash
-- residual logic, refund balance handling). Same signature, in-place
-- replacement.
--
-- Apply AFTER:
--   - calculate_order_totals_fast_v2_sc_flat.sql
--   - 20260609000000_override_service_charge_v3_percent_mode.sql
--
-- Rollback: re-apply calculate_order_totals_fast_v2_sc_flat.sql.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.calculate_order_totals_fast(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
v_card_subtotal numeric;
v_cash_subtotal numeric;
v_card_tax numeric;
v_cash_tax numeric;
v_discount numeric;
v_service_charge numeric;
v_sc_base numeric;
v_sc_applies_on text;
v_amount_paid numeric;
v_original_card_subtotal numeric;
v_original_cash_subtotal numeric;
v_unpaid_card_total numeric;
v_unpaid_cash_total numeric;
v_unpaid_cash_total_from_payments numeric;
v_effective_paid numeric;
v_effective_paid_cash numeric;
v_payment_refunded numeric;
v_payment_voided numeric;
v_card_total_calc numeric;
v_cash_total_calc numeric;
v_payment_based_due numeric;
v_custom_refund_balance numeric;
v_order record;
v_new_sync_version integer;
BEGIN
SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

SELECT *
INTO v_order
FROM public.orders WHERE id = p_order_id;

-- Dynamic percent-mode manual override: recompute SC from rate × current base.
-- Amount-mode (rate IS NULL) and auto-rule (is_manual = false) both fall
-- through to the persisted value.
IF v_order.service_charge_is_manual = true
   AND v_order.service_charge_rate IS NOT NULL THEN
    v_sc_applies_on := COALESCE(v_order.service_charge_applies_on, 'post_discount');
    IF v_sc_applies_on = 'pre_discount' THEN
        v_sc_base := v_card_subtotal;
    ELSE
        v_sc_base := v_card_subtotal - v_discount;
    END IF;
    v_sc_base := GREATEST(v_sc_base, 0);
    v_service_charge := ROUND(v_order.service_charge_rate / 100.0 * v_sc_base, 2);
ELSE
    v_service_charge := COALESCE(v_order.service_charge, 0);
END IF;

v_amount_paid := COALESCE(v_order.amount_paid, 0);

SELECT
    COALESCE(SUM(
        ROUND(subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0),
    COALESCE(SUM(
        ROUND(cash_subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(cash_tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id
    AND is_voided = false
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

SELECT
    COALESCE(SUM(
        COALESCE(original_amount, amount)
        - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)
    ), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)), 0)
INTO v_effective_paid, v_payment_refunded
FROM public.order_payments
WHERE order_id = p_order_id
    AND status IN ('captured', 'partially_refunded', 'refunded')
    AND is_voided = false;

SELECT COALESCE(SUM(COALESCE(original_amount, amount)), 0)
INTO v_payment_voided
FROM public.order_payments
WHERE order_id = p_order_id
  AND (status = 'void' OR is_voided = true);

v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;
v_cash_total_calc := v_cash_subtotal + v_cash_tax + v_service_charge;

-- v2: effective_paid in cash currency.
-- Cash-priced payments: face value (amount is already cash).
-- Card-priced payments: scale by cash_total / card_total (approximation;
-- exact mapping only matters when both payment types coexist on one order).
-- Refunds subtract similarly.
SELECT
    COALESCE(SUM(
        (CASE WHEN is_cash_priced THEN COALESCE(amount, 0)
              WHEN v_card_total_calc > 0
                THEN ROUND(COALESCE(amount, 0) * v_cash_total_calc / v_card_total_calc, 2)
              ELSE COALESCE(amount, 0)
         END)
        -
        (CASE WHEN is_cash_priced THEN COALESCE(refunded_amount, 0)
              WHEN v_card_total_calc > 0
                THEN ROUND(COALESCE(refunded_amount, 0) * v_cash_total_calc / v_card_total_calc, 2)
              ELSE COALESCE(refunded_amount, 0)
         END)
    ), 0)
INTO v_effective_paid_cash
FROM public.order_payments
WHERE order_id = p_order_id
  AND status IN ('captured', 'partially_refunded', 'refunded')
  AND is_voided = false;

v_payment_based_due := GREATEST(v_card_total_calc - v_effective_paid, 0);
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

-- v2: payment-derived cash residual. Use MAX of item-derived and
-- payment-derived to catch both "items partially paid" and "items fully
-- paid but SC still owed" cases.
v_unpaid_cash_total_from_payments := GREATEST(v_cash_total_calc - v_effective_paid_cash, 0);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := GREATEST(v_unpaid_cash_total, v_unpaid_cash_total_from_payments);
END IF;

UPDATE public.orders SET
    card_subtotal = v_original_card_subtotal,
    cash_subtotal = v_original_cash_subtotal,
    discount_amount = v_discount,
    effective_subtotal = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total = v_card_subtotal + v_card_tax + v_service_charge,
    card_tax_amount = v_card_tax,
    cash_tax_amount = v_cash_tax,
    card_total = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,
    subtotal = v_card_subtotal,
    tax_amount = v_card_tax,
    total_amount = v_card_subtotal + v_card_tax + v_service_charge,
    amount_due = v_unpaid_card_total,
    cash_amount_due = v_unpaid_cash_total,
    service_charge = v_service_charge,
    sync_version = COALESCE(sync_version, 0) + 1,
    updated_at = now()
WHERE id = p_order_id
RETURNING sync_version INTO v_new_sync_version;

RETURN jsonb_build_object(
    'success', true,
    'card_subtotal', v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount', v_discount,
    'card_tax', v_card_tax,
    'card_total', v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
    'service_charge', v_service_charge,
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total,
    'sync_version', v_new_sync_version
);
END;
$function$;

COMMENT ON FUNCTION public.calculate_order_totals_fast(uuid) IS
  'v3 — dynamic percent-mode manual SC. When service_charge_is_manual=true AND service_charge_rate IS NOT NULL, recomputes service_charge = rate × base / 100 from the just-computed subtotal (honoring service_charge_applies_on), writes it back into orders.service_charge in the same UPDATE. Amount-mode overrides (rate IS NULL) and auto-rule SC continue to use the persisted value. All other math verbatim from v2 (cash effective_paid tracking, refund balance).';
