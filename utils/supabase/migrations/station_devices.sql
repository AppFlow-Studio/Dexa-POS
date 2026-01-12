-- ============================================================
-- Migration 002: Create Payment Terminals Table (Dejavoo)
-- ============================================================
-- File: supabase/migrations/002_create_payment_terminals.sql

-- Extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payment_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
  
  -- Terminal Identity
  terminal_name TEXT NOT NULL,                          -- "Front Counter Terminal"
  terminal_type TEXT NOT NULL DEFAULT 'dejavoo',        -- dejavoo | clover | square | stripe_terminal
  terminal_model TEXT,                                  -- "Dejavoo QD4", "P3", "Z11"
  serial_number TEXT,
  
  -- Dejavoo SPIN API Credentials (ENCRYPTED)
  tpn TEXT NOT NULL,                                    -- Terminal Profile Number (10-12 digits)
  tpn_encrypted BYTEA,                                  -- Encrypted version for storage
  auth_key_encrypted BYTEA NOT NULL,                    -- Encrypted AuthKey (10 chars)
  register_id TEXT,                                     -- Alternative to TPN (2-50 chars)
  
  -- API Configuration
  api_environment TEXT DEFAULT 'sandbox',               -- sandbox | production
  api_base_url TEXT,                                    -- Override URL if needed
  spin_proxy_timeout INTEGER DEFAULT 120,               -- Timeout in seconds (1-720)
  
  -- Connection Settings
  connection_type TEXT DEFAULT 'cloud',                 -- cloud (SPIN API) | local (DvPayLite)
  local_ip_address INET,                                -- For local DvPayLite connection
  local_port INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_connected BOOLEAN DEFAULT FALSE,
  last_connection_test_at TIMESTAMPTZ,
  last_connection_status TEXT,                          -- Online | Offline | NotFound
  last_transaction_at TIMESTAMPTZ,
  
  -- Capabilities (fetched from terminal)
  supports_contactless BOOLEAN DEFAULT TRUE,
  supports_emv BOOLEAN DEFAULT TRUE,
  supports_manual_entry BOOLEAN DEFAULT TRUE,
  supports_ebt BOOLEAN DEFAULT FALSE,
  supports_debit BOOLEAN DEFAULT TRUE,
  supports_tip_adjust BOOLEAN DEFAULT TRUE,
  
  -- Settings
  auto_settle BOOLEAN DEFAULT FALSE,
  settle_time TIME,                                     -- Auto-settle time if enabled
  print_merchant_receipt BOOLEAN DEFAULT TRUE,
  print_customer_receipt BOOLEAN DEFAULT TRUE,
  signature_threshold DECIMAL(10,2) DEFAULT 25.00,      -- Require signature above this
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_terminal_type CHECK (terminal_type IN ('dejavoo', 'clover', 'square', 'stripe_terminal')),
  CONSTRAINT chk_api_environment CHECK (api_environment IN ('sandbox', 'production')),
  CONSTRAINT chk_connection_type CHECK (connection_type IN ('cloud', 'local')),
  CONSTRAINT uq_tpn_per_merchant UNIQUE (merchant_id, tpn)
);

-- Indexes
CREATE INDEX idx_payment_terminals_location ON payment_terminals(location_id) WHERE is_active = TRUE;
CREATE INDEX idx_payment_terminals_station ON payment_terminals(station_id);
CREATE INDEX idx_payment_terminals_tpn ON payment_terminals(tpn);

-- Auto-update timestamp
CREATE TRIGGER trg_payment_terminals_updated_at
  BEFORE UPDATE ON payment_terminals
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();

-- RLS
ALTER TABLE payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their terminals"
  ON payment_terminals FOR SELECT
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Merchants can manage their terminals"
  ON payment_terminals FOR ALL
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));


-- ============================================================
-- Migration 003: Create Station Devices Table (Printers, etc.)
-- ============================================================
-- File: supabase/migrations/003_create_station_devices.sql

CREATE TABLE IF NOT EXISTS station_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  
  -- For payment terminals, link to payment_terminals table
  payment_terminal_id UUID REFERENCES payment_terminals(id) ON DELETE SET NULL,
  
  -- Device Identity
  device_type TEXT NOT NULL,                            -- payment_terminal | receipt_printer | label_printer | kitchen_printer | cash_drawer | barcode_scanner | scale | customer_display
  device_name TEXT NOT NULL,                            -- "Kitchen Printer", "Receipt Printer"
  device_model TEXT,                                    -- "Epson TM-T88VI", "Star TSP143"
  serial_number TEXT,
  
  -- Connection
  connection_type TEXT NOT NULL,                        -- usb | bluetooth | network | integrated
  connection_address TEXT,                              -- IP address, Bluetooth MAC, USB port
  connection_port INTEGER,                              -- Network port if applicable
  
  -- Printer-specific settings
  printer_width INTEGER,                                -- Character width: 32, 42, 48
  printer_dpi INTEGER,                                  -- 180, 203, 300
  auto_cut BOOLEAN DEFAULT TRUE,
  open_cash_drawer BOOLEAN DEFAULT FALSE,               -- Trigger cash drawer on print
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_connected BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_device_type CHECK (device_type IN (
    'payment_terminal', 'receipt_printer', 'label_printer', 
    'kitchen_printer', 'cash_drawer', 'barcode_scanner', 
    'scale', 'customer_display'
  )),
  CONSTRAINT chk_connection_type CHECK (connection_type IN ('usb', 'bluetooth', 'network', 'integrated'))
);

-- Indexes
CREATE INDEX idx_station_devices_station ON station_devices(station_id);
CREATE INDEX idx_station_devices_type ON station_devices(device_type);
CREATE INDEX idx_station_devices_payment_terminal ON station_devices(payment_terminal_id);

-- Auto-update timestamp
CREATE TRIGGER trg_station_devices_updated_at
  BEFORE UPDATE ON station_devices
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();

-- RLS
ALTER TABLE station_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their devices"
  ON station_devices FOR SELECT
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Merchants can manage their devices"
  ON station_devices FOR ALL
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));


-- ============================================================
-- Migration 004: Add Station References to Orders
-- ============================================================
-- File: supabase/migrations/004_add_station_to_orders.sql

-- Add station columns to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS station_id UUID REFERENCES stations(id),
  ADD COLUMN IF NOT EXISTS created_by_station_id UUID REFERENCES stations(id),
  ADD COLUMN IF NOT EXISTS payment_terminal_id UUID REFERENCES payment_terminals(id);

-- Index for station-filtered queries
CREATE INDEX IF NOT EXISTS idx_orders_station 
  ON orders(station_id) 
  WHERE status NOT IN ('completed', 'cancelled', 'voided');

CREATE INDEX IF NOT EXISTS idx_orders_created_by_station 
  ON orders(created_by_station_id);


-- ============================================================
-- Migration 005: Add Kitchen Status Columns to Order Items
-- ============================================================
-- File: supabase/migrations/005_add_kitchen_status_to_order_items.sql

-- Add kitchen tracking columns
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS kitchen_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kitchen_status_updated_by UUID REFERENCES stations(id),
  ADD COLUMN IF NOT EXISTS kitchen_station TEXT,                    -- "Grill", "Fry", "Expo"
  ADD COLUMN IF NOT EXISTS course_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_prep_time INTEGER,             -- Seconds
  ADD COLUMN IF NOT EXISTS actual_prep_time INTEGER,                -- Seconds
  ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ,                    -- When sent to kitchen
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,                    -- When marked ready
  ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ,                   -- When marked served
  ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0;            -- How many times bumped

-- Constraint for valid kitchen statuses
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_kitchen_status'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT chk_kitchen_status 
      CHECK (kitchen_status IN ('new', 'sent', 'preparing', 'ready', 'served', 'voided'));
  END IF;
END $$;

-- Index for KDS queries
CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_status 
  ON order_items(kitchen_status, fired_at)
  WHERE kitchen_status NOT IN ('served', 'voided');

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_station
  ON order_items(kitchen_station)
  WHERE kitchen_status NOT IN ('served', 'voided');


-- ============================================================
-- Migration 006: Payment Terminal RPCs
-- ============================================================
-- File: supabase/migrations/006_payment_terminal_rpcs.sql

-- Register a new payment terminal with encrypted credentials
CREATE OR REPLACE FUNCTION register_payment_terminal(
  p_merchant_id UUID,
  p_location_id UUID,
  p_station_id UUID,
  p_terminal_name TEXT,
  p_tpn TEXT,
  p_auth_key TEXT,
  p_terminal_model TEXT DEFAULT NULL,
  p_api_environment TEXT DEFAULT 'sandbox'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terminal_id UUID;
  v_encryption_key TEXT;
BEGIN
  -- Get encryption key from vault or config
  -- In production, use Supabase Vault: SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'terminal_encryption_key'
  v_encryption_key := current_setting('app.terminal_encryption_key', true);
  IF v_encryption_key IS NULL THEN
    v_encryption_key := 'dexa-pos-terminal-key-change-in-production';
  END IF;
  
  -- Validate TPN format (10-12 digits)
  IF NOT (p_tpn ~ '^\d{10,12}$') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid TPN format. Must be 10-12 digits.'
    );
  END IF;
  
  -- Validate AuthKey format (10 characters)
  IF LENGTH(p_auth_key) != 10 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid AuthKey format. Must be exactly 10 characters.'
    );
  END IF;
  
  -- Check for duplicate TPN
  IF EXISTS (
    SELECT 1 FROM payment_terminals 
    WHERE merchant_id = p_merchant_id AND tpn = p_tpn AND is_active = TRUE
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'A terminal with this TPN already exists.'
    );
  END IF;
  
  -- Insert terminal with encrypted credentials
  INSERT INTO payment_terminals (
    merchant_id,
    location_id,
    station_id,
    terminal_name,
    terminal_model,
    tpn,
    tpn_encrypted,
    auth_key_encrypted,
    api_environment
  ) VALUES (
    p_merchant_id,
    p_location_id,
    p_station_id,
    p_terminal_name,
    p_terminal_model,
    p_tpn,  -- Store plain TPN for lookups (not sensitive)
    pgp_sym_encrypt(p_tpn, v_encryption_key),
    pgp_sym_encrypt(p_auth_key, v_encryption_key),
    p_api_environment
  )
  RETURNING id INTO v_terminal_id;
  
  -- Also create a station_device entry
  INSERT INTO station_devices (
    station_id,
    merchant_id,
    location_id,
    payment_terminal_id,
    device_type,
    device_name,
    device_model,
    connection_type
  ) VALUES (
    p_station_id,
    p_merchant_id,
    p_location_id,
    v_terminal_id,
    'payment_terminal',
    p_terminal_name,
    p_terminal_model,
    'cloud'
  );
  
  RETURN json_build_object(
    'success', true,
    'terminal_id', v_terminal_id,
    'message', 'Terminal registered successfully'
  );
END;
$$;

-- Get decrypted terminal credentials (for API calls)
CREATE OR REPLACE FUNCTION get_terminal_credentials(
  p_terminal_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terminal RECORD;
  v_encryption_key TEXT;
  v_auth_key TEXT;
BEGIN
  -- Get encryption key
  v_encryption_key := current_setting('app.terminal_encryption_key', true);
  IF v_encryption_key IS NULL THEN
    v_encryption_key := 'dexa-pos-terminal-key-change-in-production';
  END IF;
  
  -- Verify user has access to this terminal
  SELECT 
    pt.*,
    pgp_sym_decrypt(pt.auth_key_encrypted, v_encryption_key) as decrypted_auth_key
  INTO v_terminal
  FROM payment_terminals pt
  WHERE pt.id = p_terminal_id
    AND pt.merchant_id IN (
      SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
    );
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Terminal not found or access denied'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'tpn', v_terminal.tpn,
    'auth_key', v_terminal.decrypted_auth_key,
    'api_environment', v_terminal.api_environment,
    'api_base_url', CASE 
      WHEN v_terminal.api_environment = 'production' 
      THEN 'https://api.spinpos.net'
      ELSE 'https://test.spinpos.net/spin'
    END,
    'spin_proxy_timeout', v_terminal.spin_proxy_timeout
  );
END;
$$;


-- Update terminal connection status
CREATE OR REPLACE FUNCTION update_terminal_status(
  p_terminal_id UUID,
  p_status TEXT,
  p_is_connected BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE payment_terminals
  SET 
    is_connected = p_is_connected,
    last_connection_test_at = NOW(),
    last_connection_status = p_status,
    updated_at = NOW()
  WHERE id = p_terminal_id
    AND merchant_id IN (
      SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
    );
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Terminal not found');
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;


-- ============================================================
-- Migration 007: Kitchen Status RPCs
-- ============================================================
-- File: supabase/migrations/007_kitchen_status_rpcs.sql

-- Update single item kitchen status
CREATE OR REPLACE FUNCTION update_order_item_kitchen_status(
  p_order_item_id UUID,
  p_kitchen_status TEXT,
  p_updated_by_station_id UUID DEFAULT NULL,
  p_fired_at TIMESTAMPTZ DEFAULT NULL,
  p_ready_at TIMESTAMPTZ DEFAULT NULL,
  p_served_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  UPDATE order_items
  SET 
    kitchen_status = p_kitchen_status,
    kitchen_status_updated_at = NOW(),
    kitchen_status_updated_by = p_updated_by_station_id,
    fired_at = COALESCE(p_fired_at, fired_at),
    ready_at = COALESCE(p_ready_at, ready_at),
    served_at = COALESCE(p_served_at, served_at),
    bump_count = bump_count + 1,
    -- Calculate actual prep time when ready
    actual_prep_time = CASE 
      WHEN p_ready_at IS NOT NULL AND fired_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (p_ready_at - fired_at))::INTEGER
      ELSE actual_prep_time
    END,
    updated_at = NOW()
  WHERE id = p_order_item_id
  RETURNING 
    id,
    order_id,
    kitchen_status,
    actual_prep_time,
    bump_count
  INTO v_result;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order item not found');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'order_item_id', v_result.id,
    'order_id', v_result.order_id,
    'kitchen_status', v_result.kitchen_status,
    'actual_prep_time', v_result.actual_prep_time,
    'bump_count', v_result.bump_count
  );
END;
$$;


-- Bulk update for bumping multiple items (common KDS action)
CREATE OR REPLACE FUNCTION bulk_update_kitchen_status(
  p_order_item_ids UUID[],
  p_status TEXT,
  p_updated_by_station_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  UPDATE order_items
  SET 
    kitchen_status = p_status,
    kitchen_status_updated_at = v_timestamp,
    kitchen_status_updated_by = p_updated_by_station_id,
    bump_count = bump_count + 1,
    fired_at = CASE WHEN p_status = 'sent' AND fired_at IS NULL THEN v_timestamp ELSE fired_at END,
    ready_at = CASE WHEN p_status = 'ready' THEN v_timestamp ELSE ready_at END,
    served_at = CASE WHEN p_status = 'served' THEN v_timestamp ELSE served_at END,
    actual_prep_time = CASE 
      WHEN p_status = 'ready' AND fired_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (v_timestamp - fired_at))::INTEGER
      ELSE actual_prep_time
    END,
    updated_at = v_timestamp
  WHERE id = ANY(p_order_item_ids);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'status', p_status,
    'updated_at', v_timestamp
  );
END;
$$;


-- Fire entire order to kitchen (send all items)
CREATE OR REPLACE FUNCTION fire_order_to_kitchen(
  p_order_id UUID,
  p_station_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  -- Update all 'new' items to 'sent'
  UPDATE order_items
  SET 
    kitchen_status = 'sent',
    kitchen_status_updated_at = v_timestamp,
    kitchen_status_updated_by = p_station_id,
    fired_at = v_timestamp,
    bump_count = bump_count + 1,
    updated_at = v_timestamp
  WHERE order_id = p_order_id
    AND kitchen_status = 'new'
    AND voided_at IS NULL;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Update order sent_to_kitchen_at if not already set
  UPDATE orders
  SET 
    sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, v_timestamp),
    updated_at = v_timestamp
  WHERE id = p_order_id;
  
  RETURN json_build_object(
    'success', true,
    'items_fired', v_updated_count,
    'fired_at', v_timestamp
  );
END;
$$;


-- Get KDS view for a location (all active orders)
CREATE OR REPLACE FUNCTION get_kds_orders(
  p_location_id UUID,
  p_kitchen_station TEXT DEFAULT NULL,
  p_statuses TEXT[] DEFAULT ARRAY['sent', 'preparing']
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(order_data)
    FROM (
      SELECT 
        o.id,
        o.order_number,
        o.display_number,
        o.order_type,
        o.table_number,
        o.customer_name,
        o.created_at,
        o.sent_to_kitchen_at,
        (
          SELECT json_agg(item_data ORDER BY oi.course_number, oi.created_at)
          FROM (
            SELECT 
              oi.id,
              oi.item_name,
              oi.quantity,
              oi.special_instructions,
              oi.kitchen_status,
              oi.kitchen_station,
              oi.course_number,
              oi.fired_at,
              oi.ready_at,
              EXTRACT(EPOCH FROM (NOW() - oi.fired_at))::INTEGER as elapsed_seconds,
              oi.estimated_prep_time,
              (
                SELECT json_agg(json_build_object(
                  'name', oim.modifier_name,
                  'quantity', oim.quantity
                ))
                FROM order_item_modifiers oim
                WHERE oim.order_item_id = oi.id
              ) as modifiers
            FROM order_items oi
            WHERE oi.order_id = o.id
              AND oi.kitchen_status = ANY(p_statuses)
              AND oi.voided_at IS NULL
              AND (p_kitchen_station IS NULL OR oi.kitchen_station = p_kitchen_station)
          ) item_data
        ) as items
      FROM orders o
      WHERE o.location_id = p_location_id
        AND o.status NOT IN ('completed', 'cancelled', 'voided')
        AND EXISTS (
          SELECT 1 FROM order_items oi 
          WHERE oi.order_id = o.id 
            AND oi.kitchen_status = ANY(p_statuses)
            AND oi.voided_at IS NULL
        )
      ORDER BY o.sent_to_kitchen_at ASC NULLS LAST, o.created_at ASC
    ) order_data
  );
END;
$$;


-- ============================================================
-- Migration 008: Station Heartbeat and Sync RPCs
-- ============================================================
-- File: supabase/migrations/008_station_sync_rpcs.sql

-- Register or update station
CREATE OR REPLACE FUNCTION register_station(
  p_location_id UUID,
  p_merchant_id UUID,
  p_device_id TEXT,
  p_station_name TEXT,
  p_station_type TEXT,
  p_hardware_model TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_station_id UUID;
  v_station_number INTEGER;
  v_is_new BOOLEAN := FALSE;
BEGIN
  -- Check if station already exists for this device
  SELECT id INTO v_station_id
  FROM stations
  WHERE device_id = p_device_id;
  
  IF v_station_id IS NULL THEN
    -- Get next station number for this location
    SELECT COALESCE(MAX(station_number), 0) + 1 INTO v_station_number
    FROM stations
    WHERE location_id = p_location_id;
    
    -- Create new station
    INSERT INTO stations (
      location_id,
      merchant_id,
      device_id,
      station_name,
      station_type,
      station_number,
      hardware_model,
      app_version,
      ip_address,
      is_online,
      last_heartbeat_at
    ) VALUES (
      p_location_id,
      p_merchant_id,
      p_device_id,
      p_station_name,
      p_station_type,
      v_station_number,
      p_hardware_model,
      p_app_version,
      p_ip_address,
      TRUE,
      NOW()
    )
    RETURNING id INTO v_station_id;
    
    v_is_new := TRUE;
  ELSE
    -- Update existing station
    UPDATE stations
    SET 
      station_name = p_station_name,
      station_type = p_station_type,
      hardware_model = COALESCE(p_hardware_model, hardware_model),
      app_version = COALESCE(p_app_version, app_version),
      ip_address = COALESCE(p_ip_address, ip_address),
      is_online = TRUE,
      last_heartbeat_at = NOW(),
      updated_at = NOW()
    WHERE id = v_station_id;
  END IF;
  
  -- Return full station record
  RETURN (
    SELECT json_build_object(
      'success', true,
      'is_new', v_is_new,
      'station', row_to_json(s)
    )
    FROM stations s
    WHERE s.id = v_station_id
  );
END;
$$;


-- Station heartbeat
CREATE OR REPLACE FUNCTION station_heartbeat(
  p_station_id UUID,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE stations
  SET 
    is_online = TRUE,
    last_heartbeat_at = NOW(),
    ip_address = COALESCE(p_ip_address, ip_address)
  WHERE id = p_station_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Station not found');
  END IF;
  
  RETURN json_build_object('success', true, 'heartbeat_at', NOW());
END;
$$;


-- Get all online stations for a location (for local sync discovery)
CREATE OR REPLACE FUNCTION get_location_stations(
  p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(s))
    FROM stations s
    WHERE s.location_id = p_location_id
      AND s.is_active = TRUE
      AND s.is_online = TRUE
      AND s.last_heartbeat_at > NOW() - INTERVAL '2 minutes'
  );
END;
$$;


-- Mark stations offline if no heartbeat (run via cron)
CREATE OR REPLACE FUNCTION mark_stale_stations_offline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE stations
  SET is_online = FALSE
  WHERE is_online = TRUE
    AND last_heartbeat_at < NOW() - INTERVAL '2 minutes';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ============================================================
-- Migration 009: Order Checksum for Reconciliation
-- ============================================================
-- File: supabase/migrations/009_order_checksum_rpc.sql

CREATE OR REPLACE FUNCTION get_order_checksum(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'order_id', o.id,
    'item_count', (
      SELECT COUNT(*) 
      FROM order_items 
      WHERE order_id = p_order_id AND voided_at IS NULL
    ),
    'item_ids', (
      SELECT COALESCE(string_agg(id::text, ',' ORDER BY id), '')
      FROM order_items 
      WHERE order_id = p_order_id AND voided_at IS NULL
    ),
    'subtotal', o.subtotal,
    'tax_amount', o.tax_amount,
    'total_amount', o.total_amount,
    'discount_amount', o.discount_amount,
    'status', o.status,
    'payment_status', o.payment_status,
    'amount_paid', o.amount_paid,
    'amount_due', o.amount_due,
    'sync_version', o.sync_version,
    'updated_at', o.updated_at
  )
  INTO v_result
  FROM orders o
  WHERE o.id = p_order_id;
  
  RETURN v_result;
END;
$$;
