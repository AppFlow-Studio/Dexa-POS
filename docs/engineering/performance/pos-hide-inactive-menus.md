# POS Hide Portal-Disabled Menus

## Summary

Prevent menus disabled in the portal, including the reported `Whole Menu`,
from appearing as selectable menu tabs or category popups in POS order entry.

## Scope

- Honor the synchronized `menus.is_active` value on the POS ordering surface.
- Preserve the existing per-location local hidden-menu filter.
- Keep inactive menu data available to portal/menu-management flows.
- Do not hard-code the `Whole Menu` name or delete menu/category/item data.

## Plan

1. Centralize POS order-entry menu visibility filtering.
2. Exclude portal-disabled menus before preferred-menu and popup selection.
3. Add focused tests for portal-active and locally hidden behavior.
4. Verify the reported merchant after refreshing POS sync data.

## Progress

- [x] Added the reusable POS order-entry visibility filter.
- [x] Applied it before menu lookup, default selection, tabs, and popups.
- [x] Preserved active `Whole Menu` behavior to avoid a name-specific rule.
- [x] Added targeted regression tests.
- [ ] Verify against a staging menu disabled through the portal.
- [ ] Record the portal toggle and refreshed POS result.

## Verification

- `npx jest __tests__/posMenuVisibility.test.ts --runInBand --silent` - passed
  (1 suite, 3 tests).
- Targeted ESLint for the helper, test, and `MenuSection` change - passed with
  0 errors (20 pre-existing `MenuSection` warnings remain).
- `git diff --check` for all ticket files - passed.
- Manual QA: disable a disposable menu in the portal, refresh/restart POS, and
  confirm it is absent from order-entry tabs and popups while remaining in the
  portal. Re-enable it, refresh POS, and confirm it returns.

## Files

- `lib/menu/posMenuVisibility.ts`
- `components/menu/MenuSection.tsx`
- `__tests__/posMenuVisibility.test.ts`
- `tasks/pos-hide-inactive-menus.md`
- `tasks/ticket-log.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- Portal-to-POS staging verification and video proof.
- Confirm the reported `Whole Menu` row is disabled (`is_active = false`) in
  the target environment.
