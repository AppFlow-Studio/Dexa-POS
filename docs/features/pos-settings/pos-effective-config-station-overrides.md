# POS/Web Location POS Settings + Station Overrides

## Summary

Ticket: set a location's POS config once in `locations.pos_config`, let stations inherit it, and add `stations.pos_config_overrides` plus an effective-config resolver.

This change covers the POS/schema side only. Web dashboard settings UI is out of this branch scope because it is being handled separately.

## Scope

- Add `stations.pos_config_overrides jsonb NOT NULL DEFAULT '{}'`.
- Add `get_effective_pos_config(p_station_id)` so POS can load station-effective config.
- Add guarded `update_station_pos_config_overrides(p_station_id, p_overrides)` for station override writes.
- Wire POS config sync to call the station-effective resolver when a station is selected.
- Keep fallback to the legacy `locations.pos_config` read for environments where the migration has not been applied yet.
- Add client-side deep merge utility matching server precedence.

Non-scope:

- Web dashboard settings UI.
- Migrating KDS display-specific settings.
- Moving printer, terminal, drawer, capability, or station hardware assignments into JSON.
- Reworking the existing location-level `update_location_pos_config` write path.

## Plan

- Create a Supabase migration for the station override column and resolver RPC.
- Use a recursive deep merge so nested station overrides do not replace whole config namespaces.
- Preserve legacy dining/KDS fallback behavior from `public_metadata.dining_settings` and `locations.kds_workflow_mode`.
- Resolve client config as defaults -> location/effective config -> station overrides.
- Update POS sync entry points to include the selected station ID.
- Add targeted unit tests for client config merge behavior.

## Progress

- Added migration `supabase/migrations/20260630120000_station_pos_config_overrides.sql`.
- Added `lib/posConfigResolution.ts` with shared deep-merge/effective-config utility.
- Added deep-partial config types in `types/locationConfig.ts`.
- Updated `services/locationConfigSync.ts` to call `get_effective_pos_config` when `stationId` exists and fall back to the old location-only read if needed.
- Updated `contexts/PosSyncProvider.tsx` so location config sync re-runs on station switch.
- Updated `app/(main)/kds.tsx` manual refresh to request station-effective config.
- Updated `database.types.ts` with the new station column and RPC signatures.
- Added `__tests__/pos-config-resolution.test.ts`.

## Verification

Targeted automated verification to run:

```powershell
npx jest --runTestsByPath __tests__/pos-config-resolution.test.ts
```

Recommended Supabase verification after applying migration:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stations'
  AND column_name = 'pos_config_overrides';

SELECT public.get_effective_pos_config('<station_id>'::uuid);
```

## Files

- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- `lib/posConfigResolution.ts`
- `types/locationConfig.ts`
- `services/locationConfigSync.ts`
- `contexts/PosSyncProvider.tsx`
- `app/(main)/kds.tsx`
- `database.types.ts`
- `__tests__/pos-config-resolution.test.ts`
- `tasks/pos-effective-config-station-overrides.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Open QA

- Apply migration on staging.
- Confirm `stations.pos_config_overrides` defaults to `{}` for existing and new stations.
- Confirm `get_effective_pos_config` returns defaults plus `locations.pos_config`.
- Add one station override for a nested key and confirm only that station sees it.
- Confirm sibling stations still inherit the location default.
- Confirm station switching in POS rehydrates the correct effective config.
- Confirm previously non-persisting controls survive restart once the web settings UI is wired to `locations.pos_config`.
