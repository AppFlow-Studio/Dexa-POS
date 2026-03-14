-- Migration: kds_sound_config.sql
-- Add JSONB sound_config column to kds_displays for per-source sound presets

ALTER TABLE kds_displays
  ADD COLUMN IF NOT EXISTS sound_config JSONB DEFAULT NULL;

COMMENT ON COLUMN kds_displays.sound_config IS
'Per-order-source sound presets for KDS notifications. Schema: { enabled, pos, online, kiosk, third_party, default }';
