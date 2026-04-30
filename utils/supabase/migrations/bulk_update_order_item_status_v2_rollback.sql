-- =====================================================================
-- Rollback: drops bulk_update_order_item_status_v2
-- =====================================================================
-- Use when the v2 idempotency-wrapped function needs to be removed.
-- v1 (bulk_update_order_item_status without p_idempotency_key) is
-- untouched by the v2 migration, so dropping v2 reverts callers to v1
-- once the client-side EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS
-- flag is also flipped off.
--
-- Order matters: drop the function BEFORE the client flag is flipped off
-- only if you also redeploy the client immediately. Safer order:
--   1. Flip client flag (EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS=0)
--   2. Push a build / wait for clients to refresh
--   3. Run this rollback
-- =====================================================================

DROP FUNCTION IF EXISTS public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid);
