-- =====================================================================
-- Migration: calculate_order_totals_fast v6 — aggregate-per-rate-group tax
-- =====================================================================
-- In-place CREATE OR REPLACE of calculate_order_totals_fast (same name +
-- signature). Forks the 2026-06-20 v5 body. Changes are confined to how
-- SALES TAX is computed; everything else (subtotals, discount, SC-tax,
-- effective_paid_cash, paid/refund/void balance branches) is verbatim v5.
--
-- Why (penny drift, ORD reported total 6378.68 vs expected 6378.69):
--   v5 derived order tax by SUMMING the per-item `tax_amount` column, where
--   each item's tax was ROUND(item_net_subtotal * rate/100, 2) computed at
--   insert. Summing N individually-rounded line taxes drifts below the true
--   tax on the aggregate subtotal. On a 23-item order at 8.875%:
--     Σ ROUND(item)          = 519.95  -> total 6378.68  (wrong)
--     ROUND(Σ subtotal * r)  = 519.96  -> total 6378.69  (correct)
--   The rate itself is fine (tax_rates.percentage is numeric(10,4) = 8.8750).
--
-- Fix (must match the client calculator lib/order-calculator.ts in lockstep):
--   Compute tax as an AGGREGATE PER TAX-RATE GROUP — for each distinct
--   order_items.tax_rate (> 0), tax = ROUND(SUM(net subtotal in group) *
--   rate/100, 2), summed across groups, card and cash independently. Applied
--   to BOTH the order-level tax (was v5 lines 91-104) and the unpaid/
--   outstanding tax (was v5 lines 171-190). The unpaid SUBTOTAL proration
--   stays per-item as in v5; only its TAX component becomes aggregate.
--
--   The aggregate group tax is then REDISTRIBUTED back onto per-item
--   `tax_amount`/`cash_tax_amount` so the internal invariant holds:
--     Σ order_items.tax_amount == orders.tax_amount − SC_tax
--   (SC tax is order-level only and never lands on an item). Redistribution
--   uses the existing "assign the group rounding residual to the last item"
--   convention (last = highest (created_at, id)), mirroring
--   redistribute_order_discount. The write is guarded with IS DISTINCT FROM
--   so a steady-state recompute (net subtotals unchanged) writes zero item
--   rows and emits zero item broadcasts. Note the KDS triggers on order_items
--   are column-scoped (is_voided / rush / sent_to_kitchen_at), so a tax_amount
--   write never routes an item to the KDS.
--
-- enforce_order_math is UNAFFECTED: it validates only amount_paid/amount_due
-- signs and payment_status consistency, never total = subtotal + tax + SC, so
-- a 1-cent tax shift cannot trip P0005. process_payment_v16 is UNAFFECTED: it
-- drives amount_due from orders.card_total/cash_total (not order_items.tax_amount).
--
-- Apply AFTER:
--   - 20260620130000_calculate_order_totals_fast_v5_round_cash_totals.sql
--
-- Rollback: 20260706120000_calculate_order_totals_fast_v6_aggregate_tax_rollback.sql
--   (re-applies the v5 body).
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
-- v6: split the unpaid total into subtotal (per-item prorated, as v5) and
-- tax (aggregate-per-rate-group) components.
v_unpaid_card_subtotal numeric;
v_unpaid_cash_subtotal numeric;
v_unpaid_card_tax numeric;
v_unpaid_cash_tax numeric;
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

-- v6: effective (discounted) subtotals — sum of per-item net subtotals (as v5).
SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0)
INTO v_card_subtotal, v_cash_subtotal
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

v_card_subtotal := ROUND(v_card_subtotal, 2);
v_cash_subtotal := ROUND(v_cash_subtotal, 2);

-- v6: AGGREGATE-PER-RATE-GROUP sales tax (replaces v5's SUM(tax_amount)).
-- For each distinct positive tax_rate, round ONCE on the group's net subtotal
-- sum. Exempt / rate-0 items are excluded (contribute no tax). Card and cash
-- are grouped and rounded independently. Negative-net groups net out inside
-- the SUM before rounding (correct sign behaviour).
SELECT
    COALESCE(SUM(ROUND(grp_card_net * rate / 100, 2)), 0),
    COALESCE(SUM(ROUND(grp_cash_net * rate / 100, 2)), 0)
INTO v_card_tax, v_cash_tax
FROM (
    SELECT
        COALESCE(tax_rate, 0) AS rate,
        SUM(subtotal)         AS grp_card_net,
        SUM(cash_subtotal)    AS grp_cash_net
    FROM public.order_items
    WHERE order_id = p_order_id
      AND is_voided = false
      AND COALESCE(tax_rate, 0) > 0
    GROUP BY COALESCE(tax_rate, 0)
) g;

-- v6: redistribute the group tax back onto per-item tax_amount/cash_tax_amount
-- so Σ(order_items.tax_amount) == the aggregate above (== orders.tax_amount −
-- SC_tax). Each item keeps ROUND(net*rate,2); the group's rounding residual is
-- assigned to the last item in the group (highest created_at, id) — the same
-- "remainder to last item" convention redistribute_order_discount uses. Guarded
-- so steady-state recomputes write nothing.
WITH taxable AS (
    SELECT id, created_at, COALESCE(tax_rate, 0) AS rate, subtotal AS net_card, cash_subtotal AS net_cash
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false AND COALESCE(tax_rate, 0) > 0
),
per_item AS (
    SELECT id, created_at, rate,
           ROUND(net_card * rate / 100, 2) AS item_card_tax,
           ROUND(net_cash * rate / 100, 2) AS item_cash_tax
    FROM taxable
),
grp AS (
    SELECT rate,
           ROUND(SUM(net_card) * rate / 100, 2) AS grp_card_tax,
           ROUND(SUM(net_cash) * rate / 100, 2) AS grp_cash_tax,
           SUM(ROUND(net_card * rate / 100, 2)) AS sum_item_card_tax,
           SUM(ROUND(net_cash * rate / 100, 2)) AS sum_item_cash_tax
    FROM taxable
    GROUP BY rate
),
last_item AS (
    SELECT DISTINCT ON (rate) rate, id
    FROM taxable
    ORDER BY rate, created_at DESC, id DESC
),
alloc AS (
    SELECT oi.id,
           CASE
               WHEN pi.id IS NULL THEN 0
               ELSE pi.item_card_tax
                    + CASE WHEN li.id = oi.id THEN (g.grp_card_tax - g.sum_item_card_tax) ELSE 0 END
           END AS card_tax,
           CASE
               WHEN pi.id IS NULL THEN 0
               ELSE pi.item_cash_tax
                    + CASE WHEN li.id = oi.id THEN (g.grp_cash_tax - g.sum_item_cash_tax) ELSE 0 END
           END AS cash_tax
    FROM public.order_items oi
    LEFT JOIN per_item pi ON pi.id = oi.id
    LEFT JOIN grp g       ON g.rate = pi.rate
    LEFT JOIN last_item li ON li.id = oi.id
    WHERE oi.order_id = p_order_id AND oi.is_voided = false
)
UPDATE public.order_items oi
SET tax_amount = a.card_tax,
    cash_tax_amount = a.cash_tax,
    updated_at = now()
FROM alloc a
WHERE oi.id = a.id
  AND (oi.tax_amount IS DISTINCT FROM a.card_tax
    OR oi.cash_tax_amount IS DISTINCT FROM a.cash_tax);

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

-- v6: unpaid/outstanding totals. Subtotal proration stays per-item (as v5);
-- the TAX component is aggregate-per-rate-group over the unpaid net subtotals,
-- so a fully-unpaid order's outstanding tax equals the order tax exactly.
SELECT
    COALESCE(SUM(ROUND(subtotal * uf, 2)), 0),
    COALESCE(SUM(ROUND(cash_subtotal * uf, 2)), 0)
INTO v_unpaid_card_subtotal, v_unpaid_cash_subtotal
FROM (
    SELECT subtotal, cash_subtotal,
           (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::numeric
               / NULLIF(quantity, 0) AS uf
    FROM public.order_items
    WHERE order_id = p_order_id
      AND is_voided = false
      AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0
) s;

SELECT
    COALESCE(SUM(ROUND(grp_unpaid_card * rate / 100, 2)), 0),
    COALESCE(SUM(ROUND(grp_unpaid_cash * rate / 100, 2)), 0)
INTO v_unpaid_card_tax, v_unpaid_cash_tax
FROM (
    SELECT
        COALESCE(tax_rate, 0) AS rate,
        SUM(subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::numeric
            / NULLIF(quantity, 0)) AS grp_unpaid_card,
        SUM(cash_subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::numeric
            / NULLIF(quantity, 0)) AS grp_unpaid_cash
    FROM public.order_items
    WHERE order_id = p_order_id
      AND is_voided = false
      AND COALESCE(tax_rate, 0) > 0
      AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0
    GROUP BY COALESCE(tax_rate, 0)
) g;

v_unpaid_card_total := v_unpaid_card_subtotal + v_unpaid_card_tax;
v_unpaid_cash_total := v_unpaid_cash_subtotal + v_unpaid_cash_tax;

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

-- v2 effective_paid_cash logic (preserved across v3/v4/v5/v6).
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
  'v6 — sales tax is aggregate-per-rate-group: for each distinct order_items.tax_rate, ROUND(SUM(net subtotal) * rate/100, 2), summed, card/cash independent, applied to order tax and unpaid/outstanding tax. Replaces v5''s SUM(per-item rounded tax) which drifted a cent low on multi-item orders (e.g. 519.95 vs 519.96 on a 23-item 8.875% order). Group tax is redistributed onto per-item tax_amount (residual to last item) so SUM(order_items.tax_amount) == orders.tax_amount − SC_tax; write is IS DISTINCT FROM guarded. v5 cash-dust rounding, v4 SC-tax restore, v3 dynamic manual SC, v2 effective_paid_cash all preserved.';
