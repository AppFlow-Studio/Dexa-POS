-- Smart Wait Time Estimation Feature
-- This migration documents the required schema for the wait time estimation feature.
-- The following columns should already exist in the waitlist table:
-- - quoted_wait_minutes (integer) - staff's quoted wait time
-- - estimated_ready_at (timestamp) - calculated ready time
-- - actual_wait_minutes (integer) - actual time waited when seated
-- 
-- The table_metrics table should have:
-- - avg_turn_time (numeric) - average time from seated to check presented
-- - avg_time_to_order (numeric)
-- - avg_time_to_food (numeric)
-- - avg_time_to_check (numeric)
--
-- If these columns are missing, run the following ALTER statements:

-- ALTER TABLE waitlist
-- ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP,
-- ADD COLUMN IF NOT EXISTS actual_wait_minutes INTEGER;

-- The following fields are needed for proper tracking:
-- 1. waitlist.seated_at - timestamp when party was seated (should exist from table_sessions link)
-- 2. waitlist.created_at - when party was added to waitlist (should already exist)

-- These columns already exist based on the codebase types:
-- - quote_wait_minutes
-- - estimated_ready_at
-- - actual_wait_minutes

-- No migration needed - the schema is already correct.
-- The feature uses direct UPDATE calls via FloorPlanService.recordWaitAccuracy()

-- For the add_to_waitlist RPC, ensure it accepts p_estimated_ready_at parameter:
-- Function signature should include:
-- CREATE OR REPLACE FUNCTION add_to_waitlist (
--   p_location_id uuid,
--   p_party_name text,
--   p_party_size integer,
--   p_phone text,
--   p_email text,
--   p_notes text,
--   p_preferred_section text,
--   p_seating_preference text,
--   p_quoted_wait_minutes integer,
--   p_estimated_ready_at timestamp
-- )
