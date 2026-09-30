-- =====================================================================
-- Rollback: 20260930140000_kds_quick_done_online_completion
-- =====================================================================
-- Ship the POS rollback (or leave it: the client falls back to
-- bulk_update_order_item_status_v2 when kds_complete_items_v1 is missing,
-- and treats missing display columns as the defaults) before dropping.
-- =====================================================================

DROP FUNCTION IF EXISTS public.kds_complete_items_v1(uuid[], uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.get_kds_online_accept_config_v1(uuid);

ALTER TABLE public.kds_displays
  DROP CONSTRAINT IF EXISTS kds_displays_kds_flow_mode_check,
  DROP COLUMN IF EXISTS kds_flow_mode,
  DROP COLUMN IF EXISTS show_online_orders_button;

ALTER FUNCTION public.complete_online_order(uuid)
  SET search_path TO 'public';
ALTER FUNCTION public.mark_online_order_ready(uuid)
  SET search_path TO 'public';
