-- =====================================================================
-- Migration: override_service_charge_v2 — manager auth + audit + clear
--                                          stale snapshot fields
-- =====================================================================
-- Wave D follow-up to v1. Three additions, all driven by the Wave D
-- review:
--
-- 1) Server-side manager-role guard (Issue #4 of the review).
--    v1 trusted p_manager_id verbatim — a direct supabase-js call could
--    pass any uuid and the override would land. v2 verifies that
--    p_manager_id resolves to an active location_members row at the
--    order's location with a manager-tier role_code. Client PIN check
--    in ManagerPinModal stays where it is; this closes the bypass.
--
-- 2) Audit trail via log_payment_event (Issue #4 again).
--    v1 echoed p_manager_id / p_reason in the result JSON but never
--    persisted them. v2 writes a 'service_charge_override' event with
--    the staff_id, reason, and old/new SC amounts so override history
--    is queryable from payment_events alongside captures/refunds.
--
-- 3) Clear stale rule snapshot fields (Issue #5).
--    v1 only updated service_charge + service_charge_is_manual. The
--    rule's service_charge_rate / _name / _applies_on / _rule_id
--    survived the override, so receipts printed
--    "Auto-Gratuity 18% — $5.00" when 18% no longer equals $5.00.
--    v2 nulls rate/applies_on/rule_id and sets a generic name so
--    receipt renderers fall back to a non-misleading label.
--
-- All other math (the payment-exists guard, calculate_order_totals_fast
-- recompute, the return JSON shape) is verbatim from v1.
--
-- Idempotency op string: 'override_service_charge_v2' (separate
-- namespace from v1 per the v9 → v10 / v12 → v13 precedent).
--
-- Apply AFTER:
--   - override_service_charge_v1.sql
--
-- Rollback: override_service_charge_v2_auth_and_audit_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.override_service_charge_v2(
    p_order_id        uuid,
    p_amount          numeric,
    p_manager_id      uuid,
    p_reason          text DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL,
    p_station_id      uuid DEFAULT NULL
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
    v_old_sc numeric;
    v_payment_exists boolean;
    v_manager_ok boolean;
    v_staff_profile_id uuid;
    v_result jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'override_service_charge_v2');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'override_service_charge_v2: p_amount must be >= 0 (got %)', p_amount;
    END IF;

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

    -- ====== v2: server-side manager-role guard ======
    -- p_manager_id is a location_members.id. Verify it resolves to an
    -- active member at THIS order's location/merchant with a
    -- manager-tier role_code. Without this, a forged p_manager_id from
    -- a direct supabase-js call would land — the PIN check on the
    -- client is the only gate v1 had.
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
        RAISE EXCEPTION 'override_service_charge_v2: p_manager_id % is not an active manager at this location', p_manager_id
            USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;

    v_old_sc := COALESCE(v_order.service_charge, 0);

    -- Payment-exists guard (verbatim from v1): a non-voided payment with
    -- collected SC would be reversed against the wrong gross by
    -- apply_refund_to_payment_v4 if SC changed underneath it.
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

    -- ====== v2: clear stale rule snapshot fields ======
    -- v1 only touched service_charge / service_charge_is_manual. The
    -- snapshotted rate/name/applies_on survived the override, so a
    -- receipt could print "Auto-Gratuity 18% — $5.00" when 18% no
    -- longer equals $5.00. Null the rule-derived fields and pin a
    -- generic name so renderers fall back gracefully.
    UPDATE public.orders
    SET service_charge = p_amount,
        service_charge_is_manual = true,
        service_charge_name =
            CASE WHEN p_amount > 0 THEN 'Service Charge' ELSE NULL END,
        service_charge_rate = NULL,
        service_charge_applies_on = NULL,
        service_charge_rule_id = NULL,
        updated_at = now()
    WHERE id = p_order_id;

    -- Re-derive canonical totals (card_total / cash_total / amount_due /
    -- total_amount) and bump sync_version. Mirrors apply_service_charge_v1's
    -- post-write call so realtime subscribers see the change.
    PERFORM public.calculate_order_totals_fast(p_order_id);

    SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

    -- ====== v2: audit log via log_payment_event ======
    -- Reuse the existing payment_events log for SC overrides. p_payment_id
    -- is NULL since the override isn't tied to a specific payment.
    -- p_staff_id receives the staff_profile_id so reporting joins on
    -- staff_profiles work the same as for captures. p_previous_status /
    -- p_new_status carry the SC delta in stringified form (no enum
    -- value matches "$15 → $5" but the column is text).
    PERFORM public.log_payment_event(
        p_payment_id := NULL,
        p_order_id := p_order_id,
        p_location_id := v_order.location_id,
        p_event_type := 'service_charge_override',
        p_amount := p_amount,
        p_tip_amount := 0,
        p_previous_status := v_old_sc::text,
        p_new_status := p_amount::text,
        p_psp_reference := NULL,
        p_auth_code := NULL,
        p_staff_id := v_staff_profile_id,
        p_terminal_id := NULL,
        p_result_code := NULL,
        p_response_message := p_reason,
        p_raw_response := jsonb_build_object(
            'location_member_id', p_manager_id,
            'station_id', p_station_id
        ),
        p_reason := p_reason
    );

    v_result := jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'manager_id', p_manager_id,
        'reason', p_reason,
        'old_service_charge', v_old_sc,
        'new_service_charge', p_amount,
        'service_charge_is_manual', true,
        'card_subtotal', v_post_order.card_subtotal,
        'cash_subtotal', v_post_order.cash_subtotal,
        'card_total', v_post_order.card_total,
        'cash_total', v_post_order.cash_total,
        'total_amount', v_post_order.total_amount,
        'amount_due', v_post_order.amount_due,
        'cash_amount_due', v_post_order.cash_amount_due,
        'sync_version', v_post_order.sync_version
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(
            p_idempotency_key, 'override_service_charge_v2', v_result
        );
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.override_service_charge_v2(
    uuid, numeric, uuid, text, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.override_service_charge_v2 IS
  'Wave D follow-up to override_service_charge_v1. Adds server-side manager-role guard (location_members.role_code IN (merchant.manager/admin/owner) at the order''s location), persists a service_charge_override row in payment_events via log_payment_event, and clears stale rule snapshot fields (rate/applies_on/rule_id NULL, name pinned to generic). All other behavior (payment-exists guard, calculate_order_totals_fast recompute) is verbatim from v1. Idempotency op: ''override_service_charge_v2''.';
