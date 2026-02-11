-- ============================================
-- Add menu/category context columns to order_items
-- Enables KDS filtering and analytics by menu/category
-- All nullable: open items and legacy data won't have these
-- ============================================

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS menu_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS menu_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category_id uuid;
