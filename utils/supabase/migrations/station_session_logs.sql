-- ============================================================
-- Migration 014: Session Audit Log
-- ============================================================
-- File: supabase/migrations/014_session_audit_log.sql

CREATE TABLE IF NOT EXISTS station_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES station_sessions(id),
  station_id UUID NOT NULL REFERENCES stations(id),
  device_id TEXT NOT NULL,
  
  -- Event info
  event_type TEXT NOT NULL,                            -- started | ended | kicked | expired | heartbeat_missed
  event_details JSONB DEFAULT '{}',
  
  -- Staff
  staff_id UUID REFERENCES staff_profiles(id),
  staff_name TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying logs
CREATE INDEX idx_session_logs_station ON station_session_logs(station_id, created_at DESC);
CREATE INDEX idx_session_logs_device ON station_session_logs(device_id, created_at DESC);

-- Trigger to auto-log session changes
CREATE OR REPLACE FUNCTION log_session_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO station_session_logs (
      session_id, station_id, device_id, event_type, 
      event_details, staff_id, staff_name
    ) VALUES (
      NEW.id, NEW.station_id, NEW.device_id, 'started',
      json_build_object('device_name', NEW.device_name, 'ip_address', NEW.ip_address::text),
      NEW.staff_id, NEW.staff_name
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status != 'active' THEN
    INSERT INTO station_session_logs (
      session_id, station_id, device_id, event_type,
      event_details, staff_id, staff_name
    ) VALUES (
      NEW.id, NEW.station_id, NEW.device_id, NEW.status,
      json_build_object(
        'duration_minutes', EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60,
        'kick_reason', NEW.kick_reason,
        'kicked_by', NEW.kicked_by_device_id
      ),
      NEW.staff_id, NEW.staff_name
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_session_changes
  AFTER INSERT OR UPDATE ON station_sessions
  FOR EACH ROW EXECUTE FUNCTION log_session_changes();


-- ============================================================
-- Migration 015: Supabase Cron Jobs for Session Cleanup
-- ============================================================
-- File: supabase/migrations/015_session_cron_jobs.sql

-- NOTE: Run these in Supabase Dashboard > SQL Editor
-- Requires pg_cron extension (usually enabled by default)

-- Enable pg_cron if not already
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Expire stale sessions every minute
-- SELECT cron.schedule(
--   'expire-stale-sessions',
--   '* * * * *',  -- Every minute
--   $$SELECT expire_stale_sessions()$$
-- );

-- Cleanup old notifications every hour
-- SELECT cron.schedule(
--   'cleanup-session-notifications',
--   '0 * * * *',  -- Every hour
--   $$SELECT cleanup_old_session_notifications()$$
-- );

-- Mark stale stations offline every 2 minutes
-- SELECT cron.schedule(
--   'mark-stale-stations-offline',
--   '*/2 * * * *',  -- Every 2 minutes
--   $$SELECT mark_stale_stations_offline()$$
-- );








