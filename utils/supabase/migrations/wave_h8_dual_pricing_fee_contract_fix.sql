-- =====================================================================
-- Wave H.8 — dual_pricing_fee = pct × total_amount (contract fix)
-- =====================================================================
-- Why: process_payment_v11 was storing dual_pricing_fee as
-- (card_subtotal − cash_subtotal) — the menu-tier price differential
-- between card and cash menus. The documented contract (and the value
-- the bank actually withholds) is dual_pricing_percentage × total_amount.
-- Result on batch 010: stored $42.50 vs contract $5.02 — an 8× overstate
-- that surfaced on the printed batch receipt.
--
-- This migration:
--   1. Patches process_payment_v11 to use the pct×total formula and
--      forces tip_fee = 0 (tip is already inside total_amount; the
--      separate column would double-count once tip_surcharge_percentage
--      becomes non-zero in the future).
--   2. Patches apply_refund_to_payment_v3 so its pro-rata uses total_amount
--      as the denominator (matching the new fee semantics, which include
--      tip) and forces refunded_tip_fee = 0.
--   3. Backfills the last 2 days of order_payments rows from the snapshot.
--
-- Surfaces affected (downstream, merchant-only — customer receipts already
-- ignore this column):
--   * get_batch_summary_v1.fees.dual_pricing_fee  (printed batch receipt)
--   * get_platform_fees_summary
-- Net deposit math is unchanged — the fee is informational, not subtracted.
-- =====================================================================

-- 1) Writer ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_v11(
    p_order_id uuid,
    p_payment_method text,
    p_amount numeric DEFAULT NULL::numeric,
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL::numeric,
    p_item_allocations jsonb DEFAULT NULL::jsonb,
    p_staff_id uuid DEFAULT NULL::uuid,
    p_terminal_response jsonb DEFAULT NULL::jsonb,
    p_split_count integer DEFAULT NULL::integer,
    p_split_portion_index integer DEFAULT NULL::integer,
    p_force_card_pricing boolean DEFAULT false,
    p_terminal_id uuid DEFAULT NULL::uuid,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_station_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb; v_result jsonb; v_cached_result jsonb;
    v_order record; v_payment_id uuid;
    v_is_cash boolean; v_is_item_payment boolean; v_is_split_payment boolean;
    v_payment_total numeric; v_new_sync_version integer;
    v_subtotal_portion numeric := 0; v_tax_portion numeric := 0;
    v_change_given numeric := 0; v_new_amount_paid numeric;
    v_new_amount_due numeric; v_new_cash_amount_due numeric;
    v_current_pricing_mode text; v_new_pricing_mode text;
    v_items_subtotal numeric := 0; v_items_tax numeric := 0;
    v_covered_items uuid[] := '{}'; v_covered_items_json jsonb := '[]'::jsonb;
    v_unpaid_items_count integer := 0;
    v_unpaid_card_total numeric := 0; v_unpaid_cash_total numeric := 0;
    v_pre_unpaid_card_total numeric := 0; v_pre_unpaid_cash_total numeric := 0;
    v_effective_paid numeric := 0; v_payment_based_due numeric := 0;
    v_custom_refund_balance numeric := 0;
    v_total_cash_paid numeric := 0; v_total_card_paid numeric := 0;
    v_order_fully_paid boolean := false;
    v_split_card_portion numeric; v_split_cash_portion numeric;
    v_portions_paid integer := 0; v_portions_remaining integer := 0;
    v_paid_portion_indexes integer[];
    v_is_last_portion boolean := false; v_is_full_remaining boolean := false;
    v_target_unpaid numeric := 0;
    v_dejavoo_reference_id text; v_dejavoo_transaction_number text;
    v_dejavoo_auth_code text; v_dejavoo_batch_number text;
    v_dejavoo_invoice_number text; v_dejavoo_rrn text;
    v_dejavoo_entry_mode text; v_dejavoo_result_code text;
    v_dejavoo_status_code text; v_has_dejavoo_transaction boolean := false;
    v_dejavoo_last_four text;
    v_use_cash_pricing boolean; v_terminal_id uuid;
    v_dpp numeric; v_tsp numeric;
    v_dual_pricing_fee numeric := 0; v_tip_fee numeric := 0;
    v_cash_equivalent_subtotal_portion numeric := 0;
    v_items_cash_subtotal numeric := 0;
    v_acquirer text; v_batch_number text;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'process_payment_v11');
        IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
    END IF;

    v_is_cash := p_payment_method = 'cash';
    v_use_cash_pricing := v_is_cash AND NOT COALESCE(p_force_card_pricing, false);
    v_is_item_payment := p_item_allocations IS NOT NULL AND jsonb_array_length(p_item_allocations) > 0;
    v_is_split_payment := p_split_count IS NOT NULL AND p_split_count > 1;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND merchant_id = user_merchant_id() AND location_id = ANY(user_location_ids())
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
    IF v_order.payment_status = 'paid' AND COALESCE(v_order.amount_due, 0) <= 0 THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;

    v_current_pricing_mode := v_order.payment_pricing_mode::text;

    SELECT COUNT(*),
        COALESCE(SUM(((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)), 0),
        COALESCE(SUM(((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)), 0)
    INTO v_unpaid_items_count, v_pre_unpaid_card_total, v_pre_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    SELECT COALESCE(SUM(COALESCE(original_amount, amount) - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)), 0)
    INTO v_effective_paid FROM public.order_payments
    WHERE order_id = p_order_id AND status IN ('captured', 'partially_refunded', 'refunded') AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_pre_unpaid_card_total, 0);
    v_pre_unpaid_card_total := v_pre_unpaid_card_total + v_custom_refund_balance;
    v_pre_unpaid_cash_total := v_pre_unpaid_cash_total + v_custom_refund_balance;

    IF v_payment_based_due < v_pre_unpaid_card_total THEN
        IF v_pre_unpaid_card_total > 0 THEN
            v_pre_unpaid_cash_total := ROUND(v_pre_unpaid_cash_total * v_payment_based_due / v_pre_unpaid_card_total, 2);
        END IF;
        v_pre_unpaid_card_total := v_payment_based_due;
    END IF;

    IF v_unpaid_items_count = 0 AND v_custom_refund_balance <= 0 AND v_payment_based_due <= 0 THEN
        RAISE EXCEPTION 'No unpaid items remaining on this order';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN is_cash_priced THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN NOT is_cash_priced THEN total_amount ELSE 0 END), 0)
    INTO v_total_cash_paid, v_total_card_paid
    FROM public.order_payments
    WHERE order_id = p_order_id AND status = 'captured';

    IF v_is_split_payment THEN
        IF p_split_portion_index IS NULL THEN RAISE EXCEPTION 'Split portion index is required for split payments'; END IF;
        IF p_split_portion_index < 1 OR p_split_portion_index > p_split_count THEN
            RAISE EXCEPTION 'Invalid split portion index: % (must be 1-%)', p_split_portion_index, p_split_count;
        END IF;
        IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = p_order_id AND split_portion_index = p_split_portion_index AND status = 'captured') THEN
            RAISE EXCEPTION 'Split portion % has already been paid', p_split_portion_index;
        END IF;
        SELECT COUNT(*), COALESCE(array_agg(split_portion_index ORDER BY split_portion_index), ARRAY[]::integer[])
        INTO v_portions_paid, v_paid_portion_indexes
        FROM public.order_payments
        WHERE order_id = p_order_id AND split_portion_index IS NOT NULL AND status = 'captured';
        v_portions_remaining := p_split_count - v_portions_paid - 1;
        v_is_last_portion := (v_portions_remaining = 0);
    END IF;

    IF v_current_pricing_mode IS NULL THEN
        v_new_pricing_mode := CASE WHEN v_use_cash_pricing THEN 'cash' ELSE 'card' END;
    ELSIF v_current_pricing_mode = 'card' AND v_use_cash_pricing THEN v_new_pricing_mode := 'mixed';
    ELSIF v_current_pricing_mode = 'cash' AND NOT v_use_cash_pricing THEN v_new_pricing_mode := 'mixed';
    ELSE v_new_pricing_mode := v_current_pricing_mode; END IF;

    IF v_is_item_payment THEN
        WITH payment_calc AS (
            SELECT oi.id, oi.item_name, oi.quantity AS original_qty, oi.unit_price, oi.cash_price, oi.tax_rate, oi.discount_amount,
                COALESCE(oi.paid_quantity, 0) AS already_paid_qty, COALESCE(oi.refunded_quantity, 0) AS refunded_qty,
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS effective_unpaid,
                LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS qty_paying,
                ROUND(COALESCE(oi.discount_amount, 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_discount,
                ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_cash_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id AND oi.is_voided = false AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT
            COALESCE(SUM(CASE WHEN v_is_cash THEN (pc.qty_paying * pc.cash_price) - pc.prorated_cash_discount ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount END), 0),
            COALESCE(SUM(ROUND((CASE WHEN v_is_cash THEN (pc.qty_paying * pc.cash_price) - pc.prorated_cash_discount ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount END) * COALESCE(pc.tax_rate, 0) / 100, 2)), 0),
            COALESCE(SUM((pc.qty_paying * pc.cash_price) - pc.prorated_cash_discount), 0),
            array_agg(pc.id)
        INTO v_items_subtotal, v_items_tax, v_items_cash_subtotal, v_covered_items
        FROM payment_calc pc;

        v_payment_total := v_items_subtotal + v_items_tax;
        v_subtotal_portion := v_items_subtotal;
        v_tax_portion := v_items_tax;
        v_cash_equivalent_subtotal_portion := v_items_cash_subtotal;

        WITH payment_calc AS (
            SELECT oi.id, oi.item_name, oi.quantity AS original_qty, oi.unit_price, oi.cash_price, oi.tax_rate,
                LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS qty_paying,
                ROUND(COALESCE(oi.discount_amount, 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_discount,
                ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_cash_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id AND oi.is_voided = false AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', pc.id, 'item_name', pc.item_name, 'quantity_paid', pc.qty_paying, 'original_quantity', pc.original_qty,
            'unit_price', CASE WHEN v_is_cash THEN pc.cash_price ELSE pc.unit_price END,
            'tax_rate', COALESCE(pc.tax_rate, 0),
            'prorated_discount', CASE WHEN v_is_cash THEN pc.prorated_cash_discount ELSE pc.prorated_discount END,
            'subtotal', CASE WHEN v_is_cash THEN (pc.qty_paying * pc.cash_price) - pc.prorated_cash_discount ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount END
        )), '[]'::jsonb)
        INTO v_covered_items_json FROM payment_calc pc;

        UPDATE public.order_items oi
        SET paid_quantity = LEAST(oi.quantity, COALESCE(oi.paid_quantity, 0) + LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)), oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))),
            refunded_quantity = GREATEST(COALESCE(oi.refunded_quantity, 0) - LEAST(COALESCE((alloc.value->>'quantity')::integer, COALESCE(oi.refunded_quantity, 0)), COALESCE(oi.refunded_quantity, 0)), 0),
            price_paid = CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
            updated_at = now()
        FROM jsonb_array_elements(p_item_allocations) AS alloc
        WHERE oi.id = (alloc.value->>'order_item_id')::uuid AND oi.order_id = p_order_id AND oi.is_voided = false;

    ELSIF v_is_split_payment THEN
        v_split_card_portion := ROUND(v_order.card_total / p_split_count, 2);
        v_split_cash_portion := ROUND(v_order.cash_total / p_split_count, 2);
        IF v_is_last_portion THEN
            IF v_is_cash THEN v_payment_total := v_order.cash_total - (v_split_cash_portion * (p_split_count - 1));
            ELSE v_payment_total := v_order.card_total - (v_split_card_portion * (p_split_count - 1)); END IF;
            v_payment_total := GREATEST(v_payment_total, 0);
        ELSE
            IF v_is_cash THEN v_payment_total := v_split_cash_portion;
            ELSE v_payment_total := v_split_card_portion; END IF;
        END IF;
        IF v_is_cash AND v_order.cash_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
        ELSIF v_order.card_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2); END IF;
        v_tax_portion := v_payment_total - v_subtotal_portion;
        IF v_is_cash THEN v_cash_equivalent_subtotal_portion := v_subtotal_portion;
        ELSIF v_order.card_total > 0 THEN v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2); END IF;

    ELSE
        v_target_unpaid := CASE WHEN v_use_cash_pricing THEN v_pre_unpaid_cash_total ELSE v_pre_unpaid_card_total END;
        v_is_full_remaining := (p_amount IS NULL) OR (p_amount >= (v_target_unpaid - 0.05));
        IF v_is_full_remaining THEN
            v_payment_total := v_target_unpaid;
            IF v_use_cash_pricing AND v_order.cash_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2); END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            IF v_is_cash THEN v_cash_equivalent_subtotal_portion := v_subtotal_portion;
            ELSIF v_order.card_total > 0 THEN v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2); END IF;
            SELECT array_agg(id) INTO v_covered_items FROM public.order_items WHERE order_id = p_order_id AND is_voided = false AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_item_id', oi.id, 'item_name', oi.item_name,
                'quantity_paid', (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                'original_quantity', oi.quantity,
                'unit_price', CASE WHEN v_use_cash_pricing THEN oi.cash_price ELSE oi.unit_price END,
                'discount_amount', COALESCE(oi.discount_amount, 0),
                'tax_rate', COALESCE(oi.tax_rate, 0),
                'subtotal', (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * CASE WHEN v_use_cash_pricing THEN oi.cash_price ELSE oi.unit_price END
            )), '[]'::jsonb) INTO v_covered_items_json FROM public.order_items oi WHERE oi.id = ANY(v_covered_items);
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = CASE WHEN v_use_cash_pricing THEN cash_price ELSE unit_price END, updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
        ELSE
            v_payment_total := LEAST(p_amount, v_target_unpaid);
            v_payment_total := GREATEST(v_payment_total, 0);
            IF v_use_cash_pricing AND v_order.cash_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2); END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            IF v_is_cash THEN v_cash_equivalent_subtotal_portion := v_subtotal_portion;
            ELSIF v_order.card_total > 0 THEN v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2); END IF;
        END IF;
    END IF;

    IF v_is_cash THEN
        v_change_given := GREATEST(COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + COALESCE(p_tip_amount, 0)), 0);
    END IF;

    IF p_terminal_response ? 'dejavoo_transaction' THEN
        v_has_dejavoo_transaction := true;
        v_dejavoo_reference_id := p_terminal_response->'dejavoo_transaction'->>'referenceId';
        v_dejavoo_transaction_number := p_terminal_response->'dejavoo_transaction'->>'transactionNumber';
        v_dejavoo_auth_code := p_terminal_response->'dejavoo_transaction'->>'authCode';
        v_dejavoo_batch_number := p_terminal_response->'dejavoo_transaction'->>'batchNumber';
        v_dejavoo_invoice_number := p_terminal_response->'dejavoo_transaction'->>'invoiceNumber';
        v_dejavoo_rrn := p_terminal_response->'dejavoo_transaction'->>'rrn';
        v_dejavoo_entry_mode := p_terminal_response->'dejavoo_transaction'->>'entryMode';
        v_dejavoo_result_code := p_terminal_response->'dejavoo_transaction'->>'resultCode';
        v_dejavoo_status_code := p_terminal_response->'dejavoo_transaction'->>'statusCode';
        v_dejavoo_last_four := p_terminal_response->'dejavoo_transaction'->>'cardLast4';
        v_batch_number := v_dejavoo_batch_number;
    END IF;

    IF p_terminal_response ? 'castles_transaction' THEN
        v_has_dejavoo_transaction := true;
        v_dejavoo_reference_id := p_terminal_response->'castles_transaction'->>'referenceId';
        v_dejavoo_transaction_number := p_terminal_response->'castles_transaction'->>'referenceId';
        v_dejavoo_auth_code := p_terminal_response->'castles_transaction'->>'approvalCode';
        v_dejavoo_batch_number := p_terminal_response->'castles_transaction'->>'batchNumber';
        v_dejavoo_rrn := p_terminal_response->'castles_transaction'->>'rrn';
        v_dejavoo_entry_mode := p_terminal_response->'castles_transaction'->>'entryMode';
        v_dejavoo_result_code := p_terminal_response->'castles_transaction'->>'resultCode';
        v_dejavoo_status_code := p_terminal_response->'castles_transaction'->>'resultCode';
        v_dejavoo_last_four := p_terminal_response->'castles_transaction'->>'cardLast4';
        v_acquirer := 'TSYS';
        v_batch_number := v_dejavoo_batch_number;
    END IF;

    v_terminal_id := COALESCE(
        p_terminal_id,
        (p_terminal_response->'castles_transaction'->>'terminalId')::uuid,
        (p_terminal_response->'dejavoo_transaction'->>'terminalId')::uuid,
        (p_terminal_response->>'terminal_id')::uuid
    );

    SELECT COALESCE(dual_pricing_percentage, 0), COALESCE(tip_surcharge_percentage, 0)
    INTO v_dpp, v_tsp FROM public.locations WHERE id = v_order.location_id;

    -- Wave H.8: dual_pricing_fee = pct × total_amount (the surcharge the
    -- bank withholds). Previously stored card-tier minus cash-tier
    -- subtotal differential, which overstated the fee by ~8×.
    IF v_is_cash THEN
        v_dual_pricing_fee := 0;
    ELSE
        v_dual_pricing_fee := ROUND((v_payment_total + COALESCE(p_tip_amount, 0)) * v_dpp / 100, 2);
    END IF;

    -- Wave H.8: tip is already inside total_amount (and inside the fee
    -- above). A separate tip_fee column double-counts once tip_surcharge
    -- is non-zero. Force 0 to make the invariant load-bearing.
    v_tip_fee := 0;

    INSERT INTO public.order_payments (
        order_id, payment_method, amount, tip_amount, total_amount, subtotal_portion, tax_portion,
        amount_tendered, change_given, is_cash_priced, cash_discount_applied, original_amount,
        covers_items, split_portion_index, split_count, status, terminal_type, processed_by_staff_id,
        processor_response, reference_number, transaction_id, authorization_code, dejavoo_response_code,
        dejavoo_batch_number, dejavoo_invoice_number, card_type, card_last_four, captured_at, initiated_at,
        merchant_id, location_id, rrn, result_code, result_message, terminal_id, idempotency_key,
        dual_pricing_fee, tip_fee, dual_pricing_percentage_snapshot, tip_surcharge_percentage_snapshot,
        acquirer, batch_number
    ) VALUES (
        p_order_id, p_payment_method::payment_method, v_payment_total, COALESCE(p_tip_amount, 0),
        v_payment_total + COALESCE(p_tip_amount, 0), v_subtotal_portion, v_tax_portion,
        CASE WHEN v_is_cash THEN COALESCE(p_amount_tendered, v_payment_total) END,
        v_change_given, v_use_cash_pricing, v_use_cash_pricing,
        CASE WHEN v_use_cash_pricing THEN ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2) ELSE v_payment_total END,
        CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
        p_split_portion_index, p_split_count, 'captured',
        CASE WHEN v_is_cash THEN 'cash_drawer' WHEN p_terminal_response ? 'castles_transaction' THEN 'castles' ELSE 'dejavoo' END::terminal_type,
        p_staff_id, p_terminal_response,
        COALESCE(v_dejavoo_reference_id, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_auth_code, p_terminal_response->>'authorization_code'),
        v_dejavoo_status_code, v_dejavoo_batch_number, v_dejavoo_invoice_number,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'cardType', p_terminal_response->'castles_transaction'->>'cardType', p_terminal_response->>'card_type'),
        v_dejavoo_last_four, now(), now(), v_order.merchant_id, v_order.location_id,
        v_dejavoo_rrn, v_dejavoo_result_code,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'resultMessage', p_terminal_response->'castles_transaction'->>'statusMessage'),
        v_terminal_id, p_idempotency_key::text, v_dual_pricing_fee, v_tip_fee, v_dpp, v_tsp,
        v_acquirer, v_batch_number
    ) RETURNING id INTO v_payment_id;

    PERFORM log_payment_event(
        p_payment_id := v_payment_id, p_order_id := p_order_id, p_location_id := v_order.location_id,
        p_event_type := 'captured', p_amount := v_payment_total, p_tip_amount := COALESCE(p_tip_amount, 0),
        p_previous_status := NULL, p_new_status := 'captured',
        p_psp_reference := COALESCE(v_dejavoo_reference_id, v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        p_auth_code := v_dejavoo_auth_code, p_staff_id := p_staff_id,
        p_terminal_id := COALESCE(p_terminal_response->'castles_transaction'->>'terminalId', p_terminal_response->'dejavoo_transaction'->>'terminalId', p_terminal_response->>'terminal_id'),
        p_result_code := COALESCE(v_dejavoo_result_code, '00'),
        p_response_message := CASE WHEN v_is_cash THEN 'Cash payment captured'
            ELSE COALESCE(p_terminal_response->'dejavoo_transaction'->>'resultMessage', p_terminal_response->'castles_transaction'->>'statusMessage', 'Card payment captured successfully') END,
        p_raw_response := p_terminal_response, p_reason := NULL
    );

    IF v_is_item_payment AND array_length(v_covered_items, 1) > 0 THEN
        INSERT INTO public.order_payment_items (order_payment_id, order_item_id, quantity_paid, unit_price_paid, subtotal_paid, tax_paid)
        SELECT v_payment_id, (ci->>'order_item_id')::uuid, (ci->>'quantity_paid')::integer,
            (ci->>'unit_price')::numeric, (ci->>'subtotal')::numeric,
            ROUND((ci->>'subtotal')::numeric * COALESCE((ci->>'tax_rate')::numeric, 0) / 100, 2)
        FROM jsonb_array_elements(v_covered_items_json) AS ci;
    ELSIF v_is_full_remaining AND array_length(v_covered_items, 1) > 0 THEN
        INSERT INTO public.order_payment_items (order_payment_id, order_item_id, quantity_paid, unit_price_paid, subtotal_paid, tax_paid)
        SELECT v_payment_id, (ci->>'order_item_id')::uuid, (ci->>'quantity_paid')::integer, (ci->>'unit_price')::numeric,
            (ci->>'quantity_paid')::integer * (ci->>'unit_price')::numeric - ROUND(COALESCE((ci->>'discount_amount')::numeric, 0) * (ci->>'quantity_paid')::integer / NULLIF((ci->>'original_quantity')::integer, 0), 2),
            ROUND(((ci->>'quantity_paid')::integer * (ci->>'unit_price')::numeric - ROUND(COALESCE((ci->>'discount_amount')::numeric, 0) * (ci->>'quantity_paid')::integer / NULLIF((ci->>'original_quantity')::integer, 0), 2)) * COALESCE((ci->>'tax_rate')::numeric, 0) / 100, 2)
        FROM jsonb_array_elements(v_covered_items_json) AS ci;
    END IF;

    IF v_use_cash_pricing THEN v_total_cash_paid := v_total_cash_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    ELSE v_total_card_paid := v_total_card_paid + v_payment_total + COALESCE(p_tip_amount, 0); END IF;
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    SELECT COUNT(*),
        COALESCE(SUM(((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)), 0),
        COALESCE(SUM(((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)), 0)
    INTO v_unpaid_items_count, v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items oi WHERE oi.order_id = p_order_id AND oi.is_voided = false AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    SELECT COALESCE(SUM(COALESCE(original_amount, amount) - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)), 0)
    INTO v_effective_paid FROM public.order_payments
    WHERE order_id = p_order_id AND status IN ('captured', 'partially_refunded', 'refunded') AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;

    IF v_payment_based_due < v_unpaid_card_total THEN
        IF v_unpaid_card_total > 0 THEN v_unpaid_cash_total := ROUND(v_unpaid_cash_total * v_payment_based_due / v_unpaid_card_total, 2); END IF;
        v_unpaid_card_total := v_payment_based_due;
    END IF;

    IF v_is_item_payment THEN
        v_order_fully_paid := (v_unpaid_items_count = 0);
    ELSIF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid FROM public.order_payments
        WHERE order_id = p_order_id AND split_portion_index IS NOT NULL AND split_count = p_split_count AND status = 'captured';
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
    ELSE
        v_order_fully_paid := (
            (v_total_cash_paid >= v_order.cash_total AND v_total_card_paid = 0) OR
            (v_total_card_paid >= v_order.card_total AND v_total_cash_paid = 0) OR
            (v_unpaid_card_total <= 0.01 AND v_unpaid_cash_total <= 0.01) OR
            (v_new_amount_paid >= v_order.card_total)
        );
    END IF;

    IF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid FROM public.order_payments
        WHERE order_id = p_order_id AND split_portion_index IS NOT NULL AND split_count = p_split_count AND status = 'captured';
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = COALESCE(price_paid, unit_price), updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            v_unpaid_items_count := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
        END IF;
    ELSE
        IF NOT v_order_fully_paid THEN v_order_fully_paid := (v_unpaid_items_count = 0); END IF;
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = COALESCE(price_paid, CASE WHEN v_use_cash_pricing THEN cash_price ELSE unit_price END), updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            v_unpaid_items_count := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
        END IF;
    END IF;

    IF v_order_fully_paid THEN
        v_new_amount_due := 0; v_new_cash_amount_due := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
    ELSE
        v_new_amount_due := v_unpaid_card_total; v_new_cash_amount_due := v_unpaid_cash_total;
    END IF;

    UPDATE public.orders SET amount_paid = v_new_amount_paid, amount_due = v_new_amount_due,
        cash_amount_due = v_new_cash_amount_due,
        tip_amount = COALESCE(tip_amount, 0) + COALESCE(p_tip_amount, 0),
        payment_pricing_mode = v_new_pricing_mode::pricing_mode,
        cash_discount_applied = COALESCE(cash_discount_applied, false) OR v_use_cash_pricing,
        payment_status = CASE WHEN v_order_fully_paid THEN 'paid'::payment_status WHEN v_new_amount_paid > 0 THEN 'partial'::payment_status ELSE 'pending'::payment_status END,
        updated_at = now()
    WHERE id = p_order_id;

    v_new_sync_version := increment_order_sync_version(p_order_id);

    v_result := jsonb_build_object(
        'success', true, 'payment_id', v_payment_id, 'payment_method', p_payment_method,
        'amount_charged', v_payment_total, 'tip_amount', COALESCE(p_tip_amount, 0),
        'total_collected', v_payment_total + COALESCE(p_tip_amount, 0), 'change_given', v_change_given,
        'is_cash_priced', v_use_cash_pricing, 'pricing_mode', v_new_pricing_mode,
        'is_item_payment', v_is_item_payment, 'is_split_payment', v_is_split_payment, 'is_full_remaining', v_is_full_remaining,
        'split_count', p_split_count, 'split_portion_index', p_split_portion_index,
        'portions_paid', v_portions_paid, 'portions_remaining', v_portions_remaining,
        'split_card_portion', v_split_card_portion, 'split_cash_portion', v_split_cash_portion,
        'items_paid', v_covered_items_json, 'items_covered', v_covered_items,
        'total_cash_paid', v_total_cash_paid, 'total_card_paid', v_total_card_paid,
        'order_amount_paid', v_new_amount_paid, 'order_amount_due', v_new_amount_due,
        'order_cash_amount_due', v_new_cash_amount_due, 'order_fully_paid', v_order_fully_paid,
        'unpaid_items_count', v_unpaid_items_count, 'unpaid_card_total', v_unpaid_card_total,
        'unpaid_cash_total', v_unpaid_cash_total, 'sync_version', v_new_sync_version,
        'dual_pricing_fee', v_dual_pricing_fee, 'tip_fee', v_tip_fee,
        'dual_pricing_percentage_snapshot', v_dpp, 'tip_surcharge_percentage_snapshot', v_tsp,
        'acquirer', v_acquirer, 'batch_number', v_batch_number
    );

    IF p_idempotency_key IS NOT NULL THEN
        v_cached_result := v_result;
        IF jsonb_typeof(v_result->'items_covered') = 'array' AND jsonb_array_length(v_result->'items_covered') > 100 THEN
            v_cached_result := v_cached_result - 'items_covered' - 'items_paid';
        END IF;
        PERFORM public._idempotency_complete(p_idempotency_key, 'process_payment_v11', v_cached_result);
    END IF;

    RETURN v_result;
END;
$function$;


-- 2) Refund-side: pro-rate by total_amount (which now matches the fee
--    semantics — pct × total), and force refunded_tip_fee = 0.
CREATE OR REPLACE FUNCTION public.apply_refund_to_payment_v3(
    p_payment_id uuid,
    p_refund_amount numeric,
    p_reversal_type reversal_type,
    p_tip_refund_amount numeric DEFAULT 0,
    p_return_rrn text DEFAULT NULL::text,
    p_return_auth_code text DEFAULT NULL::text,
    p_return_reference_id text DEFAULT NULL::text,
    p_return_number text DEFAULT NULL::text,
    p_return_reason text DEFAULT NULL::text,
    p_initiated_by uuid DEFAULT NULL::uuid,
    p_restore_paid_quantity boolean DEFAULT false,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_station_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached JSONB;
    v_payment record;
    v_new_refunded numeric;
    v_new_status payment_status;
    v_ci record;
    v_combined_ratio numeric;
    v_delta_dpf numeric;
    v_is_full_refund boolean;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'apply_refund_to_payment_v3');
        IF v_cached IS NOT NULL THEN RETURN; END IF;
    END IF;

    SELECT op.*, o.id AS o_order_id INTO v_payment
    FROM order_payments op JOIN orders o ON o.id = op.order_id
    WHERE op.id = p_payment_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids());

    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;

    PERFORM public._assert_order_station_match(v_payment.o_order_id, p_station_id);

    v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

    IF p_reversal_type = 'void' THEN
        v_new_status := 'void'::payment_status;
    ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
        v_new_status := 'refunded'::payment_status;
    ELSE
        v_new_status := 'partially_refunded'::payment_status;
    END IF;

    v_is_full_refund := (p_reversal_type = 'void')
        OR (v_new_refunded + 0.0001 >= v_payment.amount);

    -- Wave H.8: dual_pricing_fee is now pct × total_amount (sale+tip).
    -- Pro-rate the refunded portion against total_amount, not amount.
    v_combined_ratio := CASE WHEN COALESCE(v_payment.total_amount, 0) > 0
        THEN (p_refund_amount + COALESCE(p_tip_refund_amount, 0)) / v_payment.total_amount
        ELSE 0 END;

    v_delta_dpf := ROUND(COALESCE(v_payment.dual_pricing_fee, 0) * v_combined_ratio, 2);

    UPDATE order_payments
    SET refunded_amount = v_new_refunded,
        refunded_at = now(),
        status = v_new_status,
        is_voided = (p_reversal_type = 'void'),
        is_returned = true,
        returned_at = now(),
        returned_by = COALESCE(p_initiated_by, returned_by),
        return_amount = v_new_refunded,
        return_rrn = COALESCE(p_return_rrn, return_rrn),
        return_auth_code = COALESCE(p_return_auth_code, return_auth_code),
        return_reference_id = COALESCE(p_return_reference_id, return_reference_id),
        return_number = COALESCE(p_return_number, return_number),
        return_reason = COALESCE(p_return_reason, return_reason),
        refunded_dual_pricing_fee = CASE WHEN v_is_full_refund
            THEN dual_pricing_fee
            ELSE LEAST(dual_pricing_fee, COALESCE(refunded_dual_pricing_fee, 0) + v_delta_dpf)
        END,
        -- Wave H.8: tip_fee is forced to 0 at write time, so the refunded
        -- mirror stays 0 too. No separate tip-fee accounting.
        refunded_tip_fee = 0
    WHERE id = p_payment_id;

    IF p_restore_paid_quantity THEN
        UPDATE public.order_items oi
        SET paid_quantity = GREATEST(COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
        FROM public.order_payment_items opi
        WHERE opi.order_payment_id = p_payment_id AND opi.order_item_id = oi.id;

        IF NOT EXISTS (SELECT 1 FROM public.order_payment_items WHERE order_payment_id = p_payment_id)
           AND v_payment.covers_items IS NOT NULL THEN
            FOR v_ci IN SELECT unnest(v_payment.covers_items) AS item_id LOOP
                UPDATE public.order_items
                SET paid_quantity = GREATEST(COALESCE(paid_quantity, 0) - 1, 0)
                WHERE id = v_ci.item_id::uuid;
            END LOOP;
        END IF;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'apply_refund_to_payment_v3', '{}'::jsonb);
    END IF;
END;
$function$;


-- 3) Backfill — last 2 days of captures only, per user direction.
--    Snapshot column is the source of truth where present; locations
--    table is the fallback for older rows.
WITH window_rows AS (
    SELECT op.id, op.total_amount, op.refunded_amount,
           COALESCE(op.dual_pricing_percentage_snapshot, l.dual_pricing_percentage, 0) AS pct
    FROM public.order_payments op
    LEFT JOIN public.locations l ON l.id = op.location_id
    WHERE COALESCE(op.is_cash_priced, false) = false
      AND op.captured_at >= now() - interval '2 days'
)
UPDATE public.order_payments op
SET dual_pricing_fee = ROUND(COALESCE(wr.total_amount, 0) * wr.pct / 100, 2),
    refunded_dual_pricing_fee = CASE
        WHEN COALESCE(wr.refunded_amount, 0) > 0 AND COALESCE(wr.total_amount, 0) > 0
        THEN ROUND(
            ROUND(wr.total_amount * wr.pct / 100, 2)
            * wr.refunded_amount / wr.total_amount, 2)
        ELSE 0 END,
    tip_fee = 0,
    refunded_tip_fee = 0
FROM window_rows wr
WHERE op.id = wr.id;
