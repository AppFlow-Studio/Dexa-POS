CREATE TABLE IF NOT EXISTS station_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What's being claimed
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  
  -- Device claiming the station
  device_id TEXT NOT NULL,                              -- Hardware UUID
  device_name TEXT,                                     -- "Front Register iPad"
  device_model TEXT,                                    -- "iPad Pro 11"
  
  -- Staff member (can change via switch_staff without new session)
  staff_profile_id UUID REFERENCES staff_profiles(id),
  staff_name TEXT,                                      -- For display
  
  -- Session state
  session_status TEXT NOT NULL DEFAULT 'active',        -- active | kicked | ended
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),           -- Updated on orders, not for expiration
  
  -- If kicked, who kicked them
  kicked_by_device_id TEXT,
  kicked_by_staff_name TEXT,
  kick_reason TEXT,
  
  -- Constraints
  CONSTRAINT chk_session_status CHECK (session_status IN ('active', 'kicked', 'ended'))
);

-- CRITICAL: Only ONE active session per station
CREATE UNIQUE INDEX idx_station_sessions_active_station 
  ON station_sessions(station_id) 
  WHERE session_status = 'active';

-- Only ONE active session per device
CREATE UNIQUE INDEX idx_station_sessions_active_device 
  ON station_sessions(device_id) 
  WHERE session_status = 'active';

-- For history queries
CREATE INDEX idx_station_sessions_station_history ON station_sessions(station_id, started_at DESC);
CREATE INDEX idx_station_sessions_location ON station_sessions(location_id) WHERE session_status = 'active';

