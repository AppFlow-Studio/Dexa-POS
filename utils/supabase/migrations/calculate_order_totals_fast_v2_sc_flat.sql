-- =====================================================================
-- Migration: calculate_order_totals_fast — track effective_paid_cash
-- =====================================================================
-- Wave D follow-up. The currently-deployed function derives
-- cash_amount_due by scaling v_custom_refund_balance (card currency)
-- by cash_total/card_total ratio. That's correct when the residual is
-- card-equivalent "outstanding" (e.g. partial after cashier under-
-- collected SC — the $1.86 card-equiv collapses back to the right $0.99
-- cash), but WRONG when the residual is the SC itself on a fresh order
-- (S6-0016 staging 2026-05-29: $0.99 SC × 0.5315 ratio = $0.53 instead
-- of $0.99).
--
-- The fix: track v_effective_paid in cash currency directly. Cash-priced
-- payments contribute their face value; card-priced payments contribute
-- amount × cash_total/card_total. Then:
--   cash_amount_due = MAX(item-residual-cash, cash_total - effective_paid_cash)
--
-- For S6-0016 (fresh): effective_paid_cash = 0 → $3.71 ✓
-- For S6-0011 (cash-priced partial): effective_paid_cash = $2.72 → $0.99 ✓
-- For S6-0015 (cash-priced partial): effective_paid_cash = $5.72 → $1.71 ✓
-- For card payment closing dual-priced order: effective_paid_cash =
--   card_amount × ratio → $0 (fully paid) ✓
--
-- All other math is verbatim from the previously deployed function.
-- Same signature; in-place replacement.
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

v_service_charge := COALESCE(v_order.service_charge, 0);
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
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total,
    'sync_version', v_new_sync_version
);
END;
$function$;

COMMENT ON FUNCTION public.calculate_order_totals_fast(uuid) IS
  'Wave D follow-up (v2 in place). Tracks v_effective_paid_cash directly from order_payments (cash-priced face value, card-priced ratio-scaled). cash_amount_due = MAX(item-residual-cash, cash_total - effective_paid_cash). Replaces the buggy uniform ratio-scaling of v_custom_refund_balance which under-collected SC on fresh dual-priced orders (S6-0016 staging 2026-05-29).';
