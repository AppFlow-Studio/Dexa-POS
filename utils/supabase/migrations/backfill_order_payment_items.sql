-- Backfill: Clear unreliable historical order_payment_items
-- Previous bugs in process_payment_v8 caused incorrect quantity_paid values:
--   1. Full-remaining path built v_covered_items_json AFTER the UPDATE (used total qty, not remaining)
--   2. Allocations INSERT re-queried AFTER paid_quantity UPDATE (effective_unpaid = 0 → qty_paid = 0)
-- New payments after this migration will have correct per-payment quantities.
-- Client falls back to covers_items + paid_quantity for orders without payment_items.
TRUNCATE public.order_payment_items;
