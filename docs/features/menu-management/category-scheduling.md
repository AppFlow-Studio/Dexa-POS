# Menu + Category Scheduling - POS and Kiosk

## Summary

Schedules assigned in Dexa Admin are supposed to hide menus and categories
outside their windows on the POS order screen and the self-order kiosk. On the
tablet, neither level worked:

- **Category schedules never arrived.** The bootstrap RPC did not emit them,
  and the category transform never set `schedules`. Every category read as
  always available.
- **Menu schedules were dropped.** Since website migration `20260413000000`,
  `get_menu_with_categories` has not emitted `schedule.is_active`, and the
  client discarded every schedule without it.
- **The day-of-week mapping was a day off.** The website writes `day_of_week`
  as 0=Sunday everywhere. The POS remapped it as if it were 0=Monday.
- **Edits never reached a running station.** No schedule table was in the
  version watermark. The foreground probe was also inert, because
  `refetchOnWindowFocus` does nothing without a `focusManager`.
- **Screens did not re-evaluate over time.** A window closing while a screen
  was open changed nothing until the next menu rebuild.
- **The POS schedule editor only changed local state.** There was no write
  path, and the next sync overwrote the edit.

Owner: Ali Jaffal (end to end). Sign-off: Abubeckr or Temur. A reviewer other
than the implementer checks the acceptance criteria.

## Scope

- **Migration.** Shared, with an identical copy in both repos:
  `utils/supabase/migrations/20260924120000_pos_schedules_v3.sql`.
  - `get_pos_schedule_map_v1`: internal. It is the one place schedules are
    selected for a location.
  - `get_pos_bootstrap_v3`: v2 plus menu and category schedules.
  - `get_pos_menu_version_v3`: v2's token plus a content hash of the map. It
    is byte-identical to the v3 envelope `version`.
  - A `category_schedules.merchant_id` backfill.
- **Tablet.**
  - `lib/menu/menuSchedule.ts` is the single mapper and evaluator.
  - Store getters are id-based: `isCategoryAvailableNow(categoryId, menuId?, at?)`.
  - `useScheduleClock` is a shared minute clock.
  - `useKioskScheduledMenus` is the single kiosk filter.
  - The foreground `pos.menu-version-probe` resume task.
  - The v3 RPCs, with a v2 fallback.
- **Surfaces.**
  - POS: order grid (`MenuSection`), category tabs (`MenuControls`), POS
    search (`SearchBottomSheet`), menu management, and online-ordering settings.
  - Kiosk: templates A/B/C and kiosk search.
- **Editor removed.** `MenuForm` and `CategoryForm` show a read-only
  `ScheduleSummary`. Schedules are edited in Dexa Admin.
- **Website.** `AssignScheduleToCategory` now writes `merchant_id`, and the
  migration is mirrored there.

## Non-scope (flagged only)

- **No cart guard (decided).** Enforcement happens only while browsing. A line
  already in a POS or kiosk cart stays payable after its window closes.
- Realtime push for schedule edits. The probe on foreground, reconnect and
  every 5 minutes covers it.
- POS-side schedule authoring (a write path and conflict rules).
- Location time zone. Evaluation uses the device clock, because
  `locations.timezone` defaults to America/New_York for merchants who never set
  it. A tablet with a wrong clock gets the wrong result.
- The HQ admin schedule form (`admin-merchant/schedules.ts`) neither splits
  overnight windows nor rewrites a midnight end, so those saves fail the
  `end_time > start_time` check. Tracked separately.

## Plan

1. Add the v3 migration: schedule map, probe v3 and bootstrap v3, plus the
   backfill.
2. Add the pure helpers (`mapApiSchedules`, `isWithinSchedules`,
   `formatScheduleSummary`) and wire the store and types to them.
3. Switch the client to the v3 RPCs with a v2 fallback, route the manual checks
   through the v3 probe, and add the foreground probe task.
4. Add the shared minute clock. Move the kiosk selector and POS surfaces to
   id-based checks that follow the clock, and move off a category that closes
   while it is on screen.
5. Remove the phantom editor and add the read-only summary.
6. Fix the website `merchant_id` on category assignment and mirror the
   migration.

## Progress

- [x] Migration written (POS + byte-identical website copy)
- [x] Helpers and store; unit tests
- [x] v3 client wiring with fallback; manual checks; foreground probe
- [x] Kiosk A/B/C + kiosk search via `useKioskScheduledMenus`; schedule empty state
- [x] POS grid / tabs / search / menu management / online ordering
- [x] Editor removed; `ScheduleSummary`; dead schedule components deleted
- [x] `online-ordering.tsx` scale-helper shadowing crash fixed
- [x] Website `AssignScheduleToCategory` writes `merchant_id`
- [ ] Migration applied to staging (then prod) **before** the client build ships
- [ ] Staging verification queries (migration footer)
- [ ] Simulator QA + recording to Abubeckr
- [ ] Second-reviewer sign-off

## Deviations from the ticket (call them out in review)

- **`day_of_week` is 0=Sunday, not 0=Monday.** The ticket's "hard contract" was
  wrong. Evidence: the website's `ScheduleCard` `DAYS_OF_WEEK`,
  `slot.day_of_week === now.getDay()`, and `types/menu.ts:390`. The client now
  maps it 1:1 onto `Date#getDay()`.
- **Menu scheduling was also broken.** It was not a working reference to
  regression-check against. The v3 payload re-emits menu schedules with the
  location-effective `is_active`.
- **v3, not an in-place v2 edit.** Shipped builds still apply the 0=Monday
  remap. Emitting `is_active` from v2 would make them enforce menu schedules a
  day off.
- **Schedules sit on `menus[].categories[]` entries, not a top-level
  `categories[]`.** The payload has no top-level `categories[]`, and the SQLite
  mirror stores each entry verbatim, so no schema change was needed.
- **Foreground re-runs the cheap probe; it does not invalidate the bootstrap.**
  The probe refetches the menu only when the watermark moved. The ticket's
  `["pos-bootstrap"]` key does not exist; the query is `pos_sync`.
- **The ticket's overnight semantics differ from how the website stores them.**
  The website stores an overnight window as two slots split at midnight
  (Fri 22:00–23:59:00 and Sat 00:00–02:00). The evaluator treats an end at or
  after 23:59:00 as midnight, so there is no one-minute gap. It also handles
  `end <= start` with the tail belonging to the previous day.
- **Category lookups are by id, not name.** This also fixes an existing bug: a
  category with a per-menu `custom_title` resolved as closed, which gave an
  empty POS grid and made the category vanish on the kiosk.
- **Three extra fixes.**
  - `online-ordering.tsx` would have crashed once any menu had an active
    schedule.
  - The manual "Check for menu changes" compared the v1 probe against the v2
    envelope, so it could never match.
  - `MenuSearchSheet`'s schedules tab passed schedule rules to a card that
    expects a whole menu or category.

## Verification

- **Unit tests.**
  - `__tests__/menuSchedule.test.ts` covers the day mapping, inactive
    filtering, grouping, split-overnight continuity, `end<=start` boundary
    days, 23:59:59, and the summary text.
  - `__tests__/menuStoreCategorySchedules.test.ts` covers in and out of the
    window, no schedule meaning always available, the per-menu lookup, a
    renamed category not being falsely closed, menu schedules being enforced,
    and the global switch.
  - `__tests__/db/menuMirror.test.ts` checks that schedules survive the
    SQLite round trip.
- **Local runs.**
  - Menu, kiosk, sync and fallback suites: 25 suites and 325 tests passing
    before the mirror case was added. `menuMirror` now passes with 23 tests.
  - Full suite: 228 of 229 suites pass. The one failure,
    `syncOrderFromDatabaseDiscountMetadata`, is a source-text check on
    `stores/useOrderStore.ts`, which this change does not touch, so it was
    already failing.
  - `npx tsc --noEmit` is clean.
  - Lint shows no new errors in the touched files.
- **Staging.** Run the migration footer queries:
  - day convention
  - probe equals envelope
  - category schedules present
  - menu `is_active` present
  - the watermark moves on edits and stays put on a no-op save
  - payload size delta
  - backfill count
  - 42501 for another merchant

## Files

- **Migration:**
  - `utils/supabase/migrations/20260924120000_pos_schedules_v3.sql`
  - the mirror at `DexaPOS-Website/supabase/migrations/`
- **Helpers and hooks:**
  - `lib/menu/menuSchedule.ts`
  - `hooks/useScheduleClock.ts`
  - `components/kiosk/shared/useKioskScheduledMenus.ts`
  - `components/menu/ScheduleSummary.tsx`
- **Store, types and sync:**
  - `stores/useMenuStore.ts`
  - `types/menu.ts`
  - `hooks/pos/usePosSync.ts`
  - `hooks/pos/useMenuVersionWatch.ts`
  - `contexts/PosSyncProvider.tsx`
  - `app/(main)/settings/syncing.tsx`
  - `components/kiosk/shared/KioskDiagnosticsScreen.tsx`
- **Kiosk:**
  - `components/kiosk/template-{a,b,c}/KioskMenuView*.tsx`
  - `components/kiosk/shared/useKioskMenuSearch.ts`
  - `components/kiosk/shared/KioskNoMenusState.tsx`
- **POS:**
  - `components/menu/MenuSection.tsx`
  - `components/menu/MenuControls.tsx`
  - `components/menu/SearchBottomSheet.tsx`
  - `components/menu/MenuSearchSheet.tsx`
  - `app/(main)/menu/index.tsx`
  - `app/(main)/settings/online-ordering.tsx`
- **Editor:**
  - `components/menu/MenuForm.tsx` and `components/menu/CategoryForm.tsx`
  - `app/(main)/menu/{add,edit}-{menu,category}.tsx`
  - Deleted: `ScheduleCard`, `ScheduleManager`, `ScheduleFormSheet`,
    `ScheduleEditor`, `ScheduleRuleModal`
- **Tests:**
  - `__tests__/menuSchedule.test.ts`
  - `__tests__/menuStoreCategorySchedules.test.ts`
  - `__tests__/db/menuMirror.test.ts`
- **Website:** `app/dashboard/actions/schedules.ts` (`AssignScheduleToCategory`)

## Open QA

Run on the simulator after the staging migration: iOS POS plus one kiosk
template.

- A category with a website schedule, outside its window, is hidden on:
  - the POS grid and tabs
  - POS search (disabled with "Category Unavailable")
  - kiosk templates A, B and C
  - kiosk search
- The same category inside its window is visible and orderable.
- Overnight window (Fri 22:00 → Sat 02:00):
  - open at Fri 23:30, Fri 23:59:30 and Sat 01:30
  - closed at Sat 03:00
- A window closing while the screen is open:
  - the POS moves to the next open category
  - the kiosk category disappears
  - with every category closed, the kiosk shows "Ordering isn't available
    right now"
- The manager PIN override still unlocks an off-schedule category and menu on
  the POS.
- A category with no schedule is always available.
- Menu-level schedules on the pilot menus are now enforced on the correct days.
- The edit-menu and edit-category screens show the read-only summary with no
  editor, and the summary matches the website.
- A website schedule edit shows up after backgrounding and foregrounding,
  without tapping Sync.
- Record the payload size delta (v2 vs v3) here.
- Send a recording to Abubeckr showing the POS and one kiosk template, one
  category in and out of its window, and the edit-category screen.
