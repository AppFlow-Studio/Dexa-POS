-- cash_total was missing SC tax when service_charge_rules.is_taxable = true.
-- Frontend adds SC tax to both card and cash totals using the standard tax rate.
-- This migration aligns the backend to match.
--
-- SC tax rate is read from location_tax_rates (the 'standard' category, or the
-- first non-zero rate) — same lookup the frontend does via taxRatesMap['standard'].
--
-- Also replaces the custom_refund_balance approach with per-side payment-based-due
-- so each pricing mode preserves its own SC residual correctly.

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
v_sc_tax_rate numeric;
v_card_sc_tax numeric;
v_cash_sc_tax numeric;
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

-- Get full order record
SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

v_service_charge      := COALESCE(v_order.service_charge, 0);
v_amount_paid         := COALESCE(v_order.amount_paid, 0);
v_cash_service_charge := v_service_charge;
v_card_sc_tax         := 0;
v_cash_sc_tax         := 0;

-- When SC is taxable, compute SC tax using the location's standard tax rate
-- (matches frontend taxRatesMap['standard'] lookup in order-calculator.ts)
SELECT COALESCE(r.is_taxable, false)
INTO v_sc_is_taxable
FROM public.service_charge_rules r
WHERE r.id = v_order.service_charge_rule_id;

IF NOT FOUND THEN v_sc_is_taxable := false; END IF;

IF v_sc_is_taxable AND v_service_charge > 0 THEN
    -- Read the standard tax rate for this location (table: tax_rates, column: percentage)
    SELECT COALESCE(tr.percentage, 0)
    INTO v_sc_tax_rate
    FROM public.tax_rates tr
    WHERE tr.location_id = v_order.location_id
      AND tr.tax_category = 'standard'
      AND tr.is_active = true
    LIMIT 1;

    IF NOT FOUND OR v_sc_tax_rate IS NULL THEN
        -- Fall back to first non-zero active rate
        SELECT COALESCE(tr.percentage, 0)
        INTO v_sc_tax_rate
        FROM public.tax_rates tr
        WHERE tr.location_id = v_order.location_id
          AND tr.percentage > 0
          AND tr.is_active = true
        ORDER BY tr.percentage
        LIMIT 1;
    END IF;

    IF v_sc_tax_rate IS NULL THEN v_sc_tax_rate := 0; END IF;

    v_card_sc_tax := ROUND(v_service_charge * v_sc_tax_rate / 100, 2);
    v_cash_sc_tax := ROUND(v_cash_service_charge * v_sc_tax_rate / 100, 2);

    v_card_tax := v_card_tax + v_card_sc_tax;
    v_cash_tax := v_cash_tax + v_cash_sc_tax;
END IF;

-- Calculate amount_due from UNPAID items (item-level, excludes SC)
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

-- Effective card-equivalent paid
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

-- Effective cash-side paid
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

v_payment_based_due     := GREATEST(v_card_total_calc - v_effective_paid, 0);
v_cash_based_due        := GREATEST(v_cash_total_calc - v_effective_cash_paid, 0);
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
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
    'success',            true,
    'card_subtotal',      v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount',    v_discount,
    'card_tax',           v_card_tax,
    'cash_tax',           v_cash_tax,
    'card_total',         v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total',         v_cash_subtotal + v_cash_tax + v_cash_service_charge,
    'amount_due',         v_unpaid_card_total,
    'cash_amount_due',    v_unpaid_cash_total
);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_order_totals_fast TO authenticated;
