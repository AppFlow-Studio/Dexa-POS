-- Fix: cash_total should add the same flat service charge as card_total.
-- Also: when service_charge_rules.is_taxable = true, add SC tax to cash_tax_amount.
-- Does not touch any existing data — only changes the function definition.
-- Safe to deploy with CREATE OR REPLACE (same signature, drop-in replacement).
--
-- 2026-05-30 follow-up (S6-0010 Mocha repro): the previous body added
-- v_custom_refund_balance to items-derived totals on both sides equally —
-- but when v_custom_refund_balance was 0 (because items-derived
-- v_unpaid_card_total already exceeded payment_based_due), the function
-- left items-only totals on cash_amount_due, stripping the SC residual.
-- Replaced the clamp with a direct payment-based-due read for each
-- pricing mode (each side derives from its own total − paid, preserving
-- SC residual implicitly through the order totals).

CREATE OR REPLACE FUNCTION calculate_order_totals_fast(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
v_effective_paid numeric;
v_payment_refunded numeric;
v_payment_voided numeric;
v_card_total_calc numeric;
v_cash_total_calc numeric;
v_payment_based_due numeric;
v_cash_based_due numeric;
v_effective_cash_paid numeric;
v_custom_refund_balance numeric;
v_order record;
v_cash_service_charge numeric;
v_sc_is_taxable boolean;
BEGIN

-- Get original (pre-discount) subtotals and discount amount
SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get post-discount values (subtotal and tax_amount are already discounted per item)
SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get full order record (need payment_status for fully-paid guard)
SELECT *
INTO v_order
FROM public.orders WHERE id = p_order_id;

v_service_charge := COALESCE(v_order.service_charge, 0);
v_amount_paid    := COALESCE(v_order.amount_paid, 0);

-- Cash and card use the same flat SC. Cash pricing only changes the item
-- subtotal; when taxable, the shared SC is taxed below before totals are built.
v_cash_service_charge := v_service_charge;

-- When SC is taxable, add SC tax on top using the effective item tax rate.
SELECT COALESCE(r.is_taxable, false)
INTO v_sc_is_taxable
FROM public.service_charge_rules r
WHERE r.id = v_order.service_charge_rule_id;

IF NOT FOUND THEN v_sc_is_taxable := false; END IF;

IF v_sc_is_taxable AND v_service_charge > 0 THEN
    IF v_card_subtotal > 0 THEN
        v_card_tax := v_card_tax + ROUND(v_service_charge * v_card_tax / v_card_subtotal, 2);
    END IF;
    IF v_cash_subtotal > 0 THEN
        v_cash_tax := v_cash_tax + ROUND(v_cash_service_charge * v_cash_tax / v_cash_subtotal, 2);
    END IF;
END IF;

-- Calculate amount_due from UNPAID items
SELECT
    COALESCE(SUM(
        ROUND(subtotal * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(tax_amount * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0),
    COALESCE(SUM(
        ROUND(cash_subtotal * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(cash_tax_amount * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id
    AND is_voided = false
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

-- Effective amount paid (card-equivalent, handles custom refunds)
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

-- Cash-side equivalent of v_effective_paid. Cash payments contribute their
-- amount directly (already in cash terms post-process_payment_v14); card
-- payments scale to cash-equivalent via the order's cash:card ratio.
SELECT COALESCE(SUM(
    CASE WHEN is_cash_priced THEN
        amount - COALESCE(refunded_amount, 0)
    ELSE
        CASE WHEN COALESCE(v_order.card_total, 0) > 0
             THEN ROUND((amount - COALESCE(refunded_amount, 0)) * v_order.cash_total / v_order.card_total, 2)
             ELSE amount - COALESCE(refunded_amount, 0)
        END
    END
), 0)
INTO v_effective_cash_paid
FROM public.order_payments
WHERE order_id = p_order_id
    AND status IN ('captured', 'partially_refunded', 'refunded')
    AND is_voided = false;

v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;
v_cash_total_calc := v_cash_subtotal + v_cash_tax + v_cash_service_charge;

v_payment_based_due := GREATEST(v_card_total_calc - v_effective_paid, 0);
v_cash_based_due    := GREATEST(v_cash_total_calc - v_effective_cash_paid, 0);
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    -- 2026-05-30: use payment-based-due per pricing mode so each side
    -- preserves its own SC residual. The earlier formulation added
    -- v_custom_refund_balance to items-derived totals; when that balance
    -- was 0 (items-derived already ≥ payment_based_due, common when SC
    -- slice was attributed to a prior payment), the cash side silently
    -- retained items-only totals and dropped the SC residual.
    v_unpaid_card_total := v_payment_based_due;
    v_unpaid_cash_total := v_cash_based_due;
END IF;

UPDATE public.orders SET
    card_subtotal        = v_original_card_subtotal,
    cash_subtotal        = v_original_cash_subtotal,
    discount_amount      = v_discount,
    effective_subtotal   = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total      = v_card_subtotal + v_card_tax + v_service_charge,
    card_tax_amount      = v_card_tax,
    cash_tax_amount      = v_cash_tax,
    card_total           = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total           = v_cash_subtotal + v_cash_tax + v_cash_service_charge,
    subtotal             = v_card_subtotal,
    tax_amount           = v_card_tax,
    total_amount         = v_card_subtotal + v_card_tax + v_service_charge,
    amount_due           = v_unpaid_card_total,
    cash_amount_due      = v_unpaid_cash_total,
    updated_at           = now()
WHERE id = p_order_id;

RETURN jsonb_build_object(
    'success',           true,
    'card_subtotal',     v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount',   v_discount,
    'card_tax',          v_card_tax,
    'cash_tax',          v_cash_tax,
    'card_total',        v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total',        v_cash_subtotal + v_cash_tax + v_cash_service_charge,
    'cash_service_charge', v_cash_service_charge,
    'amount_due',        v_unpaid_card_total,
    'cash_amount_due',   v_unpaid_cash_total
);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_order_totals_fast TO authenticated;
