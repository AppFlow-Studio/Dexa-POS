# Menu Management Rework — UI, Responsiveness, Flows, Visibility, Performance

## Summary

The menu management section (`app/(main)/menu/*`) read as unprofessional and
off-brand next to Settings, Loyalty and Inventory, and it did not adapt to screen
size. This rework rebuilds the section's main screen around the app's existing
design language, with the same data and write paths as before.

Problems found in the old screen:

- **Look.** Each tab styled its cards differently: `card` in one, `panel` plus a
  teal border in another, and a mix of scaled and raw pixel sizes. The sidebar
  was a fixed 220/72 px with a floating collapse button, unlike the Settings and
  Inventory nav. The Eye icon meant three different things depending on the tab.
  Text was 10–13 px, and icon buttons were about 26 px, which is too small for a
  touch POS.
- **Responsiveness.** Item cards (152×186), category item cards and the sidebar
  used fixed pixels that ignored `useUiScale`, so the screen was tiny on large
  panels and cramped on small ones.
- **Flows.**
  - Menus nested three levels deep (menu → category → item grid).
  - Hand-rolled drag maths assumed a 96 px row, so reordering broke once a menu
    was expanded.
  - Search was a global bottom sheet that navigated away rather than filtering
    in place.
  - The Items tab had no filters.
  - The per-menu category eye toggle flipped a device-local override while the
    icon showed the global active flag, so tapping it looked like it did nothing.
- **Performance.**
  - One 3,489-line component re-rendered all five kept-alive tabs on any state
    change.
  - The Categories tab rescanned every item twice per row per render
    (`getItemsInCategory`).
  - Menus and categories rendered nested grids with no virtualization.
  - The global `MenuSearchSheet` stayed mounted for the whole POS session.

## Decisions (user, 2026-09-24)

- **Navigation.** Top tabs, in the style of Inventory, with counts. They replace
  the sidebar, so content gets the full width.
- **Drill-in.** A list plus detail pane for Menus and Categories. Modifiers
  follows the same pattern for consistency. On narrow widths the screen shows
  the list, then the detail with a back button.

## Scope

Phase 1 is the main screen (`app/(main)/menu/index.tsx` and `_layout.tsx`):

- Shared section UI in `components/menu/management/`: status pill, buttons,
  search field, filter chips, setting row, empty state, tab strip, list/detail
  split, reorder list and item grid.
- Per-tab panels, memoized and virtualized: Menus, Categories, Items, Modifiers
  and Schedules.
- `useMenuManagementUiStore`: the active tab, selections and filters survive a
  round-trip to an edit screen.
- `useMenuManagementActions`: every write path, moved out of the screen
  unchanged. Handlers are stable and read state via `getState()`.
- Inline search that filters in place, using `useDeferredValue`. The global
  `MenuSearchSheet` is removed.
- A dedicated reorder mode on `DraggableFlatList` for menus, categories in a
  menu, items in a category and modifier groups. It replaces the fixed-height
  gesture maths.
- Labelled controls and 40 px targets. Status pills cover Inactive, Off
  schedule, Off on POS, Off on Kiosk, Hidden here, Online, 86'd and Hidden.
- Dead code is removed: `MenuItemCard`, `getImageSource`, unused state, the
  no-op layout context, `MenuSidebar`, `MenuHeader` and `MenuItemGridCard`.

Phase 2 is the add/edit forms (item, menu, category, modifier). It is a
separate change:

- A shared header, a sticky save bar and a responsive two-column layout.
- `Alert.alert` is replaced with app dialogs.

## Non-scope

- Write semantics. Every RPC, optimistic update and rollback stays as it was.
- The per-menu category device override (`menuCategoryOverrides`) is
  in-memory only and resets on app restart. It is kept as is and now labelled
  honestly. Persisting it is a separate decision.
- Schedule authoring. It stays read-only and is edited in Dexa Admin.

## Plan

- [x] Ticket doc (this file)
- [x] `useMenuManagementUiStore` + `useMenuManagementActions` + derived-data hooks
- [x] Shared section UI components
- [x] Items panel + responsive item grid
- [x] Menus panel (list/detail, reorder, device visibility, channels, schedule)
- [x] Categories panel (list/detail, items grid, reorder items)
- [x] Modifiers panel (list/detail, option 86, used-by, reorder)
- [x] Schedules panel
- [x] New `index.tsx` shell (tabs, 86'd chip, refresh, offline banner, sheets)
- [x] `_layout.tsx` without sidebar; remove `MenuSearchSheet` from `(main)/_layout`
- [x] Remove dead components; update edit-menu / edit-category tab store import
- [x] `npx tsc --noEmit`, lint on touched files, related Jest suites
- [ ] Phase 2: add/edit forms
- [ ] On-device QA (see Open QA)

## Progress

### Phase 1 (2026-09-24)

- **Layout.** The five tabs are an Inventory-style strip with counts. The 86'd
  shortcut and refresh sit beside the strip, and the offline notice sits under
  it.
- **List + detail.** Menus, Categories and Modifiers use a list and detail pane
  (`SplitView`). Below 720 dp of content width (at scale 1) the screen shows the
  list, then the detail with a back bar. The list stays mounted, so its scroll
  position survives.
- **Items.**
  - Inline search (deferred) and status chips: All, Available, Hidden, 86'd,
    each with a count.
  - The grid's column count follows the measured width. Every card size comes
    from `computeItemGridMetrics`, so the FlashList row heights are exact.
  - Cards have labelled 86/Restock and Hide/Show buttons. Tapping a card opens
    the editor for items this store owns, or the price sheet for shared items.
    Before, Edit was simply greyed out for shared items.
- **Menus detail.**
  - Labelled switches: Active (everywhere) and Show on this device.
  - The schedule, whether it is open now, and POS, Kiosk and Online channel
    status.
  - Categories with their own status and the device switch. Tapping one opens
    it on the Categories tab.
- **Categories detail.**
  - The Active switch, the schedule, and "In menus" chips that link to the
    menu.
  - A virtualized items grid, and reorder of the items.
  - Opened from a menu, it carries that menu as the pricing scope (level 5), as
    the old nested view did. A "Use category prices" bar makes the scope
    visible and clears it.
- **Modifiers detail.** Required/Optional, Pick N and scope pills; 86 all or
  Restock all; per-option 86 with a countdown; and "Used by" items that open
  the item.
- **Reorder.** One reorder mode (`ReorderList`, DraggableFlatList) replaces
  the three hand-rolled pan gestures that assumed fixed row heights.
  - Menu and modifier-group reorders are now **id-based**. The screen sorts by
    displayOrder, then name, which need not match the store array. The old
    index-based calls could move the wrong entity, and did whenever a menu was
    hidden on the device, because hidden menus were filtered out of the indexed
    list.
- **View state.** The tab, selections, searches and the items scroll offset
  live in `useMenuManagementUiStore`. The routes render through `<Slot/>`, so
  the index unmounts on every edit screen. Before, you came back to the Menus
  tab at the top of the list.
- **Removed.**
  - The global `MenuSearchSheet`, which was mounted for the whole POS session,
    and its store.
  - `MenuSidebar`, `MenuHeader`, `MenuItemGridCard`, `DraggableMenuItem`, and
    the dead `MenuItemCard` / `getImageSource` / schedule-modal state in
    index.tsx.

### Performance pass for low-end tablets (2026-09-24)

Reported as "very slow on low-end devices". The test tablet was a Galaxy Tab
S6 Lite (SM-P613): Snapdragon 720G, 3.5 GB RAM, about 1 GB available, and
1333×800 dp, the UI-scale baseline. A read-only `gfxinfo` snapshot for the
whole session showed 22% janky frames, a p99 of 450 ms, and stalls of 1–5 s.

That device ran a **debuggable build served from Metro**, so the numbers
include React dev-mode overhead. Judge the final speed on a release or preview
build.

Fixes, from the code:

- **Currency formatter.** `formatCurrency` built a new `Intl.NumberFormat` per
  call, which goes through native ICU on Hermes/Android, for every price on
  every card render. It now uses one cached formatter; the output is unchanged
  and tested. This benefits every caller in the app.
- **Sorting.** Sorting about 2,000 items with `localeCompare` made about
  22,000 native ICU calls on Hermes/Android. `sortByName` keys each name once
  (lower-cased, accents stripped) and compares plain strings.
- **Shared derived data.**
  - The sorted menus, category index, sorted items, sorted categories,
    modifier groups and 86'd count each sit behind a module-level single-entry
    cache, so the panels share one build instead of one each.
  - The minute schedule tick yields the same objects unless a menu or
    category actually opens or closes.
  - The category index is keyed on menu trees, not availability.
- **Item card rebuilt for cost.**
  - One style object per grid size.
  - Text-only actions and badges, so a card mounts at most one SVG, down from
    up to six.
  - `Pressable` with a native ripple instead of `TouchableOpacity`.
  - No hooks inside the card.
  - A field-level memo check, so a sync that replaces item objects re-renders
    nothing that looks the same.
- **Grid run-up.** Draw distance is now 2 rows, down from 4.
- **Screen-level scale.** Scale is computed once at the screen root and shared
  through context, instead of every pill and button subscribing to window
  dimensions and settings.
- **Only the shown tab is mounted.** Kept-alive hidden panels re-rendered on
  every store update and held lists and bitmaps in memory. The tab swap runs as
  a transition, so the tap highlights immediately.
  - An attempt to freeze hidden panels with a Suspense-based `Freeze` was
    reverted. Suspending revealed content inside a transition never commits.
    See lessons.md, "Suspense-based freezing and transitions don't mix".
- **Items search.** Each item's lower-cased search text is built once per
  library change. The grid only receives deferred values, so a keystroke
  re-renders the toolbar only.
- **Scroll memory.** The remembered scroll position moved out of the zustand
  store, so scrolling no longer notifies store subscribers. The grid now opens
  at the remembered row via `initialScrollIndex`, instead of rendering the top
  and then jumping.
- **Detail panes** (menu, category, modifier) are memoized with stable props.

UX correction: the Items grid now keeps its A–Z letter groups under every
status pill and search. Dropping them read as "not sorted".

## Verification

- `npx tsc --noEmit`: clean.
- ESLint on every new and touched file: clean.
  - The remaining errors under `app/(main)/menu/` are pre-existing, in untouched
    Phase 2 form screens (`add-item`, `edit-item`, `add-modifier`,
    `edit-modifier`).
- New unit tests (15):
  - `__tests__/menuManagementGrid.test.ts` checks, across a matrix of widths
    and scales, that the grid never overflows, never goes below the minimum
    card width, adds columns as the width grows, caps the image, and gives rows
    that equal the rendered card height plus the gap.
  - `__tests__/menuManagementIndex.test.ts` covers `applyOrder` and the
    category → items index: tree order with live objects, the name fallback,
    and multi-menu membership.
- Existing menu suites (15 suites, 118 tests) pass.
- FlashList sizing was checked against the library source
  (`recyclerlistview` ViewRenderer and FlashList `itemContainer`):
  - Grid rows set an explicit width and height.
  - List rows fill the width because each has a `flex: 1` child in a row
    container, so Yoga keeps the AT_MOST width available.
- **Not yet run on a device.** No device or emulator was attached during this
  change.

## Files

- New:
  - `components/menu/management/`: `ui`, `layout`, `context`, `ItemGrid`,
    `ReorderList`, `MenuManagementTabs`, `MenusPanel`, `CategoriesPanel`,
    `ItemsPanel`, `ModifiersPanel`, `SchedulesPanel`
  - `hooks/menu/useMenuManagementActions.ts`
  - `hooks/menu/useMenuManagementData.ts`
  - `lib/menu/menuManagementGrid.ts`
  - `lib/menu/menuManagementIndex.ts`
  - `stores/useMenuManagementUiStore.ts`
  - the two test files above
- Changed:
  - `app/(main)/menu/index.tsx` (rewritten as a shell) and `_layout.tsx`
  - `app/(main)/menu/edit-menu.tsx` and `edit-category.tsx` (UI store import)
  - `app/(main)/_layout.tsx` (search sheet removed)
  - `lib/icons/index.ts` (`SearchX`, `ArrowUpDown`)
  - `lib/menuItemPlaceholderIcon.ts` (`getItemPlaceholderIcon`)
  - `docs/engineering/architecture/GESTURE_SHORTCUT_INVENTORY.md`
- Deleted:
  - `components/menu/MenuSidebar.tsx`
  - `components/menu/MenuHeader.tsx`
  - `components/menu/MenuItemGridCard.tsx`
  - `components/menu/DraggableMenuItem.tsx`
  - `components/menu/MenuSearchSheet.tsx`
  - `stores/useMenuManagementSearchStore.ts`

## Open QA

- **Sizes.** Check an 8" Landi-class tablet, a 10–11" tablet and a 15" panel,
  each at UI size Small and XL. Watch the column count, whether the split or
  stacked layout kicks in, and whether the tab strip scrolls when narrow.
- **Themes.** Light and dark, including the pills, switches and the solid 86'd
  badge on cards.
- **Reorder.** Reorder menus with one hidden on the device, and check that the
  order on the POS order screen matches. Also reorder categories in a menu,
  items in a category, and modifier groups. Each drop should save, and a
  failure should toast and resync.
- **Round trip.** Open "Edit item" from the Items tab with a search active,
  then come back. The tab, search and scroll position should be preserved.
- **Price scope.** A shared item's price in category detail opened from a
  menu should apply to that menu only. Opened from the list, it should apply
  to the category. From the Items tab, it should apply to the location.
- **Offline.** Every write control should be disabled with the notice showing.
  "Show on this device" and the per-menu category switches should still work.
- **Device switch.** The per-menu category switch still resets on app restart
  (in-memory `menuCategoryOverrides`). This behaviour was kept as it was; the
  label now says so.
