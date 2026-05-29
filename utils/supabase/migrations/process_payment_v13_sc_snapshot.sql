-- =====================================================================
-- Migration: process_payment_v13 — per-payment SC snapshot
-- =====================================================================
-- Wave D fork of v12 (v12 stays deployed; client switches the call site
-- via services/orderService.ts). One surgical addition: compute and
-- write order_payments.service_charge — this payment's share of
-- orders.service_charge at insert time. Basis for proportional SC
-- reversal in apply_refund_to_payment_v4.
--
-- Apportionment rules (mirror v12's v_payment_total / split-portion
-- conventions):
--
--   • Last split portion OR full-remaining (non-split) payment:
--     snap to v_remaining_sc so SUM(service_charge) across all payments
--     equals orders.service_charge exactly. Matches how v_payment_total
--     itself absorbs the rounding residual on the last portion.
--
--   • All other paths (item payment, mid-split portion, partial):
--     proportional to v_payment_total / total. Denominator is
--     orders.cash_total for cash-priced payments, orders.card_total
--     otherwise — orders.service_charge is folded into both totals, so
--     the share computed against the relevant pricing-mode total is the
--     payment's "owned" piece.
--
--   • Both proportional and snap branches LEAST-cap at v_remaining_sc.
--     A cap is a no-op for clean orders; guards against drift in
--     pathological cases (e.g. SC manually edited mid-payment-sequence).
--
-- Idempotency op string: 'process_payment_v13' (separate namespace from
-- v12, per the v9 → v10 precedent).
--
-- Apply AFTER:
--   - order_payments_add_service_charge_columns.sql
--   - process_payment_v12_sc_residual_guard.sql
--
-- Rollback: process_payment_v13_sc_snapshot_rollback.sql (drops v13;
-- client wrappers point back at v12).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_payment_v13(
    p_order_id uuid,
    p_payment_method text,
    p_amount numeric DEFAULT NULL,
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL,
    p_item_allocations jsonb DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_terminal_response jsonb DEFAULT NULL,
    p_split_count integer DEFAULT NULL,
    p_split_portion_index integer DEFAULT NULL,
    p_force_card_pricing boolean DEFAULT false,
    p_terminal_id uuid DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL,
    p_station_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb;
    v_result jsonb;
    v_cached_result jsonb;
    v_order record;
    v_payment_id uuid;
    v_is_cash boolean;
    v_is_item_payment boolean;
    v_is_split_payment boolean;
    v_payment_total numeric;
    v_new_sync_version integer;
    v_subtotal_portion numeric := 0;
    v_tax_portion numeric := 0;
    v_change_given numeric := 0;
    v_new_amount_paid numeric;
    v_new_amount_due numeric;
    v_new_cash_amount_due numeric;
    v_current_pricing_mode text;
    v_new_pricing_mode text;
    v_items_subtotal numeric := 0;
    v_items_tax numeric := 0;
    v_covered_items uuid[] := '{}';
    v_covered_items_json jsonb := '[]'::jsonb;
    v_unpaid_items_count integer := 0;
    v_unpaid_card_total numeric := 0;
    v_unpaid_cash_total numeric := 0;
    v_pre_unpaid_card_total numeric := 0;
    v_pre_unpaid_cash_total numeric := 0;
    v_effective_paid numeric := 0;
    v_payment_based_due numeric := 0;
    v_custom_refund_balance numeric := 0;
    v_total_cash_paid numeric := 0;
    v_total_card_paid numeric := 0;
    v_order_fully_paid boolean := false;
    v_split_card_portion numeric;
    v_split_cash_portion numeric;
    v_portions_paid integer := 0;
    v_portions_remaining integer := 0;
    v_paid_portion_indexes integer[];
    v_is_last_portion boolean := false;
    v_is_full_remaining boolean := false;
    v_target_unpaid numeric := 0;
    v_dejavoo_reference_id text;
    v_dejavoo_transaction_number text;
    v_dejavoo_auth_code text;
    v_dejavoo_batch_number text;
    v_dejavoo_invoice_number text;
    v_dejavoo_rrn text;
    v_dejavoo_entry_mode text;
    v_dejavoo_result_code text;
    v_dejavoo_status_code text;
    v_has_dejavoo_transaction boolean := false;
    v_dejavoo_last_four text;
    v_use_cash_pricing boolean;
    v_terminal_id uuid;
    v_dpp numeric;
    v_tsp numeric;
    v_dual_pricing_fee numeric := 0;
    v_tip_fee numeric := 0;
    v_cash_equivalent_subtotal_portion numeric := 0;
    v_items_cash_subtotal numeric := 0;
    v_acquirer text;
    v_batch_number text;
    v_sc_result jsonb;
    -- v13 additions: per-payment SC snapshot.
    v_prior_sc_snapshot numeric := 0;
    v_remaining_sc numeric := 0;
    v_service_charge_share numeric := 0;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'process_payment_v13');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    v_is_cash := p_payment_method = 'cash';
    v_use_cash_pricing := v_is_cash AND NOT COALESCE(p_force_card_pricing, false);
    v_is_item_payment := p_item_allocations IS NOT NULL AND jsonb_array_length(p_item_allocations) > 0;
    v_is_split_payment := p_split_count IS NOT NULL AND p_split_count > 1;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;

    v_sc_result := public.apply_service_charge_v1(
        p_order_id    => p_order_id,
        p_party_size  => NULL,
        p_idempotency_key => NULL,
        p_station_id  => p_station_id
    );

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    IF v_order.payment_status = 'paid' AND COALESCE(v_order.amount_due, 0) <= 0 THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;

    v_current_pricing_mode := v_order.payment_pricing_mode::text;

    SELECT
        COUNT(*),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_items_count, v_pre_unpaid_card_total, v_pre_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    SELECT COALESCE(SUM(
        COALESCE(original_amount, amount)
        - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)
    ), 0)
    INTO v_effective_paid
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;

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
        IF p_split_portion_index IS NULL THEN
            RAISE EXCEPTION 'Split portion index is required for split payments';
        END IF;
        IF p_split_portion_index < 1 OR p_split_portion_index > p_split_count THEN
            RAISE EXCEPTION 'Invalid split portion index: % (must be 1-%)', p_split_portion_index, p_split_count;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.order_payments
            WHERE order_id = p_order_id AND split_portion_index = p_split_portion_index AND status = 'captured'
        ) THEN
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
    ELSIF v_current_pricing_mode = 'card' AND v_use_cash_pricing THEN
        v_new_pricing_mode := 'mixed';
    ELSIF v_current_pricing_mode = 'cash' AND NOT v_use_cash_pricing THEN
        v_new_pricing_mode := 'mixed';
    ELSE
        v_new_pricing_mode := v_current_pricing_mode;
    END IF;

    IF v_is_item_payment THEN
        WITH payment_calc AS (
            SELECT oi.id, oi.item_name, oi.quantity AS original_qty, oi.unit_price, oi.cash_price, oi.tax_rate, oi.discount_amount,
                COALESCE(oi.paid_quantity, 0) AS already_paid_qty,
                COALESCE(oi.refunded_quantity, 0) AS refunded_qty,
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS effective_unpaid,
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paying,
                ROUND(COALESCE(oi.discount_amount, 0) * LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                )::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_discount,
                ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                )::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_cash_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
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
                LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS qty_paying,
                ROUND(COALESCE(oi.discount_amount, 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_discount,
                ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * LEAST(COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2) AS prorated_cash_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', pc.id,
            'item_name', pc.item_name,
            'quantity_paid', pc.qty_paying,
            'original_quantity', pc.original_qty,
            'unit_price', CASE WHEN v_is_cash THEN pc.cash_price ELSE pc.unit_price END,
            'tax_rate', COALESCE(pc.tax_rate, 0),
            'prorated_discount', CASE WHEN v_is_cash THEN pc.prorated_cash_discount ELSE pc.prorated_discount END,
            'subtotal', CASE WHEN v_is_cash THEN (pc.qty_paying * pc.cash_price) - pc.prorated_cash_discount ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount END
        )), '[]'::jsonb)
        INTO v_covered_items_json FROM payment_calc pc;

        UPDATE public.order_items oi
        SET paid_quantity = LEAST(oi.quantity, COALESCE(oi.paid_quantity, 0) + LEAST(
                COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))),
            refunded_quantity = GREATEST(COALESCE(oi.refunded_quantity, 0) - LEAST(
                COALESCE((alloc.value->>'quantity')::integer, COALESCE(oi.refunded_quantity, 0)),
                COALESCE(oi.refunded_quantity, 0)), 0),
            price_paid = CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
            updated_at = now()
        FROM jsonb_array_elements(p_item_allocations) AS alloc
        WHERE oi.id = (alloc.value->>'order_item_id')::uuid
          AND oi.order_id = p_order_id AND oi.is_voided = false;

    ELSIF v_is_split_payment THEN
        v_split_card_portion := ROUND(v_order.card_total / p_split_count, 2);
        v_split_cash_portion := ROUND(v_order.cash_total / p_split_count, 2);
        IF v_is_last_portion THEN
            IF v_is_cash THEN
                v_payment_total := v_order.cash_total - (v_split_cash_portion * (p_split_count - 1));
            ELSE
                v_payment_total := v_order.card_total - (v_split_card_portion * (p_split_count - 1));
            END IF;
            v_payment_total := GREATEST(v_payment_total, 0);
        ELSE
            IF v_is_cash THEN
                v_payment_total := v_split_cash_portion;
            ELSE
                v_payment_total := v_split_card_portion;
            END IF;
        END IF;
        IF v_is_cash AND v_order.cash_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
        ELSIF v_order.card_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
        END IF;
        v_tax_portion := v_payment_total - v_subtotal_portion;
        IF v_is_cash THEN
            v_cash_equivalent_subtotal_portion := v_subtotal_portion;
        ELSIF v_order.card_total > 0 THEN
            v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2);
        END IF;
    ELSE
        v_target_unpaid := CASE WHEN v_use_cash_pricing THEN v_pre_unpaid_cash_total ELSE v_pre_unpaid_card_total END;
        v_is_full_remaining := (p_amount IS NULL) OR (p_amount >= (v_target_unpaid - 0.05));
        IF v_is_full_remaining THEN
            v_payment_total := v_target_unpaid;
            IF v_use_cash_pricing AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            IF v_is_cash THEN
                v_cash_equivalent_subtotal_portion := v_subtotal_portion;
            ELSIF v_order.card_total > 0 THEN
                v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2);
            END IF;
            SELECT array_agg(id) INTO v_covered_items FROM public.order_items
            WHERE order_id = p_order_id AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_item_id', oi.id, 'item_name', oi.item_name,
                'quantity_paid', (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                'original_quantity', oi.quantity,
                'unit_price', CASE WHEN v_use_cash_pricing THEN oi.cash_price ELSE oi.unit_price END,
                'discount_amount', COALESCE(oi.discount_amount, 0),
                'tax_rate', COALESCE(oi.tax_rate, 0),
                'subtotal', (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * CASE WHEN v_use_cash_pricing THEN oi.cash_price ELSE oi.unit_price END
            )), '[]'::jsonb)
            INTO v_covered_items_json FROM public.order_items oi WHERE oi.id = ANY(v_covered_items);
            UPDATE public.order_items SET
                paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = CASE WHEN v_use_cash_pricing THEN cash_price ELSE unit_price END,
                updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
        ELSE
            v_payment_total := LEAST(p_amount, v_target_unpaid);
            v_payment_total := GREATEST(v_payment_total, 0);
            IF v_use_cash_pricing AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            IF v_is_cash THEN
                v_cash_equivalent_subtotal_portion := v_subtotal_portion;
            ELSIF v_order.card_total > 0 THEN
                v_cash_equivalent_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / NULLIF(v_order.card_total, 0)), 2);
            END IF;
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

    v_terminal_id := COALESCE(p_terminal_id,
        (p_terminal_response->'castles_transaction'->>'terminalId')::uuid,
        (p_terminal_response->'dejavoo_transaction'->>'terminalId')::uuid,
        (p_terminal_response->>'terminal_id')::uuid);

    SELECT COALESCE(dual_pricing_percentage, 0), COALESCE(tip_surcharge_percentage, 0)
    INTO v_dpp, v_tsp FROM public.locations WHERE id = v_order.location_id;

    IF v_is_cash THEN
        v_dual_pricing_fee := 0;
    ELSE
        v_dual_pricing_fee := GREATEST(0, ROUND(v_subtotal_portion - v_cash_equivalent_subtotal_portion, 2));
    END IF;

    IF v_is_cash OR v_tsp = 0 OR COALESCE(p_tip_amount, 0) <= 0 THEN
        v_tip_fee := 0;
    ELSE
        v_tip_fee := ROUND(p_tip_amount * v_tsp / (100 + v_tsp), 2);
    END IF;

    -- ====== v13: per-payment SC snapshot ======
    -- Remaining SC = order SC minus what prior captured payments already
    -- claimed. Snap to remaining on the last split portion or on a
    -- full-remaining payment so SUM(service_charge) over all payments
    -- equals orders.service_charge exactly. Otherwise apportion the
    -- payment's share against the relevant pricing-mode total
    -- (cash_total or card_total — SC is folded into both). LEAST-cap
    -- against v_remaining_sc in every branch as drift insurance.
    SELECT COALESCE(SUM(COALESCE(service_charge, 0)), 0)
    INTO v_prior_sc_snapshot
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;

    v_remaining_sc := GREATEST(COALESCE(v_order.service_charge, 0) - v_prior_sc_snapshot, 0);

    IF v_remaining_sc <= 0 THEN
        v_service_charge_share := 0;
    ELSIF (v_is_split_payment AND v_is_last_portion) OR v_is_full_remaining THEN
        v_service_charge_share := v_remaining_sc;
    ELSIF v_use_cash_pricing AND COALESCE(v_order.cash_total, 0) > 0 THEN
        v_service_charge_share := LEAST(
            v_remaining_sc,
            ROUND(v_payment_total * v_order.service_charge / v_order.cash_total, 2)
        );
    ELSIF COALESCE(v_order.card_total, 0) > 0 THEN
        v_service_charge_share := LEAST(
            v_remaining_sc,
            ROUND(v_payment_total * v_order.service_charge / v_order.card_total, 2)
        );
    ELSE
        v_service_charge_share := 0;
    END IF;

    INSERT INTO public.order_payments (
        order_id, payment_method, amount, tip_amount, total_amount,
        subtotal_portion, tax_portion, amount_tendered, change_given,
        is_cash_priced, cash_discount_applied, original_amount, covers_items,
        split_portion_index, split_count, status, terminal_type, processed_by_staff_id,
        processor_response, reference_number, transaction_id, authorization_code,
        dejavoo_response_code, dejavoo_batch_number, dejavoo_invoice_number,
        card_type, card_last_four, captured_at, initiated_at, merchant_id, location_id,
        rrn, result_code, result_message, terminal_id, idempotency_key,
        dual_pricing_fee, tip_fee, dual_pricing_percentage_snapshot, tip_surcharge_percentage_snapshot,
        acquirer, batch_number, service_charge
    ) VALUES (
        p_order_id, p_payment_method::payment_method, v_payment_total,
        COALESCE(p_tip_amount, 0), v_payment_total + COALESCE(p_tip_amount, 0),
        v_subtotal_portion, v_tax_portion,
        CASE WHEN v_is_cash THEN COALESCE(p_amount_tendered, v_payment_total) END,
        v_change_given, v_use_cash_pricing, v_use_cash_pricing,
        CASE WHEN v_use_cash_pricing THEN ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2) ELSE v_payment_total END,
        CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
        p_split_portion_index, p_split_count, 'captured',
        CASE WHEN v_is_cash THEN 'cash_drawer'
             WHEN p_terminal_response ? 'castles_transaction' THEN 'castles'
             ELSE 'dejavoo' END::terminal_type,
        p_staff_id, p_terminal_response,
        COALESCE(v_dejavoo_reference_id, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_auth_code, p_terminal_response->>'authorization_code'),
        v_dejavoo_status_code, v_dejavoo_batch_number, v_dejavoo_invoice_number,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'cardType',
                 p_terminal_response->'castles_transaction'->>'cardType',
                 p_terminal_response->>'card_type'),
        v_dejavoo_last_four, now(), now(), v_order.merchant_id, v_order.location_id,
        v_dejavoo_rrn, v_dejavoo_result_code,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'resultMessage',
                 p_terminal_response->'castles_transaction'->>'statusMessage'),
        v_terminal_id, p_idempotency_key::text,
        v_dual_pricing_fee, v_tip_fee, v_dpp, v_tsp, v_acquirer, v_batch_number,
        v_service_charge_share
    ) RETURNING id INTO v_payment_id;

    PERFORM log_payment_event(
        p_payment_id := v_payment_id, p_order_id := p_order_id,
        p_location_id := v_order.location_id, p_event_type := 'captured',
        p_amount := v_payment_total, p_tip_amount := COALESCE(p_tip_amount, 0),
        p_previous_status := NULL, p_new_status := 'captured',
        p_psp_reference := COALESCE(v_dejavoo_reference_id, v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        p_auth_code := v_dejavoo_auth_code, p_staff_id := p_staff_id,
        p_terminal_id := COALESCE(p_terminal_response->'castles_transaction'->>'terminalId',
                                   p_terminal_response->'dejavoo_transaction'->>'terminalId',
                                   p_terminal_response->>'terminal_id'),
        p_result_code := COALESCE(v_dejavoo_result_code, '00'),
        p_response_message := CASE WHEN v_is_cash THEN 'Cash payment captured'
            ELSE COALESCE(p_terminal_response->'dejavoo_transaction'->>'resultMessage',
                          p_terminal_response->'castles_transaction'->>'statusMessage',
                          'Card payment captured successfully') END,
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
        SELECT v_payment_id, (ci->>'order_item_id')::uuid, (ci->>'quantity_paid')::integer,
            (ci->>'unit_price')::numeric,
            (ci->>'quantity_paid')::integer * (ci->>'unit_price')::numeric
                - ROUND(COALESCE((ci->>'discount_amount')::numeric, 0) * (ci->>'quantity_paid')::integer / NULLIF((ci->>'original_quantity')::integer, 0), 2),
            ROUND(((ci->>'quantity_paid')::integer * (ci->>'unit_price')::numeric
                - ROUND(COALESCE((ci->>'discount_amount')::numeric, 0) * (ci->>'quantity_paid')::integer / NULLIF((ci->>'original_quantity')::integer, 0), 2))
                * COALESCE((ci->>'tax_rate')::numeric, 0) / 100, 2)
        FROM jsonb_array_elements(v_covered_items_json) AS ci;
    END IF;

    IF v_use_cash_pricing THEN
        v_total_cash_paid := v_total_cash_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    ELSE
        v_total_card_paid := v_total_card_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    END IF;
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    SELECT COUNT(*),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(ROUND(COALESCE(oi.discount_amount, 0) * COALESCE(oi.cash_price, oi.unit_price) / NULLIF(oi.unit_price, 0), 2), 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_items_count, v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    SELECT COALESCE(SUM(COALESCE(original_amount, amount) - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)), 0)
    INTO v_effective_paid FROM public.order_payments
    WHERE order_id = p_order_id AND status IN ('captured', 'partially_refunded', 'refunded') AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;

    IF v_payment_based_due < v_unpaid_card_total THEN
        IF v_unpaid_card_total > 0 THEN
            v_unpaid_cash_total := ROUND(v_unpaid_cash_total * v_payment_based_due / v_unpaid_card_total, 2);
        END IF;
        v_unpaid_card_total := v_payment_based_due;
    END IF;

    -- ====== SC RESIDUAL GUARD — fully-paid determination (verbatim from v12) ======
    IF v_is_item_payment THEN
        IF v_unpaid_items_count > 0 THEN
            v_order_fully_paid := false;
        ELSE
            IF v_use_cash_pricing THEN
                v_order_fully_paid := (v_total_cash_paid + 0.02) >= COALESCE(v_order.cash_total, 0);
            ELSE
                v_order_fully_paid := (v_total_card_paid + 0.02) >= COALESCE(v_order.card_total, 0);
            END IF;
        END IF;
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
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = COALESCE(price_paid, unit_price), updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            v_unpaid_items_count := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
        END IF;
    ELSE
        IF NOT v_order_fully_paid AND NOT v_is_item_payment THEN
            v_order_fully_paid := (v_unpaid_items_count = 0);
        END IF;
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = COALESCE(price_paid, CASE WHEN v_use_cash_pricing THEN cash_price ELSE unit_price END),
                updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            v_unpaid_items_count := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
        END IF;
    END IF;

    -- ====== SC RESIDUAL GUARD — amount_due computation (verbatim from v12) ======
    IF v_order_fully_paid THEN
        v_new_amount_due := 0; v_new_cash_amount_due := 0;
        v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
    ELSIF v_is_item_payment AND v_unpaid_items_count = 0 THEN
        v_new_amount_due := GREATEST(
            v_order.card_total - v_total_card_paid
            - CASE WHEN COALESCE(v_order.cash_total, 0) > 0
                   THEN ROUND(v_total_cash_paid * v_order.card_total / v_order.cash_total, 2)
                   ELSE 0 END,
            0);
        v_new_cash_amount_due := GREATEST(
            v_order.cash_total - v_total_cash_paid
            - CASE WHEN COALESCE(v_order.card_total, 0) > 0
                   THEN ROUND(v_total_card_paid * v_order.cash_total / v_order.card_total, 2)
                   ELSE 0 END,
            0);
    ELSE
        v_new_amount_due := v_unpaid_card_total;
        v_new_cash_amount_due := v_unpaid_cash_total;
    END IF;

    UPDATE public.orders SET
        amount_paid = v_new_amount_paid, amount_due = v_new_amount_due, cash_amount_due = v_new_cash_amount_due,
        tip_amount = COALESCE(tip_amount, 0) + COALESCE(p_tip_amount, 0),
        payment_pricing_mode = v_new_pricing_mode::pricing_mode,
        cash_discount_applied = COALESCE(cash_discount_applied, false) OR v_use_cash_pricing,
        payment_status = CASE WHEN v_order_fully_paid THEN 'paid'::payment_status
                              WHEN v_new_amount_paid > 0 THEN 'partial'::payment_status
                              ELSE 'pending'::payment_status END,
        updated_at = now()
    WHERE id = p_order_id;

    v_new_sync_version := increment_order_sync_version(p_order_id);

    v_result := jsonb_build_object(
        'success', true, 'payment_id', v_payment_id, 'payment_method', p_payment_method,
        'amount_charged', v_payment_total, 'tip_amount', COALESCE(p_tip_amount, 0),
        'total_collected', v_payment_total + COALESCE(p_tip_amount, 0),
        'change_given', v_change_given, 'is_cash_priced', v_use_cash_pricing,
        'pricing_mode', v_new_pricing_mode,
        'is_item_payment', v_is_item_payment, 'is_split_payment', v_is_split_payment,
        'is_full_remaining', v_is_full_remaining,
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
        'acquirer', v_acquirer, 'batch_number', v_batch_number,
        'service_charge_applied', v_sc_result,
        'service_charge_snapshot', v_service_charge_share
    );

    IF p_idempotency_key IS NOT NULL THEN
        v_cached_result := v_result;
        IF jsonb_typeof(v_result->'items_covered') = 'array'
           AND jsonb_array_length(v_result->'items_covered') > 100 THEN
            v_cached_result := v_cached_result - 'items_covered' - 'items_paid';
        END IF;
        PERFORM public._idempotency_complete(p_idempotency_key, 'process_payment_v13', v_cached_result);
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_payment_v13(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb, integer, integer, boolean, uuid, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.process_payment_v13 IS
  'Wave D fork of process_payment_v12. Adds per-payment service_charge snapshot: proportional to v_payment_total / (cash_total or card_total per pricing mode), LEAST-clamped to remaining SC, snapped to remaining on last split portion / full-remaining payment. SUM(service_charge) across all payments equals orders.service_charge. Basis for proportional SC reversal in apply_refund_to_payment_v4. Idempotency op: ''process_payment_v13''.';
