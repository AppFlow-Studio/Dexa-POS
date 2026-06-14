-- =====================================================================
-- Migration: override_service_charge_v3 — percentage mode support
-- =====================================================================
-- Extends v2 with p_mode ('amount' | 'percent') and p_rate.
--
-- Changes vs v2:
--
-- 1) New params: p_mode text DEFAULT 'amount', p_rate numeric DEFAULT NULL.
--    p_amount is now optional (DEFAULT NULL) but required when mode='amount'.
--
-- 2) In percent mode:
--    - Computes v_base from order subtotal honoring service_charge_applies_on
--      (defaults to 'post_discount' — the discounted check the manager sees).
--    - v_sc := ROUND(p_rate / 100 * v_base, 2)  — flat, identical for cash+card.
--    - Stores service_charge_rate = p_rate so receipt renderers and audit
--      have it; is_manual = true is still what suppresses auto re-apply.
--    - service_charge_applies_on is pinned to the resolved value.
--
-- 3) In amount mode: identical to v2 (rate = NULL, applies_on = NULL).
--
-- 4) Audit payload extended: mode + rate written into p_raw_response.
--
-- 5) v2 kept unchanged — existing callers continue to work.
--    v3 is the new default call site; v2 can be a thin wrapper or just kept.
--
-- Invariant: service_charge is a flat dollar value added to both card_total
-- and cash_total — calculate_order_totals_fast handles this; % mode does
-- not break the invariant because we resolve to flat before persisting.
--
-- Apply AFTER:
--   - override_service_charge_v2_auth_and_audit.sql
--
-- Rollback: override_service_charge_v3_percent_mode_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.override_service_charge_v3(
    p_order_id        uuid,
    p_manager_id      uuid,
    p_mode            text    DEFAULT 'amount',  -- 'amount' | 'percent'
    p_amount          numeric DEFAULT NULL,       -- required when mode='amount'
    p_rate            numeric DEFAULT NULL,       -- required when mode='percent' (0-100)
    p_reason          text    DEFAULT NULL,
    p_idempotency_key uuid    DEFAULT NULL,
    p_station_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_cached       jsonb;
    v_order        record;
    v_post_order   record;
    v_old_sc       numeric;
    v_payment_exists boolean;
    v_manager_ok   boolean;
    v_staff_profile_id uuid;
    v_applies_on   text;
    v_base         numeric;
    v_sc           numeric;
    v_result       jsonb;
BEGIN
    -- ── Idempotency ──────────────────────────────────────────────────
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'override_service_charge_v3');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    -- ── Input validation ─────────────────────────────────────────────
    IF p_mode NOT IN ('amount', 'percent') THEN
        RAISE EXCEPTION 'override_service_charge_v3: p_mode must be ''amount'' or ''percent'' (got %)', p_mode;
    END IF;

    IF p_mode = 'amount' THEN
        IF p_amount IS NULL OR p_amount < 0 THEN
            RAISE EXCEPTION 'override_service_charge_v3: p_amount must be >= 0 when mode=''amount'' (got %)', p_amount;
        END IF;
    ELSE
        IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
            RAISE EXCEPTION 'override_service_charge_v3: p_rate must be between 0 and 100 when mode=''percent'' (got %)', p_rate
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- ── Fetch order ──────────────────────────────────────────────────
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;

    PERFORM public._assert_order_station_match(p_order_id, p_station_id);

    -- ── Manager-role guard (inherited from v2) ───────────────────────
    SELECT
        EXISTS (
            SELECT 1 FROM public.location_members lm
            WHERE lm.id = p_manager_id
              AND lm.merchant_id = v_order.merchant_id
              AND lm.location_id = v_order.location_id
              AND lm.is_active = true
              AND lm.role_code IN ('merchant.manager', 'merchant.admin', 'merchant.owner')
        ),
        (SELECT staff_profile_id FROM public.location_members WHERE id = p_manager_id)
    INTO v_manager_ok, v_staff_profile_id;

    IF NOT v_manager_ok THEN
        RAISE EXCEPTION 'override_service_charge_v3: p_manager_id % is not an active manager at this location', p_manager_id
            USING ERRCODE = '42501';
    END IF;

    v_old_sc := COALESCE(v_order.service_charge, 0);

    -- ── Payment-exists guard (inherited from v2) ─────────────────────
    SELECT EXISTS (
        SELECT 1 FROM public.order_payments
        WHERE order_id = p_order_id
          AND is_voided = false
          AND status IN ('captured', 'partially_refunded', 'refunded')
    ) INTO v_payment_exists;

    IF v_payment_exists THEN
        RAISE EXCEPTION 'cannot override service charge: order has non-voided payments (void or refund them first)'
            USING ERRCODE = 'check_violation';
    END IF;

    -- ── Compute flat SC amount ────────────────────────────────────────
    IF p_mode = 'percent' THEN
        -- Resolve base: honour existing applies_on or default to post_discount.
        v_applies_on := COALESCE(v_order.service_charge_applies_on, 'post_discount');
        IF v_applies_on = 'pre_discount' THEN
            v_base := COALESCE(v_order.subtotal, 0);
        ELSE
            -- post_discount: subtotal minus discount_amount
            v_base := COALESCE(v_order.subtotal, 0) - COALESCE(v_order.discount_amount, 0);
        END IF;
        v_sc := ROUND(p_rate / 100.0 * v_base, 2);
    ELSE
        v_sc           := ROUND(p_amount, 2);
        v_applies_on   := NULL;   -- amount mode: clear applies_on like v2
    END IF;

    -- ── Persist ──────────────────────────────────────────────────────
    UPDATE public.orders
    SET service_charge          = v_sc,
        service_charge_is_manual = true,
        service_charge_name     = CASE WHEN v_sc > 0 THEN 'Service Charge' ELSE NULL END,
        -- For percent mode: store the rate for audit/display and pin applies_on.
        -- For amount mode: null both (matches v2 exactly).
        service_charge_rate     = CASE WHEN p_mode = 'percent' THEN p_rate ELSE NULL END,
        service_charge_applies_on = v_applies_on,
        service_charge_rule_id  = NULL,
        updated_at              = now()
    WHERE id = p_order_id;

    PERFORM public.calculate_order_totals_fast(p_order_id);

    SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

    -- ── Audit log ────────────────────────────────────────────────────
    PERFORM public.log_payment_event(
        p_payment_id      := NULL,
        p_order_id        := p_order_id,
        p_location_id     := v_order.location_id,
        p_event_type      := 'service_charge_override',
        p_amount          := v_sc,
        p_tip_amount      := 0,
        p_previous_status := v_old_sc::text,
        p_new_status      := v_sc::text,
        p_psp_reference   := NULL,
        p_auth_code       := NULL,
        p_staff_id        := v_staff_profile_id,
        p_terminal_id     := NULL,
        p_result_code     := NULL,
        p_response_message := p_reason,
        p_raw_response    := jsonb_build_object(
            'mode',               p_mode,
            'rate',               p_rate,
            'applies_on',         v_applies_on,
            'base_amount',        CASE WHEN p_mode = 'percent' THEN v_base ELSE NULL END,
            'location_member_id', p_manager_id,
            'station_id',         p_station_id
        ),
        p_reason          := p_reason
    );

    -- ── Build result ─────────────────────────────────────────────────
    v_result := jsonb_build_object(
        'success',                true,
        'order_id',               p_order_id,
        'manager_id',             p_manager_id,
        'mode',                   p_mode,
        'rate',                   p_rate,
        'reason',                 p_reason,
        'old_service_charge',     v_old_sc,
        'new_service_charge',     v_sc,
        'service_charge_is_manual', true,
        'card_subtotal',          v_post_order.card_subtotal,
        'cash_subtotal',          v_post_order.cash_subtotal,
        'card_total',             v_post_order.card_total,
        'cash_total',             v_post_order.cash_total,
        'total_amount',           v_post_order.total_amount,
        'amount_due',             v_post_order.amount_due,
        'cash_amount_due',        v_post_order.cash_amount_due,
        'sync_version',           v_post_order.sync_version
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(
            p_idempotency_key, 'override_service_charge_v3', v_result
        );
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.override_service_charge_v3(
    uuid, uuid, text, numeric, numeric, text, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.override_service_charge_v3 IS
  'Extends override_service_charge_v2 with percentage mode. p_mode=''amount'' is identical to v2. p_mode=''percent'' resolves flat SC = ROUND(p_rate/100 * subtotal_base, 2) server-side, stores service_charge_rate=p_rate and pins service_charge_applies_on for audit; is_manual=true suppresses auto re-apply. Audit payload includes mode, rate, applies_on, and base_amount. Inherits v2 manager-role guard (42501) and payment-exists block.';
