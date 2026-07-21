-- =====================================================================
-- Migration: calculate_order_totals_fast v5 — round money to 2 decimals
-- =====================================================================
-- In-place CREATE OR REPLACE of calculate_order_totals_fast (same name +
-- signature). Forks the 2026-06-10 v4 body. The ONLY change: every monetary
-- value WRITTEN to public.orders (and returned in the JSON) is rounded to 2
-- decimal places.
--
-- Why (P0005 on tiny cash-discounted orders):
--   A cash-priced item stores cash_price = unit_price × (1 − cash_discount),
--   e.g. a $0.02 item → cash_price = 0.0192. v4 summed these UNROUNDED into
--   v_cash_subtotal and wrote cash_total = 0.0192 (and cash_amount_due =
--   0.0092). On a normal-sized order this sub-cent dust is invisible, but on a
--   tiny total it is larger than the rounding the payment path assumes:
--     • split the $0.02 two ways → portions $0.01 + $0.01
--     • after the first $0.01 cash payment, cash_amount_due = 0.0092
--     • the second $0.01 over-pays the 0.0092 remainder, the order flips to
--       paid, and enforce_order_math rejects the write because amount_paid no
--       longer reconciles against the dust-bearing cash_total (P0005:
--       payment_status=paid but amount_paid=0.01).
--
--   Rounding cash_total to 0.02 (and cash_amount_due to clean cents) lets the
--   split + process_payment_v16 math operate on true 2dp totals, so both
--   portions settle exactly. The card side already summed clean 2dp item
--   subtotals, but we round it too for symmetry / defence — ROUND of an
--   already-2dp value is a no-op.
--
-- No other logic changes: the dynamic percent-mode SC recompute, SC tax
-- handling, effective_paid_cash logic, and the paid/refund/void balance
-- branches are verbatim from v4.
--
-- Apply AFTER:
--   - 20260610123543_calculate_order_totals_fast_v4_sc_tax_restore.sql
--
-- Rollback: 20260620130000_calculate_order_totals_fast_v5_round_cash_totals_rollback.sql
--   (re-applies the v4 body).
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

-- v5: round the raw item-sum subtotals to the cent. Card item subtotals are
-- already 2dp, but cash_subtotal = SUM(qty * cash_price) carries the
-- cash-discount sub-cent dust (e.g. 0.0192) — that dust is what stranded a
-- fractional cash_amount_due and tripped enforce_order_math on tiny orders.
v_original_card_subtotal := ROUND(v_original_card_subtotal, 2);
v_original_cash_subtotal := ROUND(v_original_cash_subtotal, 2);

SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- v5: same rounding for the effective (discounted) subtotals/taxes.
v_card_subtotal := ROUND(v_card_subtotal, 2);
v_cash_subtotal := ROUND(v_cash_subtotal, 2);
v_card_tax := ROUND(v_card_tax, 2);
v_cash_tax := ROUND(v_cash_tax, 2);

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

-- v5: round the per-item-prorated unpaid totals too, so cash_amount_due is a
-- clean 2dp value (the proration above can re-introduce sub-cent fractions on
-- a cash-discounted line).
v_unpaid_card_total := ROUND(v_unpaid_card_total, 2);
v_unpaid_cash_total := ROUND(v_unpaid_cash_total, 2);

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

-- v5: card/cash totals are now built from rounded subtotals + rounded taxes +
-- 2dp SC, so they are inherently clean. ROUND wraps them anyway as belt-and-
-- braces (no-op on an already-2dp sum).
v_card_total_calc := ROUND(v_card_subtotal + v_card_tax + v_service_charge, 2);
v_cash_total_calc := ROUND(v_cash_subtotal + v_cash_tax + v_service_charge, 2);

-- v2 effective_paid_cash logic (preserved across v3/v4/v5).
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
v_unpaid_cash_total_from_payments := ROUND(GREATEST(v_cash_total_calc - v_effective_paid_cash, 0), 2);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    v_unpaid_card_total := ROUND(v_unpaid_card_total + v_custom_refund_balance, 2);
    v_unpaid_cash_total := ROUND(GREATEST(v_unpaid_cash_total, v_unpaid_cash_total_from_payments), 2);
END IF;

UPDATE public.orders SET
    card_subtotal = v_original_card_subtotal,
    cash_subtotal = v_original_cash_subtotal,
    discount_amount = v_discount,
    effective_subtotal = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total = v_card_total_calc,
    card_tax_amount = v_card_tax,
    cash_tax_amount = v_cash_tax,
    card_total = v_card_total_calc,
    cash_total = v_cash_total_calc,
    subtotal = v_card_subtotal,
    tax_amount = v_card_tax,
    total_amount = v_card_total_calc,
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
    'card_total', v_card_total_calc,
    'cash_total', v_cash_total_calc,
    'service_charge', v_service_charge,
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total,
    'sync_version', v_new_sync_version
);
END;
$function$;

COMMENT ON FUNCTION public.calculate_order_totals_fast(uuid) IS
  'v5 — rounds every monetary value written to orders (card/cash subtotals, taxes, totals, amount_due, cash_amount_due) to 2 decimals. Fixes sub-cent cash_total dust (cash_price × qty, e.g. 0.0192) that stranded a fractional cash_amount_due and tripped enforce_order_math (P0005) when a tiny cash-discounted order was split-paid. v4 SC-tax restore, v3 dynamic manual SC, and v2 effective_paid_cash logic all preserved verbatim.';
