-- =====================================================================
-- Migration: overridden service charge taxability
-- =====================================================================
-- BUG: When a manager overrides the service charge, override_service_charge_v3
-- sets orders.service_charge_rule_id = NULL. calculate_order_totals_fast
-- determines SC taxability by looking the rule up via service_charge_rule_id,
-- so after an override the lookup returns NOT FOUND, v_sc_is_taxable := false,
-- and NO tax is applied on the overridden SC. The order total / amount_due
-- therefore under-collect by the SC tax (e.g. ORD-...-S1-0002: SC 4.20 added
-- to total with zero tax on it).
--
-- FIX:
--  1) Add orders.service_charge_is_taxable — an explicit per-order snapshot of
--     whether the SC should be taxed. Survives the rule_id being nulled on
--     override.
--  2) override_service_charge_v3 gains p_is_taxable and writes the column.
--     When p_is_taxable is NULL, carry over the order's prior taxability
--     (rule's is_taxable if a rule was active, else the existing column value)
--     so existing call sites that don't pass the flag don't silently flip it.
--  3) calculate_order_totals_fast resolves taxability from the rule when
--     service_charge_rule_id is set, else falls back to the column. This
--     covers both auto-applied (rule) and manually overridden SC.
--
-- Rollback: 20260609160000_override_service_charge_taxable_rollback.sql
-- =====================================================================

-- ── 1) Column ────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_is_taxable boolean;

COMMENT ON COLUMN public.orders.service_charge_is_taxable IS
  'Per-order snapshot of whether the service charge is taxable. Set by override_service_charge_v3 (manager override clears service_charge_rule_id, so taxability cannot be derived from the rule afterwards). calculate_order_totals_fast prefers the rule''s is_taxable when service_charge_rule_id is set, else falls back to this column.';

-- ── 2) override_service_charge_v3 with p_is_taxable ──────────────────
-- Drop the prior 8-arg overload first. Adding p_is_taxable creates a NEW
-- signature, so CREATE OR REPLACE would leave the 8-arg version in place —
-- two overloads then make the unqualified COMMENT / future calls ambiguous
-- (ERROR 42725: function name is not unique).
DROP FUNCTION IF EXISTS public.override_service_charge_v3(
    uuid, uuid, text, numeric, numeric, text, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.override_service_charge_v3(
    p_order_id        uuid,
    p_manager_id      uuid,
    p_mode            text    DEFAULT 'amount',  -- 'amount' | 'percent'
    p_amount          numeric DEFAULT NULL,       -- required when mode='amount'
    p_rate            numeric DEFAULT NULL,       -- required when mode='percent' (0-100)
    p_reason          text    DEFAULT NULL,
    p_idempotency_key uuid    DEFAULT NULL,
    p_station_id      uuid    DEFAULT NULL,
    p_is_taxable      boolean DEFAULT NULL        -- NULL = carry over prior taxability
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
    v_is_taxable   boolean;
    v_prior_rule_taxable boolean;
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

    -- ── Resolve taxability ───────────────────────────────────────────
    -- When the caller passes p_is_taxable, it's authoritative. Otherwise
    -- carry over the order's prior taxability: the active rule's is_taxable
    -- if a rule was in effect, else the existing snapshot column. This keeps
    -- legacy callers (no p_is_taxable) from silently flipping taxability.
    IF p_is_taxable IS NOT NULL THEN
        v_is_taxable := p_is_taxable;
    ELSE
        v_prior_rule_taxable := NULL;
        IF v_order.service_charge_rule_id IS NOT NULL THEN
            SELECT r.is_taxable INTO v_prior_rule_taxable
            FROM public.service_charge_rules r
            WHERE r.id = v_order.service_charge_rule_id;
        END IF;
        v_is_taxable := COALESCE(v_prior_rule_taxable, v_order.service_charge_is_taxable, false);
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
        service_charge_rate     = CASE WHEN p_mode = 'percent' THEN p_rate ELSE NULL END,
        service_charge_applies_on = v_applies_on,
        service_charge_rule_id  = NULL,
        service_charge_is_taxable = CASE WHEN v_sc > 0 THEN v_is_taxable ELSE NULL END,
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
            'is_taxable',         v_is_taxable,
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
        'is_taxable',             v_is_taxable,
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
    uuid, uuid, text, numeric, numeric, text, uuid, uuid, boolean
) TO authenticated;

COMMENT ON FUNCTION public.override_service_charge_v3(
    uuid, uuid, text, numeric, numeric, text, uuid, uuid, boolean
) IS
  'Manager service-charge override with percentage mode and per-order taxability. p_is_taxable controls whether the overridden SC is taxed; NULL carries over the order''s prior taxability (active rule''s is_taxable, else existing snapshot). Writes orders.service_charge_is_taxable so calculate_order_totals_fast can tax the SC even after service_charge_rule_id is nulled. Inherits v2 manager-role guard (42501) and payment-exists block.';

-- ── 3) calculate_order_totals_fast: column fallback for taxability ───
CREATE OR REPLACE FUNCTION public.calculate_order_totals_fast(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_card_subtotal numeric;
v_cash_subtotal numeric;
v_card_tax numeric;
v_cash_tax numeric;
v_discount numeric;
v_service_charge numeric;
v_amount_paid numeric;
v_original_card_subtotal numeric;
v_original_cash_subtotal numeric;
v_unpaid_card_total numeric;
v_unpaid_cash_total numeric;
v_effective_paid numeric;
v_payment_refunded numeric;
v_payment_voided numeric;
v_card_total_calc numeric;
v_cash_total_calc numeric;
v_payment_based_due numeric;
v_cash_based_due numeric;
v_effective_cash_paid numeric;
v_custom_refund_balance numeric;
v_order record;
v_cash_service_charge numeric;
v_sc_is_taxable boolean;
v_rule_taxable boolean;
v_sc_tax_rate numeric;
v_card_sc_tax numeric;
v_cash_sc_tax numeric;
BEGIN

-- Get original (pre-discount) subtotals and discount amount
SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get post-discount values (subtotal and tax_amount are already discounted per item)
SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get full order record
SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

v_service_charge      := COALESCE(v_order.service_charge, 0);
v_amount_paid         := COALESCE(v_order.amount_paid, 0);
v_cash_service_charge := v_service_charge;
v_card_sc_tax         := 0;
v_cash_sc_tax         := 0;

-- Resolve SC taxability: prefer the active rule's is_taxable when a rule is
-- still attached; otherwise fall back to the per-order snapshot column
-- (orders.service_charge_is_taxable), which is set by manager overrides that
-- null out service_charge_rule_id.
v_rule_taxable := NULL;
IF v_order.service_charge_rule_id IS NOT NULL THEN
    SELECT r.is_taxable INTO v_rule_taxable
    FROM public.service_charge_rules r
    WHERE r.id = v_order.service_charge_rule_id;
END IF;
v_sc_is_taxable := COALESCE(v_rule_taxable, v_order.service_charge_is_taxable, false);

IF v_sc_is_taxable AND v_service_charge > 0 THEN
    -- Read the standard tax rate for this location (table: tax_rates, column: percentage)
    SELECT COALESCE(tr.percentage, 0)
    INTO v_sc_tax_rate
    FROM public.tax_rates tr
    WHERE tr.location_id = v_order.location_id
      AND tr.tax_category = 'standard'
      AND tr.is_active = true
    LIMIT 1;

    IF NOT FOUND OR v_sc_tax_rate IS NULL THEN
        -- Fall back to first non-zero active rate
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
    v_cash_sc_tax := ROUND(v_cash_service_charge * v_sc_tax_rate / 100, 2);

    v_card_tax := v_card_tax + v_card_sc_tax;
    v_cash_tax := v_cash_tax + v_cash_sc_tax;
END IF;

-- Calculate amount_due from UNPAID items (item-level, excludes SC)
SELECT
    COALESCE(SUM(
        ROUND(subtotal * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(tax_amount * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0),
    COALESCE(SUM(
        ROUND(cash_subtotal * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(cash_tax_amount * LEAST(quantity, quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id
    AND is_voided = false
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

-- Effective card-equivalent paid
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

-- Effective cash-side paid
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

v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;
v_cash_total_calc := v_cash_subtotal + v_cash_tax + v_cash_service_charge;

v_payment_based_due     := GREATEST(v_card_total_calc - v_effective_paid, 0);
v_cash_based_due        := GREATEST(v_cash_total_calc - v_effective_cash_paid, 0);
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    v_unpaid_card_total := v_payment_based_due;
    v_unpaid_cash_total := v_cash_based_due;
END IF;

UPDATE public.orders SET
    card_subtotal        = v_original_card_subtotal,
    cash_subtotal        = v_original_cash_subtotal,
    discount_amount      = v_discount,
    effective_subtotal   = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total      = v_card_subtotal + v_card_tax + v_service_charge,
    card_tax_amount      = v_card_tax,
    cash_tax_amount      = v_cash_tax,
    card_total           = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total           = v_cash_subtotal + v_cash_tax + v_cash_service_charge,
    subtotal             = v_card_subtotal,
    tax_amount           = v_card_tax,
    total_amount         = v_card_subtotal + v_card_tax + v_service_charge,
    amount_due           = v_unpaid_card_total,
    cash_amount_due      = v_unpaid_cash_total,
    updated_at           = now()
WHERE id = p_order_id;

RETURN jsonb_build_object(
    'success',            true,
    'card_subtotal',      v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount',    v_discount,
    'card_tax',           v_card_tax,
    'cash_tax',           v_cash_tax,
    'card_total',         v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total',         v_cash_subtotal + v_cash_tax + v_cash_service_charge,
    'amount_due',         v_unpaid_card_total,
    'cash_amount_due',    v_unpaid_cash_total
);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_order_totals_fast TO authenticated;
