-- ============================================================
-- Migration: Clean Up station_devices & Create device_login_history
-- ============================================================
-- Problem: station_devices was designed for peripherals but was extended
-- to log POS device logins as append-only rows. Every login inserts a new
-- row with is_connected = TRUE that is never updated, causing stale rows.
--
-- Solution:
-- A. Create device_login_history table (audit trail)
-- B. Migrate existing pos_device rows → device_login_history
-- C. Deduplicate station_devices (keep 1 pos_device row per device)
-- D. Add unique partial index to prevent future duplicates
-- E. Create trigger to sync is_connected on session end
-- ============================================================


-- ============================================================
-- A. Create device_login_history table
-- ============================================================

CREATE TABLE IF NOT EXISTS device_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES station_sessions(id) ON DELETE SET NULL,

  -- Device info
  device_id TEXT NOT NULL,
  device_name TEXT,
  device_model TEXT,

  -- Who logged in
  staff_id UUID REFERENCES staff_profiles(id),
  staff_name TEXT,

  -- Device state at login
  app_version TEXT,
  os_version TEXT,
  ip_address INET,

  -- Login/logout tracking
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ,
  logout_reason TEXT,  -- 'logout' | 'kicked' | 'ended' | 'expired'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_logout_reason CHECK (
    logout_reason IS NULL OR logout_reason IN ('logout', 'kicked', 'ended', 'expired')
  )
);

-- Indexes
CREATE INDEX idx_device_login_history_station
  ON device_login_history (station_id, logged_in_at DESC);

CREATE INDEX idx_device_login_history_device
  ON device_login_history (device_id, logged_in_at DESC);

CREATE INDEX idx_device_login_history_active_session
  ON device_login_history (session_id)
  WHERE logged_out_at IS NULL;

-- RLS
ALTER TABLE device_login_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their device login history"
  ON device_login_history FOR SELECT
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Merchants can manage their device login history"
  ON device_login_history FOR ALL
  USING (merchant_id IN (
    SELECT merchant_id FROM staff_profiles WHERE user_id = auth.uid()
  ));


-- ============================================================
-- B. Migrate existing pos_device rows → device_login_history
-- ============================================================

INSERT INTO device_login_history (
  station_id, merchant_id, location_id, session_id,
  device_id, device_name, device_model,
  staff_id, staff_name,
  app_version, os_version, ip_address,
  logged_in_at, logged_out_at, logout_reason,
  created_at
)
SELECT
  sd.station_id, sd.merchant_id, sd.location_id, sd.session_id,
  COALESCE(sd.device_id, 'unknown'), sd.device_name, sd.device_model,
  sd.staff_id, sd.staff_name,
  sd.app_version, sd.os_version, sd.ip_address,
  sd.created_at,  -- logged_in_at = when the row was created
  -- If session is no longer active, use its ended_at as logged_out_at
  ss.ended_at,
  -- Map session status to logout_reason
  CASE
    WHEN ss.session_status = 'kicked' THEN 'kicked'
    WHEN ss.session_status = 'ended' THEN 'ended'
    WHEN ss.session_status = 'expired' THEN 'expired'
    ELSE NULL  -- still active or no session
  END,
  sd.created_at
FROM station_devices sd
LEFT JOIN station_sessions ss ON ss.id = sd.session_id
WHERE sd.device_type = 'pos_device';


-- ============================================================
-- C. Deduplicate station_devices
-- ============================================================

-- Delete all but the most recent pos_device row per (station_id, device_id)
DELETE FROM station_devices
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY station_id, device_id
        ORDER BY created_at DESC
      ) AS rn
    FROM station_devices
    WHERE device_type = 'pos_device'
  ) ranked
  WHERE rn > 1
);

-- Fix is_connected based on actual session status
UPDATE station_devices sd
SET is_connected = (
  ss.id IS NOT NULL AND ss.session_status = 'active'
)
FROM station_devices sd2
LEFT JOIN station_sessions ss ON ss.id = sd2.session_id
WHERE sd.id = sd2.id
  AND sd.device_type = 'pos_device';


-- ============================================================
-- D. Add unique partial index (prevent future duplicates)
-- ============================================================

-- Drop old append-only indexes (no longer needed)
DROP INDEX IF EXISTS idx_station_devices_pos_device_station;
DROP INDEX IF EXISTS idx_station_devices_pos_device_id;

-- One pos_device row per (station_id, device_id)
CREATE UNIQUE INDEX idx_station_devices_pos_device_unique
  ON station_devices (station_id, device_id)
  WHERE device_type = 'pos_device';


-- ============================================================
-- E. Create trigger: sync device on session end
-- ============================================================

CREATE OR REPLACE FUNCTION sync_device_on_session_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when session_status changes from 'active' to a terminal state
  IF OLD.session_status = 'active'
    AND NEW.session_status IN ('kicked', 'ended', 'expired')
  THEN
    -- Mark the device as disconnected in station_devices
    UPDATE station_devices
    SET is_connected = FALSE,
        last_seen_at = NOW(),
        updated_at = NOW()
    WHERE session_id = NEW.id
      AND device_type = 'pos_device';

    -- Close the login history entry
    UPDATE device_login_history
    SET logged_out_at = NOW(),
        logout_reason = NEW.session_status
    WHERE session_id = NEW.id
      AND logged_out_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to station_sessions
DROP TRIGGER IF EXISTS trg_sync_device_on_session_end ON station_sessions;

CREATE TRIGGER trg_sync_device_on_session_end
  AFTER UPDATE ON station_sessions
  FOR EACH ROW
  WHEN (OLD.session_status IS DISTINCT FROM NEW.session_status)
  EXECUTE FUNCTION sync_device_on_session_end();
