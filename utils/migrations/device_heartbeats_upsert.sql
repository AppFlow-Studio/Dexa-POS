-- migration: device_heartbeats_upsert.sql
-- Converts device_heartbeats from append-only log to single-row-per-station.
-- Uptime is calculated as updated_at - created_at on the upserted row.

-- 1. Add created_at and updated_at columns
ALTER TABLE public.device_heartbeats
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Deduplicate existing rows, keeping only the most recent per station
DELETE FROM public.device_heartbeats
WHERE id NOT IN (
  SELECT DISTINCT ON (station_id) id
  FROM public.device_heartbeats
  ORDER BY station_id, COALESCE(heartbeat_at, created_at) DESC NULLS LAST
);

-- 3. Add unique constraint on station_id (required for upsert onConflict)
ALTER TABLE public.device_heartbeats
  ADD CONSTRAINT device_heartbeats_station_id_key UNIQUE (station_id);

-- 4. Auto-update updated_at on every row update
CREATE EXTENSION IF NOT EXISTS moddatetime;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.device_heartbeats
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
