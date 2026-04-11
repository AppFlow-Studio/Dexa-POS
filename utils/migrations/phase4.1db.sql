-- migration: YYYYMMDDHHMMSS_drop_duplicate_indexes.sql

-- In each pair below, we drop the older/uglier-named one and keep the canonical one.
-- Verify each decision in staging first by running \d <table> and confirming which name exists.

DROP INDEX IF EXISTS public.idx_category_items_category;
DROP INDEX IF EXISTS public.idx_category_items_item;
DROP INDEX IF EXISTS public.idx_customers_merchant;
DROP INDEX IF EXISTS public.uq_kds_item_status_display_item;
DROP INDEX IF EXISTS public.idx_location_overrides_location;
DROP INDEX IF EXISTS public.idx_location_stock_location;
DROP INDEX IF EXISTS public.location_inventory_stock_location_item_unique;
DROP INDEX IF EXISTS public.location_modifier_group_overrides_unique;
DROP INDEX IF EXISTS public.location_modifier_item_overrides_unique;
DROP INDEX IF EXISTS public.idx_lvp_location;
DROP INDEX IF EXISTS public.idx_locations_merchant;
DROP INDEX IF EXISTS public.idx_ltx_order;
DROP INDEX IF EXISTS public.idx_menu_categories_menu;
DROP INDEX IF EXISTS public.menu_categories_menu_category_unique;
DROP INDEX IF EXISTS public.idx_menu_item_recipes_menu_item;
DROP INDEX IF EXISTS public.idx_menu_items_merchant;
DROP INDEX IF EXISTS public.idx_merchants_clerk_org;
DROP INDEX IF EXISTS public.idx_order_items_order;
DROP INDEX IF EXISTS public.idx_order_payment_items_payment;
DROP INDEX IF EXISTS public.idx_order_payments_order;
DROP INDEX IF EXISTS public.idx_payment_events_payment;
DROP INDEX IF EXISTS public.idx_po_merchant;
DROP INDEX IF EXISTS public.idx_stock_log_merchant;
DROP INDEX IF EXISTS public.idx_table_sessions_order;
DROP INDEX IF EXISTS public.idx_tip_dist_session;
DROP INDEX IF EXISTS public.idx_tip_dist_session_role;