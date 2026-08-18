# POS Single-Location Menu Framing

## Summary

Suppress `Global` / `All Locations` menu-management framing when the signed-in
POS identity can access exactly one active location. Single-location merchants
must see a normal `Menu` experience and may edit the shared core menu records.

Status: POS code complete; emulator/tablet and staging data verification remain.

## Scope

In scope:

- Resolve single-location state for merchant admins and location-restricted
  staff using active locations only.
- Hide the remaining modifier-library `Global` badge for single-location POS
  users.
- Preserve direct core editing for global menu, category, item, and modifier
  records when single-location state is positively resolved.
- Preserve the existing multi-location read-only/override behavior.

Out of scope:

- Website changes; the website portion is already implemented separately.
- Backfilling or deleting existing location override rows.
- Changing 86/out-of-stock behavior. Availability remains a per-location
  override even for a single-location merchant so POS and website stay aligned.
- Database schema or RPC changes.

## Plan

1. Audit current POS menu framing and the existing single-location hook.
2. Match the resolver contract used by the website: merchant admins count all
   active merchant locations; other staff count active accessible locations.
3. Fail closed while loading or on error so a multi-location user is never
   allowed to edit shared core data accidentally.
4. Remove single-location-only scope wording without changing multi-location
   behavior.
5. Add focused resolver tests and complete on-device QA.

## Progress

- Confirmed that staging already contained a partial POS implementation in the
  menu list and four full edit screens.
- Found that the old hook only called `get_user_accessible_locations`, which can
  return zero rows for a merchant owner/admin and can therefore misclassify the
  account.
- Added a merchant-aware resolver using `is_merchant_admin`.
- Admins now count all active rows in `locations` for the selected merchant.
- Non-admin staff now count active locations intersected with
  `get_user_accessible_locations`.
- Removed the visible `Global` badge from core modifier groups only when the
  resolver positively confirms one active location.
- Added a neutral loading state so single-location users do not briefly see the
  multi-location `Global` screen or badge while scope resolution is pending.
- Preserved the later fix that routes global-item availability through
  `set_item_snooze_v1`; this is intentionally not a core menu-content edit.

## Verification

Automated verification completed:

- `npx jest __tests__/singleLocationScope.test.ts --runInBand --forceExit`
  passed 5 tests.
- `npx eslint lib/menu/singleLocationScope.ts hooks/pos/useIsSingleLocation.ts components/menu/MenuScopeLoadingScreen.tsx __tests__/singleLocationScope.test.ts`
  passed.
- Targeted TypeScript diagnostics passed for all 9 changed TS/TSX files.
- `git diff --check` passed.
- Whole-file lint of the legacy menu screens still reports their existing
  `react/display-name` / quote-escaping errors and warnings. Comparison against
  `origin/staging` confirmed this ticket did not introduce them.

## Files

- `lib/menu/singleLocationScope.ts`
- `hooks/pos/useIsSingleLocation.ts`
- `app/(main)/menu/index.tsx`
- `app/(main)/menu/edit-menu.tsx`
- `app/(main)/menu/edit-category.tsx`
- `app/(main)/menu/edit-item.tsx`
- `app/(main)/menu/edit-modifier.tsx`
- `components/menu/MenuScopeLoadingScreen.tsx`
- `__tests__/singleLocationScope.test.ts`
- `tasks/pos-single-location-menu-framing.md`
- `tasks/ticket-log.md`

## Open QA

### Single-location POS

1. Use a staging merchant with exactly one active location. Prefer an owner or
   admin who has no explicit `location_members` row because that covers the
   original resolver gap.
2. Restart the development build, sign in, select its station, and open POS
   Menu Management.
3. Check Menus, Categories, Items, and Modifiers. No `Global` or
   `All Locations` scope wording should appear.
4. Open one core menu, category, item, and modifier. Each should open the normal
   editor, not the read-only `Global ...` screen.
5. On staging, make a harmless full-form item edit, save, refresh/sync, and
   confirm the change persists.
6. Verify in Supabase that the edited record still has `location_id IS NULL`.
   Confirm the edit did not create a new `location_item_overrides` row.
7. Toggle 86/out-of-stock separately and confirm that action still uses the
   location override. This is expected and must not be treated as a failure of
   the core-edit rule.

### Multi-location regression

1. Sign in to a merchant/admin account with at least two active locations.
2. Confirm location/global framing remains visible where it existed before.
3. Open a global menu entity and confirm the full editor remains read-only.
4. Confirm location-owned entities and per-location price/availability controls
   still work for the selected location.

### Supabase evidence

Replace the IDs with the QA merchant/location/item:

```sql
select id, name, is_active
from public.locations
where merchant_id = '<merchant_id>'::uuid
order by created_at;

select id, name, location_id, updated_at
from public.menu_items
where id = '<menu_item_id>'::uuid;

select id, location_id, menu_item_id, updated_at
from public.location_item_overrides
where menu_item_id = '<menu_item_id>'::uuid
order by updated_at desc;
```

Record the single-location flow and the multi-location regression check on the
Android tablet/emulator. No migration needs to be applied for this ticket.
