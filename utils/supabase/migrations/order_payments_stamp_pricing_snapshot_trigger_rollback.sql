-- Rollback: order_payments_stamp_pricing_snapshot_trigger
DROP TRIGGER IF EXISTS trg_order_payments_stamp_pricing_snapshot ON public.order_payments;
DROP FUNCTION IF EXISTS public._stamp_pricing_snapshot();
