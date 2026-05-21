-- QR-1: QR dine-in schema spine.
-- Additive-only migration for the scan -> order -> pay -> runner-delivered flow.

CREATE TABLE IF NOT EXISTS public.table_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  floor_plan_object_id uuid NOT NULL REFERENCES public.floor_plan_objects(id),
  table_label text NOT NULL,
  token text NOT NULL UNIQUE,
  token_version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  scan_count bigint NOT NULL DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  created_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_qr_per_table
  ON public.table_qr_codes(floor_plan_object_id) WHERE is_active;

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS accepts_dine_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_fulfillment_mode text NOT NULL DEFAULT 'runner',
  ADD COLUMN IF NOT EXISTS qr_geofence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_service_fee_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qr_kill_switch boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'online_store_config_qr_fulfillment_mode_check'
      AND conrelid = 'public.online_store_config'::regclass
  ) THEN
    ALTER TABLE public.online_store_config
      ADD CONSTRAINT online_store_config_qr_fulfillment_mode_check
      CHECK (qr_fulfillment_mode IN ('runner', 'counter'));
  END IF;
END $$;

ALTER TABLE public.online_order_sessions
  ADD COLUMN IF NOT EXISTS floor_plan_object_id uuid REFERENCES public.floor_plan_objects(id),
  ADD COLUMN IF NOT EXISTS table_label text,
  ADD COLUMN IF NOT EXISTS table_qr_code_id uuid REFERENCES public.table_qr_codes(id);

ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'qr_dine_in';

CREATE TABLE IF NOT EXISTS public.qr_scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  floor_plan_object_id uuid,
  table_qr_code_id uuid,
  online_order_session_id uuid,
  order_id uuid,
  stage text NOT NULL,
  user_agent text,
  ip_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_qr_scan_events_loc_time
  ON public.qr_scan_events(location_id, occurred_at);

CREATE TABLE IF NOT EXISTS public.qr_guest_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  floor_plan_object_id uuid REFERENCES public.floor_plan_objects(id),
  table_label text NOT NULL,
  online_order_session_id uuid,
  order_id uuid,
  alert_type text NOT NULL,
  message text,
  alert_key text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_qr_guest_alerts_open
  ON public.qr_guest_alerts(location_id, status) WHERE status <> 'resolved';

CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_guest_alert_active
  ON public.qr_guest_alerts(alert_key) WHERE status <> 'resolved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'qr_guest_alerts_status_check'
      AND conrelid = 'public.qr_guest_alerts'::regclass
  ) THEN
    ALTER TABLE public.qr_guest_alerts
      ADD CONSTRAINT qr_guest_alerts_status_check
      CHECK (status IN ('open', 'resolved'));
  END IF;
END $$;

ALTER TABLE public.table_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_guest_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_qr_codes_staff_scope ON public.table_qr_codes;
CREATE POLICY table_qr_codes_staff_scope
  ON public.table_qr_codes
  FOR ALL
  TO authenticated
  USING (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  )
  WITH CHECK (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  );

DROP POLICY IF EXISTS qr_scan_events_staff_scope ON public.qr_scan_events;
CREATE POLICY qr_scan_events_staff_scope
  ON public.qr_scan_events
  FOR ALL
  TO authenticated
  USING (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  )
  WITH CHECK (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  );

DROP POLICY IF EXISTS qr_guest_alerts_staff_scope ON public.qr_guest_alerts;
CREATE POLICY qr_guest_alerts_staff_scope
  ON public.qr_guest_alerts
  FOR ALL
  TO authenticated
  USING (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  )
  WITH CHECK (
    merchant_id = (SELECT public.user_merchant_id())
    AND location_id = ANY((SELECT public.user_location_ids()))
  );
