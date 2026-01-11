-- ============================================================
-- Migration 001: Create Stations Table
-- ============================================================
-- File: supabase/migrations/001_create_stations.sql

CREATE TABLE IF NOT EXISTS stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  
  -- Station Identity
  station_name TEXT NOT NULL,
  station_code TEXT,                                    -- Short code like "REG1", "KDS", "CHECKOUT"
  station_type TEXT NOT NULL DEFAULT 'register',       -- register | checkout | kds | self_service
  station_number INTEGER,                              -- Display number: Station #1, #2, etc.
  
  -- Device Identification (the tablet/iPad running the POS app)
  device_id TEXT UNIQUE,                               -- Hardware UUID from app
  device_name TEXT,                                    -- Friendly name: "Front Counter iPad"
  hardware_model TEXT,                                 -- "iPad Pro 11", "iMin Swan 1 Pro"
  os_version TEXT,
  app_version TEXT,
  
  -- Network
  ip_address INET,
  mac_address TEXT,
  
  -- Sync Configuration
  sync_role TEXT DEFAULT 'follower',                   -- leader | follower
  is_online BOOLEAN DEFAULT FALSE,
  last_heartbeat_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  
  -- Capabilities (based on station_type)
  can_create_orders BOOLEAN DEFAULT TRUE,
  can_process_payments BOOLEAN DEFAULT FALSE,
  can_void_orders BOOLEAN DEFAULT FALSE,
  can_apply_discounts BOOLEAN DEFAULT TRUE,
  can_update_kitchen_status BOOLEAN DEFAULT FALSE,
  view_scope TEXT DEFAULT 'own',                       -- own | location (KDS sees all orders)
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES staff_profiles(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_station_type CHECK (station_type IN ('register', 'checkout', 'kds', 'self_service')),
  CONSTRAINT chk_sync_role CHECK (sync_role IN ('leader', 'follower')),
  CONSTRAINT chk_view_scope CHECK (view_scope IN ('own', 'location')),
  CONSTRAINT uq_station_number_per_location UNIQUE (location_id, station_number)
);

-- Indexes
CREATE INDEX idx_stations_location ON stations(location_id) WHERE is_active = TRUE;
CREATE INDEX idx_stations_merchant ON stations(merchant_id);
CREATE INDEX idx_stations_device_id ON stations(device_id);
CREATE INDEX idx_stations_online ON stations(location_id, is_online) WHERE is_online = TRUE;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_stations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON stations
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();

-- Set capabilities based on station type
CREATE OR REPLACE FUNCTION set_station_capabilities()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.station_type
    WHEN 'register' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'checkout' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := TRUE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'kds' THEN
      NEW.can_create_orders := FALSE;
      NEW.can_process_payments := FALSE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := TRUE;
      NEW.view_scope := 'location';  -- KDS sees ALL orders
    WHEN 'self_service' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'own';
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_station_capabilities
  BEFORE INSERT ON stations
  FOR EACH ROW EXECUTE FUNCTION set_station_capabilities();

-- RLS Policies
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their stations"
  ON stations FOR SELECT
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = current_user_id()
  ));

CREATE POLICY "Merchants can manage their stations"
  ON stations FOR ALL
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = current_user_id()
  ));



