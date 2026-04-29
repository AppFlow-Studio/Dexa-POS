CREATE UNIQUE INDEX CONCURRENTLY idx_unique_order_number_per_merchant ON public.orders (merchant_id, order_number);

CREATE UNIQUE INDEX CONCURRENTLY idx_unique_staff_profiles_user_per_merchant ON public.staff_profiles (merchant_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY idx_unique_pin_per_location ON public.location_members (location_id, pin_hashed) WHERE pin_hashed IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY idx_unique_ipospays_tpn ON public.online_store_config (ipospays_tpn) WHERE ipospays_tpn IS NOT NULL;