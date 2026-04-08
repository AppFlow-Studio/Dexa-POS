-- ============================================================
-- Migration: Extend station_devices for POS Device Login Logging
-- ============================================================
-- Adds columns to track device logins as append-only log entries.
-- New device_type 'pos_device' rows are inserted on every login
-- via pos_staff_login_v2, linking device → station → session.
-- Existing peripheral rows are unaffected (new columns are nullable).

-- Add new columns for device login logging
ALTER TABLE station_devices
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff_profiles(id),
  ADD COLUMN IF NOT EXISTS staff_name TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES station_sessions(id),
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS os_version TEXT,
  ADD COLUMN IF NOT EXISTS ip_address INET;

-- Update CHECK constraint on device_type to include 'pos_device'
ALTER TABLE station_devices
  DROP CONSTRAINT IF EXISTS chk_device_type;

ALTER TABLE station_devices
  ADD CONSTRAINT chk_device_type CHECK (device_type IN (
    'payment_terminal', 'receipt_printer', 'label_printer',
    'kitchen_printer', 'cash_drawer', 'barcode_scanner',
    'scale', 'customer_display', 'pos_device'
  ));

-- Partial indexes for querying pos_device log entries
CREATE INDEX IF NOT EXISTS idx_station_devices_pos_device_station
  ON station_devices (station_id, created_at DESC)
  WHERE device_type = 'pos_device';

CREATE INDEX IF NOT EXISTS idx_station_devices_pos_device_id
  ON station_devices (device_id, created_at DESC)
  WHERE device_type = 'pos_device';
