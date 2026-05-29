-- =====================================================================
-- Migration: apply_service_charge_v1 — server-authoritative SC
-- =====================================================================
-- Wave C. Moves service charge from "client computes, server stores
-- whatever the client says" to "server re-resolves the rule and writes
-- the value, client-shown SC is preview only." This closes the
-- multi-station race the senior backend review flagged: if two stations
-- send divergent SC payloads (different rate, different rule, stale
-- snapshot), last-write-wins corrupts state; with server re-resolution
-- they converge to the same value derived from the same inputs.
--
-- Mirrors the client calculator in lib/order-calculator.ts §SERVICE
-- CHARGE: rate × base (pre_discount → gross subtotal, post_discount →
-- net subtotal-after-discount), rounded half-up to 2dp, folded into both
-- card_total and cash_total as the same flat $. The client calculator
-- remains the live-preview source; this RPC is the persisted truth.
--
-- Snapshot freeze: on first apply (orders.service_charge_rule_id IS NULL)
-- the rate/applies_on/name are pinned from the live rule. Subsequent
-- applies keep the pin unless the resolved rule.id changes — that's the
-- only condition that re-pins. Mid-shift rule edits on the website don't
-- retroactively re-rate open orders, matching the client snapshot
-- semantics.
--
-- Manual override (service_charge_is_manual = true) short-circuits the
-- function entirely. Wave D will introduce the manager-PIN override that
-- sets this flag; Wave C just respects it.
--
-- Idempotency op string: 'apply_service_charge_v1'. Composite PK on
-- idempotency_keys means the suffix-pattern from process_payment_v12
-- (`<payment_key>:sc` UUID-namespaced) gets its own cache row distinct
-- from the parent payment key.
--
-- Apply AFTER:
--   - 00_idempotency_layer.sql
--   - orders_add_service_charge_applies_on.sql
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
    v_rule  record;

    v_gross_card_subtotal numeric := 0;
    v_gross_cash_subtotal numeric := 0;
    v_net_card_subtotal   numeric := 0;
    v_net_cash_subtotal   numeric := 0;
    v_card_tax_total      numeric := 0;
    v_cash_tax_total      numeric := 0;

    v_sc_base    numeric := 0;
    v_old_sc     numeric := 0;
    v_new_sc     numeric := 0;
    v_new_card_total numeric;
    v_new_cash_total numeric;

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
    -- 3. Manual override short-circuit. Cache the no-op result so retries
    --    don't burn through to step 4+. Wave D will set this flag.
    -- =================================================================
    IF v_order.service_charge_is_manual = true THEN
        v_result := jsonb_build_object(
            'success', true,
            'skipped', 'manual_override',
            'service_charge', v_old_sc,
            'service_charge_rule_id', v_order.service_charge_rule_id,
            'service_charge_rate', v_order.service_charge_rate,
            'service_charge_applies_on', v_order.service_charge_applies_on,
            'service_charge_name', v_order.service_charge_name
        );

        IF p_idempotency_key IS NOT NULL THEN
            PERFORM public._idempotency_complete(
                p_idempotency_key, 'apply_service_charge_v1', v_result
            );
        END IF;
        RETURN v_result;
    END IF;

    -- =================================================================
    -- 4. Re-derive subtotals + tax from order_items. Mirrors the
    --    client calculator's first/second pass and matches v11's
    --    pre-payment SUM block — the SC base must come from the same
    --    arithmetic the totals do, or display vs persisted will drift.
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
        ), 0),
        COALESCE(SUM(
            ROUND(
                (
                    (oi.quantity * oi.unit_price) - COALESCE(oi.discount_amount, 0)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0),
        COALESCE(SUM(
            ROUND(
                (
                    (oi.quantity * oi.cash_price)
                    - COALESCE(
                        ROUND(
                            COALESCE(oi.discount_amount, 0)
                            * COALESCE(oi.cash_price, oi.unit_price)
                            / NULLIF(oi.unit_price, 0)
                        , 2)
                    , 0)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0)
    INTO
        v_gross_card_subtotal,
        v_gross_cash_subtotal,
        v_net_card_subtotal,
        v_net_cash_subtotal,
        v_card_tax_total,
        v_cash_tax_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false;

    -- =================================================================
    -- 5. Two call modes:
    --
    --    (a) Eligibility mode (p_party_size IS NOT NULL):
    --        Re-resolve the rule from service_charge_rules, run the full
    --        eligibility check (party size + order type), pin or clear
    --        snapshot fields accordingly. This is the path the client
    --        item-mutation wrappers take.
    --
    --    (b) Refresh mode (p_party_size IS NULL):
    --        Don't touch eligibility — trust the existing pinned snapshot
    --        on orders.service_charge_rule_id and just recompute the
    --        SC amount against current order_items subtotals. This is
    --        the defensive payment-time call from process_payment_v12,
    --        where party size isn't directly available to the payment
    --        RPC. If no snapshot is pinned, no SC is applied.
    --
    -- Snapshot freeze semantics are shared: rate/applies_on/name stay
    -- pinned until the resolved rule.id changes.
    -- =================================================================

    IF p_party_size IS NULL THEN
        -- Refresh mode.
        IF v_order.service_charge_rule_id IS NULL
           OR COALESCE(v_order.service_charge_rate, 0) <= 0
           OR v_order.service_charge_applies_on IS NULL THEN
            -- No prior snapshot — defensive call is a no-op.
            v_eligible        := false;
            v_new_sc          := COALESCE(v_order.service_charge, 0);
            v_rule_id_snap    := v_order.service_charge_rule_id;
            v_rate_snap       := v_order.service_charge_rate;
            v_applies_on_snap := v_order.service_charge_applies_on;
            v_name_snap       := v_order.service_charge_name;
        ELSE
            v_eligible        := true;
            v_rule_id_snap    := v_order.service_charge_rule_id;
            v_rate_snap       := v_order.service_charge_rate;
            v_applies_on_snap := v_order.service_charge_applies_on;
            v_name_snap       := v_order.service_charge_name;

            v_sc_base := CASE v_applies_on_snap
                WHEN 'pre_discount'  THEN v_gross_card_subtotal
                WHEN 'post_discount' THEN v_net_card_subtotal
                ELSE v_gross_card_subtotal
            END;
            v_new_sc := ROUND(v_sc_base * v_rate_snap / 100.0, 2);
        END IF;

    ELSE
        -- Eligibility mode. Resolve the rule first.
        SELECT *
        INTO v_rule
        FROM public.service_charge_rules
        WHERE merchant_id = v_order.merchant_id
          AND (location_id = v_order.location_id OR location_id IS NULL)
          AND is_active = true
          AND auto_apply = true
        ORDER BY (location_id IS NOT NULL) DESC, updated_at DESC
        LIMIT 1;

        v_eligible := v_rule.id IS NOT NULL
            AND v_rule.rate_percent > 0
            AND v_order.order_type::text = ANY(v_rule.applies_to_order_types)
            AND p_party_size >= v_rule.min_party_size;

        IF NOT v_eligible THEN
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

            v_sc_base := CASE v_applies_on_snap
                WHEN 'pre_discount'  THEN v_gross_card_subtotal
                WHEN 'post_discount' THEN v_net_card_subtotal
                ELSE v_gross_card_subtotal
            END;
            v_new_sc := ROUND(v_sc_base * v_rate_snap / 100.0, 2);
        END IF;
    END IF;

    -- =================================================================
    -- 9. Re-derive totals. Don't use the existing card_total — its other
    --    summands (subtotal, discount, tax) may have shifted since the
    --    last write. Re-compose from order_items so the persisted total
    --    matches what the next read sees.
    -- =================================================================
    v_new_card_total := v_net_card_subtotal + v_card_tax_total + v_new_sc;
    v_new_cash_total := v_net_cash_subtotal + v_cash_tax_total + v_new_sc;

    -- =================================================================
    -- 10. Persist. Updating subtotals + tax columns too so a stale
    --     client recomputing from orders sees consistent values.
    -- =================================================================
    UPDATE public.orders
    SET service_charge            = v_new_sc,
        service_charge_rule_id    = v_rule_id_snap,
        service_charge_rate       = v_rate_snap,
        service_charge_applies_on = v_applies_on_snap,
        service_charge_name       = v_name_snap,
        card_subtotal             = v_net_card_subtotal,
        cash_subtotal             = v_net_cash_subtotal,
        card_total                = v_new_card_total,
        cash_total                = v_new_cash_total,
        updated_at                = now()
    WHERE id = p_order_id;

    -- =================================================================
    -- 11. Idempotency complete + return.
    -- =================================================================
    v_result := jsonb_build_object(
        'success', true,
        'service_charge', v_new_sc,
        'service_charge_rule_id', v_rule_id_snap,
        'service_charge_rate', v_rate_snap,
        'service_charge_applies_on', v_applies_on_snap,
        'service_charge_name', v_name_snap,
        'card_subtotal', v_net_card_subtotal,
        'cash_subtotal', v_net_cash_subtotal,
        'card_total', v_new_card_total,
        'cash_total', v_new_cash_total,
        'eligible', v_eligible,
        'old_service_charge', v_old_sc
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
  'Server-authoritative service charge RPC (Wave C). Re-resolves the merchant''s service_charge_rule, recomputes SC from order_items, and persists onto orders (service_charge + snapshot fields + card_total/cash_total). Snapshot freeze: rate/applies_on/name pinned on first apply, re-pinned only when service_charge_rule_id changes. Manual override (service_charge_is_manual=true) short-circuits. Idempotency op namespace: ''apply_service_charge_v1''.';

-- =====================================================================
-- How to test (Wave C.1)
-- =====================================================================
-- 1. Apply against staging (dfwqakoyittmrwbqvxgw). Confirm fn exists:
--      SELECT proname FROM pg_proc WHERE proname = 'apply_service_charge_v1';
-- 2. Eligibility — dine-in, party of 6, active rule with min_party_size=6,
--    rate_percent=18, applies_on='pre_discount', applies_to_order_types
--    contains 'dine_in':
--      SELECT public.apply_service_charge_v1('<order_id>', 6, NULL, NULL);
--      SELECT service_charge, service_charge_rate, service_charge_rule_id,
--             service_charge_applies_on, card_total, cash_total
--        FROM orders WHERE id = '<order_id>';
--      Expect service_charge = ROUND(gross_card_subtotal * 0.18, 2),
--      snapshot fields populated.
-- 3. Replay — same idempotency key twice, second returns cached jsonb,
--    no second UPDATE (verify updated_at unchanged):
--      SELECT updated_at FROM orders WHERE id = '<order_id>';
--      SELECT public.apply_service_charge_v1('<order_id>', 6,
--             '00000000-0000-0000-0000-000000000777'::uuid, NULL);
--      SELECT public.apply_service_charge_v1('<order_id>', 6,
--             '00000000-0000-0000-0000-000000000777'::uuid, NULL);
--      SELECT updated_at FROM orders WHERE id = '<order_id>'; -- equal
-- 4. Ineligible (party < min_party_size) — fields zero out:
--      SELECT public.apply_service_charge_v1('<order_id>', 2, NULL, NULL);
--      Expect service_charge=0, snapshot fields NULL.
-- 5. Snapshot freeze — change rule.rate_percent on website mid-order,
--    re-apply; rate stays pinned, service_charge unchanged:
--      UPDATE service_charge_rules SET rate_percent = 25 WHERE id = '<rule_id>';
--      SELECT public.apply_service_charge_v1('<order_id>', 6, NULL, NULL);
--      Expect service_charge_rate = 18 (snapshot), not 25.
-- 6. Manual override — set is_manual, function short-circuits:
--      UPDATE orders SET service_charge_is_manual = true WHERE id = '<order_id>';
--      SELECT public.apply_service_charge_v1('<order_id>', 6, NULL, NULL);
--      Expect skipped='manual_override', service_charge unchanged.
-- 7. Concurrent applies — two psql sessions, both call with different
--    idempotency keys; second blocks on FOR UPDATE until first commits,
--    both succeed with identical final state.
-- =====================================================================
