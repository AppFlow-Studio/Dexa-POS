-- ============================================================
-- Migration 010: Create Station Sessions Table
-- ============================================================
-- File: supabase/migrations/010_create_station_sessions.sql

CREATE TABLE IF NOT EXISTS station_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core References
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  
  -- Device Identification
  device_id TEXT NOT NULL,                              -- Hardware UUID from MMKV
  device_name TEXT,                                     -- "John's iPad", "Front Register iPad"
  device_model TEXT,                                    -- "iPad Pro 11-inch"
  device_os TEXT,                                       -- "iOS 17.2"
  app_version TEXT,                                     -- "1.2.3"
  
  -- Session Token (used to validate requests)
  session_token UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Staff Info (who logged into this session)
  staff_id UUID REFERENCES staff_profiles(id),
  staff_name TEXT,
  
  -- Session Status
  status TEXT NOT NULL DEFAULT 'active',               -- active | expired | kicked | ended
  
  -- Heartbeat & Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  ended_at TIMESTAMPTZ,
  
  -- Kick Info (if session was terminated by another device)
  kicked_by_device_id TEXT,
  kicked_by_session_id UUID,
  kick_reason TEXT,
  
  -- Network Info
  ip_address INET,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_session_status CHECK (status IN ('active', 'expired', 'kicked', 'ended'))
);

-- Indexes
CREATE INDEX idx_station_sessions_station_active 
  ON station_sessions(station_id, status) 
  WHERE status = 'active';

CREATE INDEX idx_station_sessions_device_active 
  ON station_sessions(device_id, status) 
  WHERE status = 'active';

CREATE INDEX idx_station_sessions_token 
  ON station_sessions(session_token) 
  WHERE status = 'active';

CREATE INDEX idx_station_sessions_expires 
  ON station_sessions(expires_at) 
  WHERE status = 'active';

CREATE INDEX idx_station_sessions_location 
  ON station_sessions(location_id, status);

-- Auto-update timestamp trigger
CREATE TRIGGER trg_station_sessions_updated_at
  BEFORE UPDATE ON station_sessions
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();


-- Only ONE active session per station (prevents race conditions)
CREATE UNIQUE INDEX idx_station_sessions_active_station 
  ON station_sessions(station_id) 
  WHERE session_status = 'active';

-- Only ONE active session per device (device can only be at one station)
CREATE UNIQUE INDEX idx_station_sessions_active_device 
  ON station_sessions(device_id) 
  WHERE session_status = 'active';