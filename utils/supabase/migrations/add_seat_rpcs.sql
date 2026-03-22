-- RPC: Assign a single item to a seat
CREATE OR REPLACE FUNCTION public.set_item_seat(
  p_order_item_id UUID,
  p_seat_number INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.order_items
  SET seat_number = p_seat_number,
      updated_at = now()
  WHERE id = p_order_item_id;
END;
$$;
