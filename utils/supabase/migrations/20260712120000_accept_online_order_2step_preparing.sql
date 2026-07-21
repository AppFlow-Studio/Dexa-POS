-- Migration: accept_online_order respects the KDS workflow mode
--
-- Context: 2-step KDS locations have no "sent" stage — items fire straight to
-- cooking ('preparing'). accept_online_order hardcoded status='sent_to_kitchen'
-- and items kitchen_status='sent', so accepted online orders sat in a stage the
-- location doesn't use (POS shows "Sent to Kitchen", KDS only shows Cooking via
-- a client-side remap, and reporting sees a phantom stage).
--
-- Fix: read locations.kds_workflow_mode (settings screen dual-writes the column
-- and pos_config.kds.workflowMode). 2-step → status='preparing', items
-- kitchen_status='preparing' with started_preparing_at/fire_time stamped to
-- mirror bulk_update_order_item_status (kds_workflow_mode.sql). 3-step →
-- unchanged behavior.
--
-- Sibling: process_online_order's auto-accept branch applies the same CASE
-- (dexapos-website repo migration) — keep the two in sync.
--
-- Invariants preserved:
--   * sent_to_kitchen_at NULL→value on order_items drives trg_route_items_to_kds
--     (kds_routing_engine.sql) — stamped in BOTH branches or items never route
--     to KDS displays.
--   * Envelope string 'Order is not in pending status (current: X)' is regexed
--     by the client (parseCurrentStatus in useOnlineOrderActions).
--   * valid_status_transitions only forbids draft+sent_to_kitchen_at — pending →
--     preparing passes.
--   * notify_order_status_change fires on order_status_history and already maps
--     to_status='preparing' ("Cooking now").
--
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually. Rollback: 20260712120000_accept_online_order_2step_preparing_rollback.sql

CREATE OR REPLACE FUNCTION public.accept_online_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order  RECORD;
  v_now    TIMESTAMPTZ := NOW();
  v_mode   TEXT;
  v_status TEXT;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT id, status, location_id, merchant_id
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  SELECT COALESCE(kds_workflow_mode, '3-step') INTO v_mode
    FROM public.locations
   WHERE id = v_order.location_id;
  v_status := CASE WHEN v_mode = '2-step' THEN 'preparing' ELSE 'sent_to_kitchen' END;

  UPDATE public.orders
     SET status               = v_status::public.order_status,
         accepted_at          = v_now,
         sent_to_kitchen_at   = v_now,
         started_preparing_at = CASE WHEN v_mode = '2-step'
                                     THEN COALESCE(started_preparing_at, v_now)
                                     ELSE started_preparing_at END,
         updated_at           = v_now
   WHERE id = p_order_id;

  -- Fire all items to kitchen. sent_to_kitchen_at NULL→value is what routes
  -- items to KDS displays (trg_route_items_to_kds) — stamp in both branches.
  UPDATE public.order_items
     SET kitchen_status       = CASE WHEN v_mode = '2-step' THEN 'preparing' ELSE 'sent' END,
         sent_to_kitchen_at   = COALESCE(sent_to_kitchen_at, v_now),
         fire_time            = CASE WHEN v_mode = '2-step'
                                     THEN COALESCE(fire_time, v_now)
                                     ELSE fire_time END,
         started_preparing_at = CASE WHEN v_mode = '2-step'
                                     THEN COALESCE(started_preparing_at, v_now)
                                     ELSE started_preparing_at END
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  -- The routing trigger ran at the end of the statement above; sync started_at
  -- for prep-time metric parity with bulk_update_order_item_status.
  IF v_mode = '2-step' THEN
    UPDATE public.kds_item_status kis
       SET started_at = COALESCE(kis.started_at, v_now)
      FROM public.order_items oi
     WHERE oi.id = kis.order_item_id
       AND oi.order_id = p_order_id
       AND kis.status = 'pending';
  END IF;

  -- Audit trail (notify_order_status_change keys on to_status)
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', v_status, v_now, 'Accepted by merchant (online order)');

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'accepted_at', v_now
  );
END;
$function$;

-- Split-brain guard: the server reads locations.kds_workflow_mode while the POS
-- client reads pos_config.kds.workflowMode. The settings screen dual-writes
-- both, but locations that changed mode before the dual-write shipped may have
-- a stale column — backfill from pos_config (the client's source of truth).
UPDATE public.locations
   SET kds_workflow_mode = pos_config->'kds'->>'workflowMode'
 WHERE pos_config->'kds'->>'workflowMode' IN ('2-step', '3-step')
   AND kds_workflow_mode IS DISTINCT FROM (pos_config->'kds'->>'workflowMode');
