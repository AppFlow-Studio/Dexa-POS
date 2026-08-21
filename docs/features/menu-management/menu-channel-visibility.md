# Menu Channel Visibility - POS, Kiosk, and Online

## Summary

Allow a location to keep a menu configured while independently choosing
whether it appears in staff POS, self-service kiosk, and online ordering. The
reported `Whole Menu` can therefore remain available where needed while being
hidden from normal POS order entry.

`Whole Menu` is not a hard-coded or automatically generated POS menu. It is an
ordinary menu row whose name and assigned categories are controlled by the
dashboard.

## Scope

- Preserve the existing menu active and location-assignment behavior.
- Store per-location `pos`, `kiosk`, and `online` visibility on
  `location_menus`.
- Treat channel visibility as an additional filter after the existing active,
  location, and schedule rules.
- Honor `pos` visibility across POS tabs, popups, defaults, and search.
- Honor `kiosk` visibility in all three kiosk menu templates.
- Keep inactive or channel-hidden menu data visible in menu-management flows.
- Preserve the existing device-local POS hidden-menu preference.
- Do not hard-code the `Whole Menu` name or delete menu/category/item data.
- Do not implement the website UI in this repository.

## Non-Scope

- KDS, CFD, receipts, and previous orders are not menu-browsing channels and do
  not need menu visibility flags.
- Uber Eats, DoorDash, and Grubhub publication is managed by delivery-provider
  integrations, not by this first-party online-menu flag.
- Changing menu pricing, availability schedules, or category assignments.

## Plan

1. Extend `location_menus` with backward-compatible channel flags.
2. Enrich the versioned POS bootstrap payload with channel visibility.
3. Fix stale menu versioning by touching `updated_at` on menu configuration
   updates.
4. Filter staff POS and kiosk independently without changing menu data.
5. Add focused tests and document the website contract and QA sweep.

## Progress

- [x] Added the reusable POS order-entry visibility filter.
- [x] Applied it before menu lookup, default selection, tabs, and popups.
- [x] Applied the same POS filter to order-entry search results.
- [x] Added independent kiosk filtering to templates A, B, and C.
- [x] Added the channel columns and `get_pos_bootstrap_v2` migration.
- [x] Added `updated_at` triggers so refresh cannot reuse a stale watermark.
- [x] Preserved legacy payload behavior by defaulting missing flags to visible.
- [x] Added focused channel, cache, and bootstrap tests.
- [ ] Apply the migration to the shared Supabase environment.
- [ ] Implement the website channel controls and online enforcement.
- [ ] Verify against a staging menu configured through the portal.
- [ ] Record the portal toggle and refreshed POS/kiosk result.

## Shared Contract

`location_menus` is the per-location control row. New columns:

| Column | Surface | Default |
| --- | --- | --- |
| `is_visible_on_pos` | Staff-operated POS order entry | `true` |
| `is_visible_on_kiosk` | Self-service kiosk templates | `true` |
| `is_visible_online` | First-party online ordering | `true` |

The existing active, location-assignment, and schedule rules still decide
whether a menu is eligible. A channel flag can only hide an otherwise eligible
menu; it does not activate an inactive menu or override its schedule.

`get_pos_bootstrap_v2(location_id)` returns each menu with:

```json
{
  "channel_visibility": {
    "pos": false,
    "kiosk": true,
    "online": true
  }
}
```

Older snapshots without `channel_visibility` remain visible on every channel.
The bootstrap version changes when `menus` or `location_menus` configuration
changes, so POS `Refresh Data` cannot accept a stale menu snapshot.

## Website Handoff

1. Run `utils/supabase/migrations/20260821120000_menu_channel_visibility.sql`
   against the shared Supabase project before deploying either client.
2. On each menu row/edit screen, keep the existing Active control and add three
   independent location-scoped switches labeled `POS`, `Kiosk`, and
   `Online Ordering`.
3. Read the selected location's `location_menus` row using `location_id` and
   `menu_id`.
4. Upsert `is_visible_on_pos`, `is_visible_on_kiosk`, and
   `is_visible_online` on that row. Do not write these flags to `menus`, because
   a global menu can have different visibility at each location.
5. Default a missing `location_menus` row or missing flag to `true`.
6. Enforce `is_visible_online` in the OrderOut designation/publish flow and in
   the hosted first-party storefront read path. A menu hidden online must not
   be published or served.
7. Invalidate menu and OrderOut queries after save and include before/after
   channel flags in the existing menu audit event.
8. Regenerate Supabase TypeScript types after the migration is deployed.

The website update should use the existing unique key for
`location_id, menu_id`. Conceptually, its write is:

```ts
await supabase.from("location_menus").upsert(
  {
    location_id: locationId,
    menu_id: menuId,
    is_visible_on_pos: showOnPos,
    is_visible_on_kiosk: showOnKiosk,
    is_visible_online: showOnline,
  },
  { onConflict: "location_id,menu_id" },
);
```

## Creating Whole Menu

If the merchant needs a `Whole Menu`, create it like any other menu:

1. Open Dashboard -> Menus -> Create Menu.
2. Name it `Whole Menu`.
3. Choose Global or the intended location using existing menu ownership rules.
4. Assign every category that should appear in that menu.
5. Leave it active and choose the required channel switches.

The POS does not automatically merge all categories merely because the menu is
named `Whole Menu`.

## Verification

Automated checks completed on 2026-08-21:

- `posMenuVisibility.test.ts`: 5 passed.
- `menuChannelVisibility.test.ts`: 2 passed.
- `menuSyncStateProvenance.test.ts`: 7 passed.
- `aud1BootMenuSnapshot.test.ts`: 6 passed.
- Targeted ESLint passed for all new/changed channel files except existing
  unrelated warnings/errors in `SearchBottomSheet.tsx` and `useMenuStore.ts`.
- `git diff --check`: passed.

## Manual QA

Use a disposable staging menu and the same location on web and POS.

| POS | Kiosk | Online | Expected |
| --- | --- | --- | --- |
| Off | On | On | Hidden in staff POS; visible in kiosk and first-party online |
| On | Off | On | Visible in staff POS and online; hidden in all kiosk templates |
| On | On | Off | Visible in staff POS and kiosk; hidden from first-party online |
| Off | Off | Off | Hidden from all three menu-browsing surfaces |

For each row, save on the dashboard, press POS `Refresh Data`, and verify menu
tabs, the menu popup, default selection, and item search. Also restart POS once
to prove the offline snapshot has the same result. Finally, make the menu
inactive and confirm existing active/location behavior still wins regardless
of channel flags.

## Files

- `lib/menu/posMenuVisibility.ts`
- `lib/menu/menuChannelVisibility.ts`
- `components/menu/MenuSection.tsx`
- `components/menu/SearchBottomSheet.tsx`
- `components/kiosk/template-a/KioskMenuView.tsx`
- `components/kiosk/template-b/KioskMenuViewB.tsx`
- `components/kiosk/template-c/KioskMenuViewC.tsx`
- `hooks/pos/usePosSync.ts`
- `stores/useMenuStore.ts`
- `types/menu.ts`
- `lib/types.ts`
- `__tests__/posMenuVisibility.test.ts`
- `__tests__/menuChannelVisibility.test.ts`
- `utils/supabase/migrations/20260821120000_menu_channel_visibility.sql`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- Migration deployment and website implementation.
- POS, kiosk, and online staging verification plus video proof.
- Verify each channel switch only affects its own surface.
