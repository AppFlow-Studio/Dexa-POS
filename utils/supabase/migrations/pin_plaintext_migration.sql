-- ============================================================
-- MIGRATION: Add pin_plain column for instant PIN validation
--
-- Bcrypt PIN hashing provides no meaningful security for 4-digit PINs
-- (only 10K possibilities). Storing plain PINs enables:
-- 1. Instant synchronous local matching (no async bcrypt loop)
-- 2. Faster server-side lookups (indexed equality vs crypt())
--
-- Migration strategy: dual-path. Existing bcrypt hashes remain.
-- On next successful login, pin_plain is auto-populated.
-- ============================================================

-- Add plain-text PIN column
ALTER TABLE location_members ADD COLUMN IF NOT EXISTS pin_plain TEXT;

-- Index for fast PIN lookups by location
CREATE INDEX IF NOT EXISTS idx_location_members_pin_plain
  ON location_members (location_id, pin_plain)
  WHERE is_active = true AND pin_plain IS NOT NULL;
