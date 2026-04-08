-- Add counter columns to payment_terminals
ALTER TABLE payment_terminals
  ADD COLUMN castles_txn_counter INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN castles_batch_number TEXT,
  ADD COLUMN castles_counter_updated_at TIMESTAMPTZ DEFAULT now();

-- Atomic increment function — prevents race conditions if called from multiple sources
CREATE OR REPLACE FUNCTION increment_castles_txn_counter(
  p_terminal_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  UPDATE payment_terminals
  SET
    castles_txn_counter = CASE
      WHEN castles_txn_counter >= 999999 THEN 1  -- wrap around
      ELSE castles_txn_counter + 1
    END,
    castles_counter_updated_at = now()
  WHERE id = p_terminal_id
  RETURNING castles_txn_counter INTO v_next;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
  END IF;

  RETURN v_next;
END;
$$;

-- Reset on settlement
CREATE OR REPLACE FUNCTION reset_castles_txn_counter(
  p_terminal_id UUID,
  p_batch_number TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE payment_terminals
  SET
    castles_txn_counter = 0,
    castles_batch_number = COALESCE(p_batch_number, castles_batch_number),
    castles_counter_updated_at = now()
  WHERE id = p_terminal_id;
END;
$$;