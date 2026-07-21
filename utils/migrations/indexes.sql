-- migration: YYYYMMDDHHMMSS_hot_path_fk_indexes.sql
-- CRITICAL: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Apply each statement individually via the SQL editor or as a non-transactional migration.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_assigned_server_id ON public.orders(assigned_server_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_by_staff_id ON public.orders(created_by_staff_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_by_user_id ON public.orders(created_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_station_id ON public.orders(station_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_voided_by ON public.orders(voided_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_assigned_to_staff_id ON public.order_items(assigned_to_staff_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_discount_applied_by ON public.order_items(discount_applied_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_discount_approved_by ON public.order_items(discount_approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_discount_id ON public.order_items(discount_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_location_exclusive_item_id ON public.order_items(location_exclusive_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_selected_size_id ON public.order_items(selected_size_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_voided_by ON public.order_items(voided_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_initiated_by ON public.order_payments(initiated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_location_id ON public.order_payments(location_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_parent_payment_id ON public.order_payments(parent_payment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_processed_by_staff_id ON public.order_payments(processed_by_staff_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_processed_by_user_id ON public.order_payments(processed_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_refunded_by ON public.order_payments(refunded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_returned_by ON public.order_payments(returned_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_tip_adjusted_by ON public.order_payments(tip_adjusted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_voided_by ON public.order_payments(voided_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_item_modifiers_modifier_group_id ON public.order_item_modifiers(modifier_group_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_item_modifiers_modifier_item_id ON public.order_item_modifiers(modifier_item_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_discounts_applied_by_staff_id ON public.order_discounts(applied_by_staff_profiles_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_discounts_approved_by_staff_id ON public.order_discounts(approved_by_staff_profiles_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_discounts_voided_by ON public.order_discounts(voided_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_status_history_changed_by_staff_id ON public.order_status_history(changed_by_staff_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_status_history_changed_by_user_id ON public.order_status_history(changed_by_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_refund_items_order_payment_item_id ON public.order_refund_items(order_payment_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_courses_fired_by ON public.order_courses(fired_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kds_item_status_bumped_by ON public.kds_item_status(bumped_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kds_item_status_order_item_id ON public.kds_item_status(order_item_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kds_displays_location_id ON public.kds_displays(location_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kds_displays_merchant_id ON public.kds_displays(merchant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_printers_merchant_id ON public.printers(merchant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stations_deactivated_by ON public.stations(deactivated_by);