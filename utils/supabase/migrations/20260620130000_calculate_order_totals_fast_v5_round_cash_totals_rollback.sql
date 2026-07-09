-- =====================================================================
-- ROLLBACK for 20260620130000_calculate_order_totals_fast_v5_round_cash_totals
-- =====================================================================
-- Re-applies the 2026-06-10 v4 body (in-place CREATE OR REPLACE), removing the
-- v5 ROUND(...,2) on the written monetary columns. After this, tiny
-- cash-discounted orders will again carry sub-cent cash_total dust (e.g.
-- 0.0192) and a tiny-total split cash payment can re-trip enforce_order_math
-- (P0005).
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
v_sc_is_taxable boolean;
v_rule_taxable boolean;
v_sc_tax_rate numeric;
v_card_sc_tax numeric;
v_cash_sc_tax numeric;
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

-- v3 carry-over: dynamic percent-mode manual override recomputes SC from
-- rate × current base. Amount-mode (rate IS NULL) and auto-rule paths fall
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

-- Restore SC tax handling. Without this, orders with service_charge_is_taxable
-- = true persist tax_amount without SC tax, and the client (which correctly
-- adds SC tax) diverges from the server total.
v_card_sc_tax := 0;
v_cash_sc_tax := 0;
v_rule_taxable := NULL;
IF v_order.service_charge_rule_id IS NOT NULL THEN
    SELECT r.is_taxable INTO v_rule_taxable
    FROM public.service_charge_rules r
    WHERE r.id = v_order.service_charge_rule_id;
END IF;
v_sc_is_taxable := COALESCE(v_rule_taxable, v_order.service_charge_is_taxable, false);

IF v_sc_is_taxable AND v_service_charge > 0 THEN
    SELECT COALESCE(tr.percentage, 0)
    INTO v_sc_tax_rate
    FROM public.tax_rates tr
    WHERE tr.location_id = v_order.location_id
      AND tr.tax_category = 'standard'
      AND tr.is_active = true
    LIMIT 1;

    IF NOT FOUND OR v_sc_tax_rate IS NULL THEN
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
    v_cash_sc_tax := ROUND(v_service_charge * v_sc_tax_rate / 100, 2);

    v_card_tax := v_card_tax + v_card_sc_tax;
    v_cash_tax := v_cash_tax + v_cash_sc_tax;
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

-- v2 effective_paid_cash logic (preserved across v3/v4).
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
    'cash_tax', v_cash_tax,
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
  'v4 — restores SC tax handling that v3 accidentally dropped. v3''s dynamic percent-mode manual SC recompute and v2''s effective_paid_cash logic both preserved. SC tax resolved from rule.is_taxable when rule_id is set, else orders.service_charge_is_taxable (covers post-override case where rule_id is nulled).';
