-- Migration: Backfill pos_config.ordering and pos_config.security
--
-- Both settings ("Auto Create Order" and "Manager Override Timeout") rendered in
-- the POS Settings UI but had no pos_config key, so they were written to
-- device-local MMKV only. Consequences:
--   * Auto Create Order did not survive an app reinstall (nothing server-side to
--     restore from) and never propagated to other stations.
--   * Manager Override Timeout was likewise per-device.
--
-- No schema change is required: pos_config is JSONB and
-- update_location_pos_config() accepts any namespace. This migration only
-- backfills the two blocks so the keys are present and versioned immediately,
-- rather than appearing on a location's first write from the tablet.
--
-- Defaults deliberately match the previous device-local defaults so no merchant
-- sees a behavior change on deploy:
--   ordering.autoCreateOrder            = true  (legacy auto-create behavior)
--   security.managerOverrideTimeoutMinutes = 0  (always require PIN)

-- Single atomic statement: fill both namespaces, stamp _updated_at, and bump
-- _version (tablets use _version as the sync trigger) only for rows that were
-- actually missing a block.
UPDATE locations
SET pos_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            pos_config,
            '{ordering}',
            -- Existing values win, so a hand-set value is never clobbered.
            jsonb_build_object('autoCreateOrder', true)
              || COALESCE(pos_config->'ordering', '{}'::jsonb)
          ),
          '{security}',
          jsonb_build_object('managerOverrideTimeoutMinutes', 0)
            || COALESCE(pos_config->'security', '{}'::jsonb)
        ),
        '{_updated_at}',
        to_jsonb(now()::text)
      ),
      '{_version}',
      to_jsonb(COALESCE((pos_config->>'_version')::int, 0) + 1)
    ),
    updated_at = now()
WHERE NOT (pos_config ? 'ordering')
   OR NOT (pos_config ? 'security');
