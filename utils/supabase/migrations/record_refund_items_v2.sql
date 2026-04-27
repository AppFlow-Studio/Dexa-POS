-- =====================================================================
-- Migration: record_refund_items_v2 — adds idempotency-key support
-- =====================================================================
-- Forks the 3-arg overload of record_refund_items (refund_system_v1.sql).
-- The 2-arg overload remains untouched (legacy, unused by current client).
-- v1 returns void; v2 caches '{}'::jsonb on completion.
-- Rollback: record_refund_items_v2_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_refund_items_v2(
  p_reversal_id uuid,
  p_items jsonb,
  p_skip_quantity_update boolean DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached JSONB;
  v_item jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'record_refund_items_v2');
    IF v_cached IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_refund_items (
      reversal_id, order_item_id, order_payment_item_id,
      quantity_refunded, unit_price_refunded, subtotal_refunded,
      tax_refunded, total_refunded, refund_reason, refund_reason_detail,
      return_to_inventory, inventory_updated
    )
    VALUES (
      p_reversal_id,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'order_payment_item_id', '')::uuid,
      COALESCE((v_item->>'quantity_refunded')::integer, 1),
      COALESCE((v_item->>'unit_price_refunded')::numeric, 0),
      COALESCE((v_item->>'subtotal_refunded')::numeric, 0),
      COALESCE((v_item->>'tax_refunded')::numeric, 0),
      COALESCE((v_item->>'total_refunded')::numeric, 0),
      (v_item->>'refund_reason')::refund_reason_type,
      v_item->>'refund_reason_detail',
      COALESCE((v_item->>'return_to_inventory')::boolean, false),
      COALESCE((v_item->>'inventory_updated')::boolean, false)
    );

    IF NOT p_skip_quantity_update THEN
      UPDATE order_items
      SET refunded_quantity = COALESCE(refunded_quantity, 0)
            + COALESCE((v_item->>'quantity_refunded')::integer, 0),
          refunded_amount = COALESCE(refunded_amount, 0)
            + COALESCE((v_item->>'total_refunded')::numeric, 0)
      WHERE id = (v_item->>'order_item_id')::uuid;
    END IF;
  END LOOP;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'record_refund_items_v2', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_refund_items_v2(uuid, jsonb, boolean, uuid) TO authenticated;
