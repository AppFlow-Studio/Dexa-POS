-- =====================================================================
-- Replace inline (merchants JOIN members WHERE user_id = current_user_id())
-- subqueries on order_items + order_payments RLS with the cached
-- (SELECT user_merchant_id()) pattern already used on order_discounts /
-- order_item_modifiers. The inline join was being re-evaluated per row,
-- causing 8–15s mean times on PostgREST nested-embed reads
-- (orders + order_items + …) and saturating the connection pool — every
-- other order-touching query would then time out behind the queue.
--
-- Functionally equivalent: user_merchant_id() is STABLE SECURITY DEFINER
-- and resolves the same merchants→members lookup once per query, then
-- the planner caches it. Wrapping in (SELECT …) keeps it as an InitPlan
-- so it is evaluated exactly once.
-- =====================================================================

DROP POLICY IF EXISTS "Merchant Admins Can manage order items" ON public.order_items;

CREATE POLICY "Merchant Admins Can manage order items"
  ON public.order_items
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = (SELECT public.user_merchant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = (SELECT public.user_merchant_id())
    )
  );

DROP POLICY IF EXISTS "merchant_select_order_payments" ON public.order_payments;

CREATE POLICY "merchant_select_order_payments"
  ON public.order_payments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    merchant_id = (SELECT public.user_merchant_id())
  );
