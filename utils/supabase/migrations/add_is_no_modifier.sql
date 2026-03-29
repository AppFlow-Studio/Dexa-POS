-- Add is_no column to order_item_modifiers for "NO" (exclude) modifier support
-- NO modifiers explicitly exclude default ingredients (e.g., "NO Onions")
ALTER TABLE public.order_item_modifiers
  ADD COLUMN IF NOT EXISTS is_no BOOLEAN NOT NULL DEFAULT FALSE;
