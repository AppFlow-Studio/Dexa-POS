-- =====================================================================
-- Migration: apply_service_charge_v1 — server-authoritative SC + totals
-- =====================================================================
-- Wave C / D-prelude. Moves service charge to "server re-resolves the
-- rule, writes SC + snapshot, then re-derives the canonical totals via
-- calculate_order_totals_fast." Client-shown SC remains preview only.
-- This closes the multi-station race the senior backend review flagged
-- (last-write-wins across stations with divergent snapshots) AND it
-- closes the totals-drift gap from the first iteration of this RPC,
-- which wrote card_total/cash_total but left total_amount /
-- amount_due / sync_version stale.
--
-- Party-size resolution: the server now resolves party_size from
-- orders.session_id → table_sessions.party_size when the caller passes
-- p_party_size = NULL. Callers (most of all the client recalculate
-- wrapper) may still pass an override — typically the live UI seating
-- count, which can lead the table_sessions broadcast by a few hundred
-- ms during seat selection.
--
-- Mirrors the client calculator in lib/order-calculator.ts §SERVICE
-- CHARGE: rate × base (pre_discount → gross subtotal, post_discount →
-- net subtotal-after-discount), rounded half-up to 2dp, folded into
-- both card_total and cash_total as the same flat $.
--
-- Snapshot freeze: on first apply (orders.service_charge_rule_id IS
-- NULL) the rate/applies_on/name are pinned from the live rule.
-- Subsequent applies keep the pin unless the resolved rule.id changes.
-- The snapshotted applies_on (NOT the live rule's) drives the
-- pre/post-discount base selection so mid-shift rule edits don't
-- retroactively re-rate open orders.
--
-- Manual override (service_charge_is_manual = true) short-circuits the
-- SC math but STILL triggers calculate_order_totals_fast so any
-- concurrent item-level changes still propagate into total_amount.
--
-- Totals authority: this function never writes card_total / cash_total /
-- card_subtotal / cash_subtotal / total_amount / amount_due directly.
-- It writes service_charge + the four snapshot columns, then calls
-- public.calculate_order_totals_fast(p_order_id) which is the canonical
-- totals engine. That call bumps sync_version so realtime subscribers
-- see the change.
--
-- Idempotency op string: 'apply_service_charge_v1'.
--
-- Apply AFTER:
--   - 00_idempotency_layer.sql
--   - orders_add_service_charge_applies_on.sql
--   - orders_add_service_charge_snapshot_columns.sql
--   - calculate_order_totals_fast (existing core fn)
--
-- Rollback: apply_service_charge_v1_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_service_charge_v1(
    p_order_id        uuid,
    p_party_size      integer DEFAULT NULL,
    p_idempotency_key uuid    DEFAULT NULL,
    p_station_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb;
    v_order record;
    v_post_order record;
    v_rule  record;

    v_party_size integer;

    v_gross_card_subtotal numeric := 0;
    v_gross_cash_subtotal numeric := 0;
    v_net_card_subtotal   numeric := 0;
    v_net_cash_subtotal   numeric := 0;

    v_sc_base    numeric := 0;
    v_old_sc     numeric := 0;
    v_new_sc     numeric := 0;

    -- Snapshot fields (either freshly resolved or carried-forward).
    v_rule_id_snap     uuid;
    v_rate_snap        numeric;
    v_applies_on_snap  text;
    v_name_snap        text;

    v_eligible boolean := false;
    v_result   jsonb;
BEGIN
    -- =================================================================
    -- 1. Idempotency claim
    -- =================================================================
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'apply_service_charge_v1');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- =================================================================
    -- 2. Lock the order row. Same tenant guards as process_payment_v11.
    -- =================================================================
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;

    v_old_sc := COALESCE(v_order.service_charge, 0);

    -- =================================================================
    -- 3. Manual override short-circuit. Still call calculate_order_totals_fast
    --    so any concurrent item edits get folded into total_amount; just
    --    don't touch service_charge or snapshot fields. Wave D will flip
    --    is_manual via manager-PIN EDIT/REMOVE_SERVICE_CHARGE actions.
    -- =================================================================
    IF v_order.service_charge_is_manual = true THEN
        PERFORM public.calculate_order_totals_fast(p_order_id);

        SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

        v_result := jsonb_build_object(
            'success', true,
            'skipped', 'manual_override',
            'service_charge', v_old_sc,
            'service_charge_rule_id', v_order.service_charge_rule_id,
            'service_charge_rate', v_order.service_charge_rate,
            'service_charge_applies_on', v_order.service_charge_applies_on,
            'service_charge_name', v_order.service_charge_name,
            'card_subtotal', v_post_order.card_subtotal,
            'cash_subtotal', v_post_order.cash_subtotal,
            'card_total', v_post_order.card_total,
            'cash_total', v_post_order.cash_total,
            'total_amount', v_post_order.total_amount,
            'amount_due', v_post_order.amount_due,
            'cash_amount_due', v_post_order.cash_amount_due,
            'sync_version', v_post_order.sync_version,
            'eligible', false,
            'old_service_charge', v_old_sc
        );

        IF p_idempotency_key IS NOT NULL THEN
            PERFORM public._idempotency_complete(
                p_idempotency_key, 'apply_service_charge_v1', v_result
            );
        END IF;
        RETURN v_result;
    END IF;

    -- =================================================================
    -- 4. Resolve party_size. Caller-supplied wins (live UI seating
    --    count); otherwise read from table_sessions via session_id.
    --    Orders without a session_id (takeout, delivery) get NULL,
    --    which means SC eligibility falls through to "no party size
    --    available → not eligible for party-size-gated rules."
    -- =================================================================
    v_party_size := p_party_size;
    IF v_party_size IS NULL AND v_order.session_id IS NOT NULL THEN
        SELECT party_size INTO v_party_size
        FROM public.table_sessions
        WHERE id = v_order.session_id;
    END IF;

    -- =================================================================
    -- 5. Re-derive subtotals from order_items. Mirrors the client
    --    calculator's first pass; matches v11's pre-payment SUM block
    --    so the SC base shares arithmetic with the totals engine.
    -- =================================================================
    SELECT
        COALESCE(SUM(oi.quantity * oi.unit_price), 0),
        COALESCE(SUM(oi.quantity * oi.cash_price), 0),
        COALESCE(SUM(
            (oi.quantity * oi.unit_price) - COALESCE(oi.discount_amount, 0)
        ), 0),
        COALESCE(SUM(
            (oi.quantity * oi.cash_price)
            - COALESCE(
                ROUND(
                    COALESCE(oi.discount_amount, 0)
                    * COALESCE(oi.cash_price, oi.unit_price)
                    / NULLIF(oi.unit_price, 0)
                , 2)
            , 0)
        ), 0)
    INTO
        v_gross_card_subtotal,
        v_gross_cash_subtotal,
        v_net_card_subtotal,
        v_net_cash_subtotal
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false;

    -- =================================================================
    -- 6. Re-resolve the active rule. Location-specific wins over
    --    merchant-global; auto_apply + is_active are required.
    -- =================================================================
    SELECT *
    INTO v_rule
    FROM public.service_charge_rules
    WHERE merchant_id = v_order.merchant_id
      AND (location_id = v_order.location_id OR location_id IS NULL)
      AND is_active = true
      AND auto_apply = true
    ORDER BY (location_id IS NOT NULL) DESC, updated_at DESC
    LIMIT 1;

    -- =================================================================
    -- 7. Eligibility. Requires: rule exists, positive rate,
    --    order_type matches applies_to_order_types, and a known
    --    party_size meeting min_party_size. NULL party_size means
    --    "we couldn't resolve seating" → not eligible.
    -- =================================================================
    v_eligible := v_rule.id IS NOT NULL
        AND v_rule.rate_percent > 0
        AND v_order.order_type::text = ANY(v_rule.applies_to_order_types)
        AND v_party_size IS NOT NULL
        AND v_party_size >= v_rule.min_party_size;

    IF NOT v_eligible THEN
        -- Clear SC + snapshot. calculate_order_totals_fast will pick up
        -- service_charge = 0 and recompute total_amount accordingly.
        v_new_sc          := 0;
        v_rule_id_snap    := NULL;
        v_rate_snap       := NULL;
        v_applies_on_snap := NULL;
        v_name_snap       := NULL;
    ELSE
        -- Snapshot freeze: keep existing pinned values when the
        -- resolved rule.id matches the order's pinned rule_id.
        IF v_order.service_charge_rule_id IS NOT NULL
           AND v_order.service_charge_rule_id = v_rule.id THEN
            v_rule_id_snap    := v_order.service_charge_rule_id;
            v_rate_snap       := COALESCE(v_order.service_charge_rate, v_rule.rate_percent);
            v_applies_on_snap := COALESCE(v_order.service_charge_applies_on,
                                          (v_rule.applies_on)::text);
            v_name_snap       := COALESCE(v_order.service_charge_name, v_rule.name);
        ELSE
            v_rule_id_snap    := v_rule.id;
            v_rate_snap       := v_rule.rate_percent;
            v_applies_on_snap := (v_rule.applies_on)::text;
            v_name_snap       := v_rule.name;
        END IF;

        -- Base selection uses the SNAPSHOTTED applies_on so post-discount
        -- semantics on the open order don't shift when a manager edits
        -- the rule mid-shift.
        v_sc_base := CASE v_applies_on_snap
            WHEN 'pre_discount'  THEN v_gross_card_subtotal
            WHEN 'post_discount' THEN v_net_card_subtotal
            ELSE v_gross_card_subtotal
        END;
        v_new_sc := ROUND(v_sc_base * v_rate_snap / 100.0, 2);
    END IF;

    -- =================================================================
    -- 8. Persist SC + snapshot only. card_total / cash_total / subtotal /
    --    tax_amount / total_amount / amount_due / sync_version are owned
    --    by calculate_order_totals_fast in the next step.
    -- =================================================================
    UPDATE public.orders
    SET service_charge            = v_new_sc,
        service_charge_rule_id    = v_rule_id_snap,
        service_charge_rate       = v_rate_snap,
        service_charge_applies_on = v_applies_on_snap,
        service_charge_name       = v_name_snap,
        updated_at                = now()
    WHERE id = p_order_id;

    -- =================================================================
    -- 9. Canonical totals recompute. This reads orders.service_charge
    --    and updates card_total, cash_total, total_amount, amount_due,
    --    cash_amount_due, effective_*, sync_version — every consumer
    --    of orders.total_amount now sees the SC-inclusive value.
    -- =================================================================
    PERFORM public.calculate_order_totals_fast(p_order_id);

    -- =================================================================
    -- 10. Re-read so the response is post-recalc authoritative. Clients
    --     use this to reconcile their local snapshot against the server.
    -- =================================================================
    SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

    v_result := jsonb_build_object(
        'success', true,
        'service_charge', v_new_sc,
        'service_charge_rule_id', v_rule_id_snap,
        'service_charge_rate', v_rate_snap,
        'service_charge_applies_on', v_applies_on_snap,
        'service_charge_name', v_name_snap,
        'card_subtotal', v_post_order.card_subtotal,
        'cash_subtotal', v_post_order.cash_subtotal,
        'card_total', v_post_order.card_total,
        'cash_total', v_post_order.cash_total,
        'total_amount', v_post_order.total_amount,
        'amount_due', v_post_order.amount_due,
        'cash_amount_due', v_post_order.cash_amount_due,
        'sync_version', v_post_order.sync_version,
        'eligible', v_eligible,
        'old_service_charge', v_old_sc,
        'party_size_used', v_party_size
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(
            p_idempotency_key, 'apply_service_charge_v1', v_result
        );
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_service_charge_v1(uuid, integer, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.apply_service_charge_v1 IS
  'Server-authoritative service charge RPC (Wave C / D-prelude). Re-resolves the merchant''s service_charge_rule, resolves party_size from table_sessions when caller passes NULL, recomputes SC from order_items, persists service_charge + snapshot fields onto orders, then PERFORMs calculate_order_totals_fast so total_amount / amount_due / sync_version reflect SC. Snapshot freeze: rate/applies_on/name pinned on first apply, re-pinned only when service_charge_rule_id changes. Manual override (service_charge_is_manual=true) skips SC math but still recomputes totals. Idempotency op namespace: ''apply_service_charge_v1''.';

-- =====================================================================
-- How to test (Wave C / D-prelude)
-- =====================================================================
-- 1. Apply against staging (dfwqakoyittmrwbqvxgw). Confirm fn exists:
--      SELECT proname FROM pg_proc WHERE proname = 'apply_service_charge_v1';
-- 2. Eligibility — dine-in, party_size in table_sessions=6, active rule
--    with min_party_size=6, rate_percent=18, applies_on='pre_discount',
--    applies_to_order_types contains 'dine_in':
--      SELECT public.apply_service_charge_v1('<order_id>', NULL, NULL, NULL);
--      SELECT service_charge, service_charge_rate, service_charge_rule_id,
--             service_charge_applies_on, card_total, total_amount,
--             amount_due, sync_version
--        FROM orders WHERE id = '<order_id>';
--      Expect service_charge = ROUND(gross_card_subtotal * 0.18, 2),
--      total_amount = card_subtotal + card_tax + service_charge,
--      amount_due reflects SC, sync_version bumped.
-- 3. Server-resolved party_size — repeat #2 without passing p_party_size;
--    response.party_size_used should equal table_sessions.party_size.
-- 4. Client override — pass p_party_size=10 and verify response uses 10
--    even if table_sessions.party_size is 6 (live UI override).
-- 5. Replay idempotency — same key twice, second returns cached jsonb,
--    no second calculate_order_totals_fast (sync_version unchanged).
-- 6. Ineligible (party < min_party_size) — fields zero out, total_amount
--    recomputes WITHOUT SC.
-- 7. Snapshot freeze — change rule.rate_percent on website mid-order,
--    re-apply; rate stays pinned, service_charge unchanged.
-- 8. applies_on snapshot — with pre_discount snapshot, add an item-level
--    discount; SC stays based on gross subtotal. Then update the rule to
--    post_discount and re-apply on the SAME order: SC stays pre_discount-
--    based (snapshot wins). New orders after the rule edit use
--    post_discount.
-- 9. Manual override — set is_manual=true; function preserves
--    service_charge but recomputes total_amount.
-- 10. No session_id (takeout) — order_type='take_out' or session_id=NULL;
--     when rule has min_party_size > 0, SC is zero (no party_size).
-- =====================================================================
