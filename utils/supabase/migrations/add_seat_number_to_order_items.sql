-- Add seat_number column to order_items for per-seat ordering
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS seat_number INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_seat
  ON order_items (order_id, seat_number)
  WHERE seat_number IS NOT NULL;
