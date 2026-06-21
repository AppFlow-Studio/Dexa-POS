-- =====================================================================
-- Migration: process_payment_v16 — tiny-total split fully-paid fix (P0005)
-- =====================================================================
-- Forks the 2026-06-16 v15 body (item-payment balance fallback). The ONLY
-- behavioural change is the SPLIT-payment fully-paid test:
--
--   v15: v_order_fully_paid := (v_portions_remaining = 0)
--            OR (v_payment_based_due <= 0.02 AND v_cash_based_due <= 0.02);
--   v16: v_order_fully_paid := (v_portions_remaining = 0);
--
-- Why: on a tiny order (e.g. a $0.02 custom item split 2 ways) the remaining
-- balance after the FIRST $0.01 portion is $0.01, which satisfied the v15
-- `<= 0.02` dust fallback and flipped the order to `paid` with amount_paid=$0.01
-- while the second portion was still owed. enforce_order_math then rejected the
-- write (P0005: payment_status=paid but amount_paid=0.01). The dust fallback was
-- only meant for a split closed by a NON-split pay-full-remaining payment, which
-- is handled by the ELSE branch (still `<= 0.02`); inside the split branch the
-- current payment is itself a portion, so portions_remaining = 0 is the only
-- correct signal. The item and else branches are unchanged.
--
-- Idempotency op bumped to 'process_payment_v16'. All other math is verbatim
-- from the 2026-06-16 v15 body.
--
-- 2026-06-21 amendment (P0005, tiny-total split amount_due=0):
--   Symptom: a 10¢ custom item split 2 ways, first 5¢ portion paid CASH, left
--   amount_due=0 in the DB while a real card portion was still owed — so the
--   2nd half could never be collected. payment_status correctly stayed
--   'partial' (the split-branch fully-paid fix above is sound), but amount_due
--   was wrong.
--   Root cause: the original_amount "this payment closes the order" override
--   (and the SC residual-snap branch) include a fuzzy `v_remaining_after_payment
--   <= 0.05` threshold. On a tiny split the first portion's cash→card rounding
--   (5¢ cash → ~6¢ card-equiv) already drops the remaining card balance below
--   5¢, so the first (non-last) portion grabbed the ENTIRE pre-INSERT card
--   balance as its original_amount. effective_paid then summed to card_total and
--   amount_due flipped to 0.
--   Fix: guard the `<= 0.05` threshold in BOTH the original_amount override and
--   the SC residual-snap branch with `AND NOT (v_is_split_payment AND NOT
--   v_is_last_portion)`. The explicit last-portion / full-remaining /
--   closes-with-items signals still cover every legitimate split close.
--
-- Original v15 header follows.
-- ---------------------------------------------------------------------
-- Forks v14 with two corrections:
--   1. A closing item payment settles the canonical remaining card/cash
--      balance instead of trusting a potentially stale client p_amount.
--   2. Non-item payments are not marked paid solely because all item
--      quantities are covered; order-level residuals must also be settled.
--
-- v13 snaps service_charge_share to v_remaining_sc only when:
--   • v_is_split_payment AND v_is_last_portion (explicit even-split)
--   • v_is_full_remaining (single-payment full-remaining branch)
--
-- v14 adds a third snap trigger:
--   • v_remaining_after_payment <= 0.05  — this payment closes the
--     order's remaining balance, regardless of split type
--
-- Why: split-by-item and split-by-custom-amount payments do NOT set
-- split_count / split_portion_index (see usePaymentStore.ts ~969–987).
-- They fall into v13's proportional branch with v_payment_total =
-- items+tax (no SC component in the denominator), so
-- SUM(service_charge) across N item-payments under-collects
-- orders.service_charge. The Wave D review surfaced this as Issue #2.
--
-- The new branch detects "this payment empties the order" by comparing
-- v_payment_based_due (loaded pre-INSERT at line ~196) against the
-- card-equivalent of v_payment_total. When remaining ≤ ~5¢, allocate
-- all leftover SC to this payment — the same invariant the existing
-- snap branches enforce.
--
-- All other math is verbatim from v13. Idempotency op string is bumped
-- to 'process_payment_v16'.
--
-- 2026-06-02 amendment (ORD-S1-0040, all-cash split-by-item):
--   amount_due stayed at $0.72 while cash_amount_due correctly hit $0 and
--   every item read PAID CASH. Root cause: order_payments.original_amount is
--   the card-equivalent that v_effective_paid sums to drive card-side
--   amount_due, but for cash payments it was scaled per-payment via
--   ROUND(amount * card_total/cash_total). N independent roundings of a ~1.84×
--   ratio don't sum back to card_total, leaving accumulated drift stranded on
--   amount_due forever (the order never reads card-fully-paid). Fix: the
--   closing payment now records original_amount = the exact remaining card
--   balance (v_payment_based_due), so SUM(original_amount) == card_total to the
--   cent. New variable v_payment_original_amount; INSERT no longer inlines the
--   per-payment scaling. Function signature and idempotency op unchanged
--   (settled payments are untouched; only new payments get the corrected math).
--
-- 2026-06-03 amendment (reopen / split hardening, ORD-S2-0010 & S2-0020):
--   • Even-split portions now divide the REMAINING balance (v_payment_based_due
--     / v_cash_based_due) and honor the client p_amount, so a reopened re-split
--     no longer re-bills paid portions (paid $10, reopen +$10, split $20 -> $30).
--   • Custom-amount (non-split) full-remaining detection & settled amount use the
--     canonical pricing-mode balance instead of the item-derived total, which
--     understated the SC's cash-equivalent and stranded $0.68 cash_amount_due.
--   • Fix #1: amount_paid is SUM(order_payments.amount) net of refunds — the
--     actual money collected in each payment's own currency (a $15 cash payment
--     shows $15 paid, not the $26.98 card-equivalent), not the meaningless
--     v_total_cash_paid + v_total_card_paid mixed sum. Paid/due decisions use the
--     canonical per-mode balances (Fixes #2/#3), so this field is display-only.
--   • Fix #2: a split is fully paid when all portions are captured OR the actual
--     balance is settled (split finished by a non-split full-remaining payment).
--   • Fix #3: fully-paid and amount_due use the canonical per-mode outstanding
--     (v_payment_based_due / v_cash_based_due) for pure-cash, pure-card AND mixed
--     orders; removed the single-mode comparisons and the cross-ratio amount_due
--     special case that drifted on mixed tenders.
--   • Fix #4: reject payments against void/cancelled/refunded orders.
--
-- 2026-06-16 amendment (ORD-S2-0001, mixed card+cash split-by-item reopen):
--   In-place CREATE OR REPLACE of process_payment_v16 (SAME name + 14-arg
--   signature, idempotency op still 'process_payment_v16'). Body is byte-identical
--   to the 2026-06-03 version except the one-line fix in the v_is_item_payment
--   fully-paid branch below.
--   Symptom: a fully-collected mixed pay-for-items order stayed 'partial' with a
--   ~1¢ cash residual on reopen. Root cause: the v_is_item_payment fully-paid
--   branch decided solely on v_unpaid_items_count and lacked the balance-settled
--   fallback the split branch (Fix #2) and the else branch (Fix #3) already carry.
--   A mixed dual-price allocation can leave one unit paid_quantity < quantity even
--   after every dollar is collected, so the branch returned false → status stuck
--   'partial', the force-mark block was skipped, and cash_amount_due kept the
--   residual. Fix: fully paid when ALL item qty is covered OR both canonical
--   card/cash balances are settled (same predicate as the split/else branches).
--   The force-mark block then zeroes the stray quantities and residuals.
--
-- Apply AFTER:
--   - 20260603194300_process_payment_v16_closing_item_balance.sql
--
-- Rollback: 20260616120000_process_payment_v16_item_payment_balance_fallback_rollback.sql
--   (CREATE OR REPLACEs v15 back to the 2026-06-03 body).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.process_payment_v16(
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
    v_effective_cash_paid numeric := 0;
    v_payment_based_due numeric := 0;
    v_cash_based_due numeric := 0;
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
    -- v13 carryover: per-payment SC snapshot.
    v_prior_sc_snapshot numeric := 0;
    v_remaining_sc numeric := 0;
    v_service_charge_share numeric := 0;
    -- v14 addition: card-equivalent of this payment + outstanding after it
    -- (used to detect "this payment closes the order" for split-by-item /
    -- custom-amount flows that don't pass split_count / full-remaining).
    v_payment_card_equiv numeric := 0;
    v_remaining_after_payment numeric := 0;
    -- For item payments, v_payment_total = items+tax only (SC is added
    -- to the payment row separately as v_service_charge_share). So
    -- v_remaining_after_payment for the last item payment still reads
    -- as ≈ SC residual, not zero. We separately recount unpaid items
    -- here to detect "this item payment cleared the last items".
    v_unpaid_items_after_payment integer := 0;
    v_closes_with_items boolean := false;
    -- 2026-06-02 fix: card-equivalent recorded as order_payments.original_amount.
    -- v_effective_paid (which drives card-side amount_due) sums this column.
    -- Per-payment cash→card scaling rounds independently, so SUM(original_amount)
    -- across N cash item-payments drifts off card_total by a few cents — that
    -- drift stranded $0.72 on amount_due for ORD-S1-0040 even though cash_amount_due
    -- correctly hit $0. The closing payment now records the exact remaining card
    -- balance so the column sums to card_total to the cent.
    v_payment_original_amount numeric := 0;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'process_payment_v16');
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

    -- Fix #4: never accept a payment against a terminally-closed order. A
    -- void/cancelled/refunded order has no collectable balance; letting a
    -- payment through (e.g. a stale offline-queue retry after a void) would
    -- create an orphaned captured payment the order can never reconcile.
    IF v_order.status IN ('void', 'cancelled', 'refunded') THEN
        RAISE EXCEPTION 'Cannot take payment on a % order', v_order.status;
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

    v_cash_based_due := GREATEST(v_order.cash_total - v_effective_cash_paid, 0);
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

        -- 2026-05-30 (S6-0010 follow-up): trust the client-provided p_amount
        -- so the recorded payment matches the cash drawer total exactly.
        -- Client (PayForItemsView.tsx ~line 410, usePaymentStore.ts ~line 838)
        -- distributes SC + tax-on-SC via items-ratio, preserving cash ≤ card
        -- per-item; v14's previous payment-fraction formula produced a slightly
        -- different value (Mocha cash: $7.75 client vs $7.82 server). Clamp
        -- to remaining outstanding for defence, and floor at items+tax so a
        -- buggy/missing p_amount can't undercharge.
        IF p_amount IS NOT NULL AND p_amount > 0 THEN
            v_payment_total := LEAST(
                p_amount,
                CASE WHEN v_use_cash_pricing
                     THEN v_pre_unpaid_cash_total
                     ELSE v_pre_unpaid_card_total
                END
            );
            v_payment_total := GREATEST(v_payment_total, v_items_subtotal + v_items_tax);
        ELSE
            v_payment_total := v_items_subtotal + v_items_tax;
        END IF;
        v_subtotal_portion := v_items_subtotal;
        v_tax_portion := v_payment_total - v_subtotal_portion;
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
        -- Even splits divide the REMAINING balance, not the full order total.
        -- The client (SplitEvenlyView.tsx) already computes each portion from
        -- activeOrderOutstanding* (remaining after prior payments), so on a
        -- reopened check it sends the correct per-person amount. Dividing
        -- card_total/cash_total here ignored that and re-billed already-paid
        -- portions, stacking amount_paid (paid $10, reopen +$10, 2-way split of
        -- $20 -> +$20 -> $30). We honor the client's p_amount, clamped to the
        -- remaining balance, and settle the exact remaining balance on the last
        -- portion so rounding can't strand or overshoot a residual.
        v_split_card_portion := ROUND(v_payment_based_due / p_split_count, 2);
        v_split_cash_portion := ROUND(v_cash_based_due / p_split_count, 2);
        IF v_is_last_portion THEN
            -- Last portion settles whatever balance remains, regardless of p_amount.
            IF v_use_cash_pricing THEN
                v_payment_total := v_cash_based_due;
            ELSE
                v_payment_total := v_payment_based_due;
            END IF;
            v_payment_total := GREATEST(v_payment_total, 0);
        ELSIF p_amount IS NOT NULL AND p_amount > 0 THEN
            -- Trust the client's per-person amount, but never let a portion
            -- exceed the remaining balance.
            v_payment_total := LEAST(
                p_amount,
                CASE WHEN v_use_cash_pricing THEN v_cash_based_due ELSE v_payment_based_due END
            );
            v_payment_total := GREATEST(v_payment_total, 0);
        ELSE
            -- Legacy fallback: no client amount, divide remaining balance evenly.
            IF v_use_cash_pricing THEN
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
        -- Item-derived unpaid total (v_pre_unpaid_*) can understate the true
        -- balance when an order-level service charge isn't fully reflected in
        -- per-item cash totals (the cash-equivalent of the card-priced SC is
        -- only patched in card terms via v_custom_refund_balance). On a custom-
        -- amount split that understatement stranded $0.68 of SC as cash_amount_due
        -- (ORD-S2-0020). Use the canonical pricing-mode balance for both the
        -- full-remaining detection and the settled amount so a closing custom
        -- payment collects the whole remaining balance.
        v_target_unpaid := CASE WHEN v_use_cash_pricing THEN v_cash_based_due ELSE v_payment_based_due END;
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

    -- NOTE: v_change_given is computed below, AFTER the SC apportionment
    -- block, because v14 bakes v_service_charge_share into v_payment_total
    -- for item payments and the change calculation must reflect the
    -- post-bake amount.

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

    -- ====== v14: per-payment SC snapshot with residual-snap branch ======
    -- Remaining SC = order SC minus what prior captured payments already
    -- claimed. v13 snapped on explicit last-split / full-remaining hints.
    -- v14 adds a third trigger: when this payment closes the order's
    -- outstanding balance (split-by-item, custom-amount that lands on
    -- zero, partial-then-finish). All snap branches LEAST-cap against
    -- v_remaining_sc as drift insurance.
    SELECT COALESCE(SUM(COALESCE(service_charge, 0)), 0)
    INTO v_prior_sc_snapshot
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;

    v_remaining_sc := GREATEST(COALESCE(v_order.service_charge, 0) - v_prior_sc_snapshot, 0);

    -- Card-equivalent of this payment, against the same denominator
    -- (v_order.card_total) that drives v_payment_based_due. Cash-priced
    -- payments translate up by the dual-pricing ratio; card payments
    -- pass through.
    IF v_use_cash_pricing AND COALESCE(v_order.cash_total, 0) > 0 THEN
        v_payment_card_equiv := ROUND(v_payment_total * v_order.card_total / v_order.cash_total, 2);
    ELSE
        v_payment_card_equiv := v_payment_total;
    END IF;

    -- v_payment_based_due was loaded BEFORE this payment was applied; the
    -- delta is the outstanding-after-this-payment in card-equivalent terms.
    v_remaining_after_payment := GREATEST(v_payment_based_due - v_payment_card_equiv, 0);

    -- For item payments, the items UPDATE on order_items has already
    -- happened above (the v_is_item_payment branch). Recount unpaid
    -- items now so we can detect "this item payment cleared the last
    -- items" — that case won't trip the residual-after check because
    -- v_payment_total excludes SC for item payments (it's items+tax
    -- only; SC rides alongside as v_service_charge_share).
    IF v_is_item_payment THEN
        SELECT COUNT(*)
        INTO v_unpaid_items_after_payment
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
          AND oi.is_voided = false
          AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;
        v_closes_with_items := (v_unpaid_items_after_payment = 0);
    END IF;

    IF v_remaining_sc <= 0 THEN
        v_service_charge_share := 0;
    ELSIF (v_is_split_payment AND v_is_last_portion)
       OR v_is_full_remaining
       OR (v_remaining_after_payment <= 0.05 AND NOT (v_is_split_payment AND NOT v_is_last_portion))
       OR v_closes_with_items THEN
        -- Closes the order — allocate all leftover SC here. The fuzzy `<= 0.05`
        -- threshold is guarded against a non-last split portion for the same
        -- tiny-total reason as the original_amount override below (P0005):
        -- otherwise the first portion of a tiny split would swallow the whole
        -- remaining service charge and strand the rest of the split.
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

    -- ====== v15: settle closing item payment; otherwise preserve v14 bake ======
    -- v13's item-payment branch set v_payment_total = items+tax only, leaving
    -- v_service_charge_share to ride alongside on the order_payments row.
    -- That made change_given (and total_amount) reflect items+tax only, so
    -- the cashier physically under-collected the SC: a $5 bill against a
    -- $3.71 ticket gave $2.28 change (= $5 − items+tax) instead of $1.29
    -- (= $5 − items+tax+SC). The SC then sat as cash_amount_due residual
    -- forever (Latte S6-0015, Black Coffee S6-0011 on staging 2026-05-29).
    --
    -- Non-item paths (split-by-portion, full-remaining single) already
    -- include SC in v_payment_total via custom_refund_balance, so adding
    -- here would double-count. Item-payment path is the only one that
    -- needs this correction.
    IF v_is_item_payment AND v_closes_with_items THEN
        -- The closing item payment must settle the canonical balance, not a
        -- stale client preview. Item allocation sums omit order-level charges
        -- such as SC tax, so trusting p_amount can silently under-collect.
        v_payment_total := CASE
            WHEN v_use_cash_pricing THEN v_cash_based_due
            ELSE v_payment_based_due
        END;
        v_tax_portion := v_payment_total - v_subtotal_portion;
    ELSIF v_is_item_payment AND v_service_charge_share > 0 THEN
        IF p_amount IS NOT NULL AND p_amount > 0 THEN
            -- 2026-05-30 trust-p_amount path: v_payment_total already equals
            -- the client's items+tax+SC slice. Don't bake in again. Re-derive
            -- v_service_charge_share from the delta so op.service_charge
            -- records the client's items-ratio slice (rather than v14's
            -- payment-fraction slice). LEAST clamp against v_remaining_sc as
            -- drift insurance against an over-allocating client.
            v_service_charge_share := LEAST(
                v_remaining_sc,
                GREATEST(v_payment_total - (v_items_subtotal + v_items_tax), 0)
            );
        ELSE
            -- Legacy / null-p_amount path: server-side bake-in (v14 original).
            v_payment_total := v_payment_total + v_service_charge_share;
            -- tax_portion absorbs SC (matches non-item branch convention where
            -- v_tax_portion = v_payment_total − v_subtotal_portion lumps SC in).
            v_tax_portion := v_tax_portion + v_service_charge_share;
        END IF;
    END IF;

    -- Compute change_given AFTER the SC bake-in so cash payments reflect
    -- what the customer actually owes (items+tax+SC+tip).
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total)
            - (v_payment_total + COALESCE(p_tip_amount, 0)),
            0
        );
    END IF;

    -- ====== original_amount (card-equivalent) — drift-free on the closer ======
    -- order_payments.original_amount is the card-equivalent of this payment;
    -- v_effective_paid sums it to derive card-side amount_due. For card-priced
    -- payments it equals v_payment_total. For cash-priced payments it scales up
    -- by card_total/cash_total — but rounding each payment independently means
    -- the column doesn't sum back to card_total. The closing payment absorbs the
    -- whole remaining card balance: v_payment_based_due here still holds the
    -- pre-INSERT value (card_total − SUM(prior original_amount)), i.e. exactly
    -- the gap to card_total, so after this row SUM(original_amount) == card_total.
    IF NOT v_use_cash_pricing THEN
        v_payment_original_amount := v_payment_total;
    ELSIF v_closes_with_items OR v_is_full_remaining
          OR (v_is_split_payment AND v_is_last_portion)
          OR (v_remaining_after_payment <= 0.05 AND NOT (v_is_split_payment AND NOT v_is_last_portion)) THEN
        -- This payment closes the order. Record the exact remaining card balance
        -- so the per-payment cash→card rounding drift cannot strand a residual
        -- on amount_due (ORD-S1-0040: $0.72 phantom balance).
        --
        -- v16 tiny-total guard (P0005): the fuzzy `<= 0.05` "closes the order"
        -- threshold must NOT fire for a non-last split portion. On a tiny order
        -- (10¢ custom item split 2 ways, first 5¢ portion) the cash→card
        -- rounding of the first portion (5¢ cash → 6¢ card-equiv) already drops
        -- the remaining card balance to 4¢ <= 0.05, so this branch grabbed the
        -- ENTIRE pre-INSERT card balance (10¢) as original_amount. effective_paid
        -- then summed to card_total and amount_due flipped to 0 while the 2nd
        -- portion was still owed — the order showed nothing due and the card half
        -- could never be collected. The explicit last-portion / full-remaining /
        -- closes-with-items signals already cover every legitimate "this payment
        -- closes the order" case for a split; the fuzzy threshold is only safe
        -- for non-split flows here.
        v_payment_original_amount := GREATEST(v_payment_based_due, 0);
    ELSIF COALESCE(v_order.cash_total, 0) > 0 THEN
        v_payment_original_amount := ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2);
    ELSE
        v_payment_original_amount := v_payment_total;
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
        v_payment_original_amount,
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

    -- v_total_cash_paid / v_total_card_paid are per-pricing-mode running tallies
    -- kept only for the result-JSON telemetry (total_cash_paid / total_card_paid).
    -- No fully-paid or amount_due decision reads them anymore (Fix #1/#3).
    -- amount_paid is instead recomputed below as SUM(order_payments.amount) net
    -- of refunds — the actual money collected in each payment's own currency.
    IF v_use_cash_pricing THEN
        v_total_cash_paid := v_total_cash_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    ELSE
        v_total_card_paid := v_total_card_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    END IF;

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

    -- Fix #1: amount_paid is the actual money collected = SUM(order_payments.amount)
    -- net of refunds. `amount` is each payment's tendered principal IN ITS OWN
    -- currency (cash dollars for a cash-priced payment, card dollars for card),
    -- so a $15 cash payment shows $15 paid — NOT the $26.98 card-equivalent.
    -- (Using v_effective_paid / original_amount here was wrong: that's the
    -- card-equivalent basis used only for amount_due math.) The old
    -- v_total_cash_paid + v_total_card_paid running tally was also unfit because
    -- it folded tips in; amount_paid is principal only (orders.tip_amount tracks
    -- tips separately and is incremented below). All paid/due *decisions* use the
    -- canonical per-mode balances (Fixes #2/#3), so this field is display-only.
    SELECT COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0)
    INTO v_new_amount_paid
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;
    v_new_amount_paid := ROUND(v_new_amount_paid, 2);

    -- 2026-05-30 (S6-0010 Mocha repro): cash-side equivalent of effective_paid.
    -- Cash payments contribute their amount directly (cash terms post-v14
    -- bake-in); card payments scale to cash-equivalent via the order's
    -- cash:card ratio. Used to derive cash_amount_due in its own pricing
    -- mode so the SC residual isn't stripped by a card-side ratio clamp.
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
    INTO v_effective_cash_paid FROM public.order_payments
    WHERE order_id = p_order_id AND status IN ('captured', 'partially_refunded', 'refunded') AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_cash_based_due    := GREATEST(v_order.cash_total - v_effective_cash_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

    -- Replaces the old card-ratio clamp. Each pricing mode now derives its
    -- outstanding directly from `<mode>_total − <mode>_effective_paid`, which
    -- preserves the SC residual implicitly on both sides (the order totals
    -- already include SC and per-payment SC slices are reflected via
    -- op.amount / op.original_amount). The S6-0010 cash_amount_due bug
    -- ($4.99 instead of $7.44) was the card-ratio scaling stripping the
    -- residual from the cash side when items-derived totals exceeded
    -- payment_based_due.
    v_unpaid_card_total := v_payment_based_due;
    v_unpaid_cash_total := v_cash_based_due;

    -- ====== fully-paid determination ======
    -- Fix #3: the canonical, pricing-mode-agnostic test is "both the card and
    -- cash outstanding balances are settled". v_payment_based_due /
    -- v_cash_based_due are derived drift-free from <mode>_total − effective_paid
    -- (in their own units), so this holds for pure-cash, pure-card AND mixed
    -- orders. The old single-mode comparisons (v_total_cash_paid vs cash_total
    -- with v_total_card_paid = 0, etc.) silently failed on any mixed-tender
    -- order and the mixed catch-all leaned on the now-removed mixed-currency
    -- v_new_amount_paid sum.
    IF v_is_item_payment THEN
        -- Fix (ORD-S2-0001): fully paid when ALL item qty is covered OR both
        -- canonical card/cash balances are settled. A mixed dual-price allocation
        -- can leave a unit unmarked even after every dollar is collected; without
        -- this the order stays 'partial' with a ~1¢ cash residual. Mirrors the
        -- split branch (Fix #2) and else branch (Fix #3) fallback below. The
        -- force-mark block then zeroes the stray quantities and residuals.
        v_order_fully_paid := (v_unpaid_items_count = 0)
            OR (v_payment_based_due <= 0.02 AND v_cash_based_due <= 0.02);
    ELSIF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid FROM public.order_payments
        WHERE order_id = p_order_id AND split_portion_index IS NOT NULL AND split_count = p_split_count AND status = 'captured';
        v_portions_remaining := p_split_count - v_portions_paid;
        -- v16 fix (tiny-total split, P0005): the split is fully paid ONLY when
        -- every portion is captured. v15 OR'd in a `balance <= 0.02` dust
        -- fallback here, but on a tiny order (a $0.02 custom item split 2 ways)
        -- the balance remaining AFTER the first $0.01 portion is itself
        -- $0.01 <= 0.02 — so the order flipped to `paid` with amount_paid=$0.01
        -- while a real portion was still owed, and enforce_order_math rejected
        -- it (payment_status=paid but amount_paid<total).
        --
        -- The v15 fallback's stated purpose — "split finished by a non-split
        -- pay-full-remaining payment, portions_remaining > 0 but nothing owed"
        -- — cannot apply inside THIS branch: a pay-full-remaining payment is not
        -- a split payment (p_split_count IS NULL), so it lands in the ELSE branch
        -- below, which keeps the dust fallback. Here the current payment IS a
        -- split portion, so portions_remaining = 0 is the only correct signal
        -- and the dust tolerance could only ever mask a genuine unpaid portion.
        v_order_fully_paid := (v_portions_remaining = 0);
    ELSE
        v_order_fully_paid :=
            (v_payment_based_due <= 0.02 AND v_cash_based_due <= 0.02);
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
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items SET paid_quantity = quantity, refunded_quantity = 0, refunded_amount = 0,
                price_paid = COALESCE(price_paid, CASE WHEN v_use_cash_pricing THEN cash_price ELSE unit_price END),
                updated_at = now()
            WHERE order_id = p_order_id AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            v_unpaid_items_count := 0; v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
        END IF;
    END IF;

    -- ====== amount_due computation ======
    -- Fix #3 (cont.): every non-fully-paid branch now reads the canonical
    -- per-mode outstanding (v_unpaid_card_total / v_unpaid_cash_total, set
    -- above to v_payment_based_due / v_cash_based_due). The former
    -- item-payment-specific branch recomputed amount_due from the mixed
    -- v_total_card_paid / v_total_cash_paid with cross-mode ratio scaling —
    -- the same independent-rounding drift that stranded residuals
    -- (S6-0010 / ORD-S1-0040). The canonical values are drift-free and already
    -- preserve the SC residual on both sides, so the special case is removed.
    IF v_order_fully_paid THEN
        v_new_amount_due := 0; v_new_cash_amount_due := 0;
        v_unpaid_card_total := 0; v_unpaid_cash_total := 0;
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
        PERFORM public._idempotency_complete(p_idempotency_key, 'process_payment_v16', v_cached_result);
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_payment_v16(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb, integer, integer, boolean, uuid, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.process_payment_v16 IS
  'Fork of process_payment_v14. A closing item payment settles the canonical pricing-mode balance instead of trusting a stale client p_amount, covering SC tax and other order-level residuals. Non-item payments no longer become paid solely because item quantities are covered. 2026-06-16 (ORD-S2-0001): item payments are also fully paid when both canonical card/cash balances are settled, even if a mixed dual-price allocation left a unit unmarked. 2026-06-20 (v16, P0005): split payments are fully paid ONLY when all portions are captured (dropped the split-branch `balance <= 0.02` dust fallback that flipped a tiny-total split to paid after the first sub-cent portion). Idempotency op: ''process_payment_v16''.';

