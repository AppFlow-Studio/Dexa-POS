# POS Menu Rail Channel Visibility

## Summary

Allow a menu to remain active for online ordering while being excluded from POS
order entry. Saucy's `Whole Menu` is the first data correction: it must remain
available to OrderOut but disappear from the POS and kiosk rails.

Notion ticket:
`https://app.notion.com/3be8280c1b1d8188a9e8db438d92667a`

## Scope

- Add inherited menu channel configuration for `pos`, `online`, and `kiosk`.
- Add channel-filtered, versioned wrappers around the existing menu RPCs.
- Select the sync channel from the active station type.
- Partition TanStack and offline menu snapshots by channel.
- Block removing `online` from an active primary OrderOut menu in the database.
- Set Saucy's `Whole Menu` to online-only after schema/RPC deployment.

## Non-Scope

- Website checkbox layout and interaction implementation.
- Charcoal Gardenia's `Whole Menu` data until merchant confirmation.
- The existing `location_menus.is_active` additive-OR behavior.
- Item-level `available_channels` enforcement.

## Plan

1. Add menu and location-override channel columns with validation.
2. Add additive channel-aware sync RPCs without replacing live RPC definitions.
3. Add a guarded channel-update RPC for the website menu editor.
4. Resolve POS versus kiosk channel from the selected station.
5. Partition query and offline cache keys by location plus channel.
6. Add focused contract, resolver, and cache-isolation tests.
7. Apply the Saucy online-only data migration and run cross-surface QA.

## Progress

- [x] Existing `is_active` workaround reviewed and rejected as insufficient.
- [x] Primary, legacy, standalone, kiosk, and offline paths mapped.
- [x] Schema and RPC migration implemented.
- [x] POS channel selection and cache isolation implemented.
- [x] Standalone menu-library merge made channel-aware.
- [x] Focused automated verification complete.
- [ ] Migrations deployed to the target environment.
- [ ] Website controls and POS/kiosk/OrderOut QA complete.

## Verification

- `npx jest __tests__/menuChannelVisibility.test.ts __tests__/menuOfflineCache.test.ts __tests__/aud1BootMenuSnapshot.test.ts --runInBand`:
  3 suites and 19 tests passed.
- Targeted ESLint: zero errors.
- `git diff --check`: passed.
- Static migration tests cover defaults, inheritance, the primary OrderOut
  guard, the standalone-library path, and the Saucy data correction.
- The configured local Supabase project does not contain the Saucy merchant.
  Verify the data migration in the target environment containing merchant
  `33b2baaf-ae79-4e02-a489-52163a447b57`.

## Files

- `supabase/migrations/20260817120000_menu_available_channels.sql`
- `supabase/migrations/20260817121000_saucy_whole_menu_online_only.sql`
- `hooks/pos/usePosSync.ts`
- `hooks/pos/useStandaloneSync.ts`
- `contexts/PosSyncProvider.tsx`
- `stores/menuOfflineCache.ts`
- `stores/useMenuStore.ts`
- `lib/menu/menuChannel.ts`
- `types/menu.ts`
- `lib/types.ts`
- `__tests__/menuChannelVisibility.test.ts`
- `__tests__/menuOfflineCache.test.ts`
- `__tests__/aud1BootMenuSnapshot.test.ts`
- `docs/features/menu-management/pos-menu-channel-visibility.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

1. Apply `20260817120000_menu_available_channels.sql`, then
   `20260817121000_saucy_whole_menu_online_only.sql` to the target Supabase
   project.
2. Confirm the remediation affected the intended row:

```sql
SELECT id, merchant_id, name, is_active, available_channels
FROM public.menus
WHERE id = 'd98830ee-bf56-4200-82e2-7ad221dc2048'::uuid;
-- Expected available_channels: ["online"]
```

3. Verify Saucy's online-only `Whole Menu` is absent on POS and kiosk stations.
4. Verify Saucy OrderOut still serves `Whole Menu` as its primary menu.
5. Configure a disposable menu as kiosk-only and verify it appears on kiosk but
   not POS.
6. Verify an offline restart never hydrates another channel's cached menu.
7. Ring `CRISPY CHICKEN SANDWICH` through its remaining POS path and confirm
   `$11.00` card / `$10.57` cash.
8. Record portal-to-tablet synchronization and obtain independent sign-off.

Website work remains separate: add inherited POS/Online/Kiosk controls and call
`set_menu_available_channels_v1`. Do not mark the cross-repo ticket Done until
the website work and manual QA are complete.
