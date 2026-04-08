-- Migration: Add pos_config JSONB column to locations table
-- Purpose: Unified, namespaced, per-location POS configuration
-- Replaces fragmented storage across public_metadata.dining_settings, kds_workflow_mode, etc.

-- Step 1: Add the column
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pos_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: Data migration — copy existing dining_settings from public_metadata
UPDATE locations
SET pos_config = jsonb_set(
  pos_config,
  '{dining}',
  COALESCE(public_metadata->'dining_settings', '{}'::jsonb)
)
WHERE public_metadata ? 'dining_settings';

-- Step 3: Data migration — copy kds_workflow_mode into pos_config.kds
UPDATE locations
SET pos_config = jsonb_set(
  pos_config,
  '{kds}',
  jsonb_build_object('workflowMode', COALESCE(kds_workflow_mode, '2-step'))
)
WHERE kds_workflow_mode IS NOT NULL;

-- Step 4: RPC for atomic namespace merge
-- Uses jsonb_set to merge one namespace at a time, avoiding read-then-write races.
CREATE OR REPLACE FUNCTION update_location_pos_config(
  p_location_id UUID,
  p_namespace TEXT,
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing JSONB;
  v_merged JSONB;
  v_result JSONB;
BEGIN
  -- Get existing config for this namespace (or empty object)
  SELECT COALESCE(pos_config->p_namespace, '{}'::jsonb)
  INTO v_existing
  FROM locations
  WHERE id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  -- Deep merge: existing namespace values || new values (new wins on conflict)
  v_merged := v_existing || p_config;

  -- Atomic update with metadata
  UPDATE locations
  SET pos_config = jsonb_set(
    jsonb_set(
      jsonb_set(pos_config, ARRAY[p_namespace], v_merged),
      '{_updated_at}',
      to_jsonb(now()::text)
    ),
    '{_version}',
    to_jsonb(COALESCE((pos_config->>'_version')::int, 0) + 1)
  ),
  updated_at = now()
  WHERE id = p_location_id
  RETURNING pos_config INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (RLS on locations table still applies)
GRANT EXECUTE ON FUNCTION update_location_pos_config(UUID, TEXT, JSONB) TO authenticated;
