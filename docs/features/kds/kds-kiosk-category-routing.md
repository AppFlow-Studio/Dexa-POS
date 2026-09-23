# Kiosk items skipped prep-station KDS displays (missing category_id)

## Problem

Kiosk order S19-0001 (prod, 460 BREAD AND BUTTER CORP, 2026-09-23): "Test Item" is in category
**Coffee Shop**, whose location prep default is **Coffee Station**. The Coffee display
(KitchenDisplay 2 KDS, rule `prep_station = Coffee Station`) skipped it. Only the two
rule-less displays received it, via `no_rules_catch_all`.

`kds_routing_log`: `resolved_prep_station = NULL`, `prep_station_source = none`,
`item_category_id = NULL`, `item_category_name = 'Uncategorized'`.

## Root cause

`route_items_to_kds()` → `resolve_item_prep_station(menu_item_id, location, NEW.category_id)`
only reaches the category prep default when the order item has a `category_id`. The kiosk never sent one:

- The POS sets `CartItem.addedFromCategoryId` / `addedFromMenuId` / `category_name`
  (`components/menu/ModifierScreen.tsx`). `useOrderStore` maps them to `p_category_id` / `p_menu_id` /
  `p_category_name` (with an `"Uncategorized"` fallback).
- The kiosk's menu views knew the active category, but `onSelectItem(item)` dropped it. `KioskCartLine`
  and `toCartItem` had no category fields.

Prod, last 14 days: kiosk **0/61** items with `category_id` (POS 2381/2533, OrderOut 288/288).
So every kiosk item missed category-based prep-station routing.

## Fix (client only, no migration)

- [x] `KioskCartLine.categoryId` / `menuId`, `KioskItemSource`, `kioskItemSourceFromKey()`
      (`stores/useKioskCartStore.ts`).
- [x] Menu views A/B/C pass `kioskItemSourceFromKey(resolvedKey)` for grid taps. Search results pass the
      hit's `categoryKey`. The templates hold it beside `selectedItem` → `KioskItemDetailModal` →
      `KioskItemDetail` → `useItemModifiers(item, source)` → `buildKioskCartLine(..., source)`.
- [x] `toCartItem` sets `addedFromCategoryId`, `addedFromMenuId` and `category_name`
      (via `useMenuStore.getCategoryById`), the same as the POS.
- [x] Test: `__tests__/kioskCartCategory.test.ts`.

## Review

- `tsc` and eslint are clean on the touched files. Kiosk suites pass (new test, `kioskMenuSearch`, `kioskValorCheckout`).
- [ ] Staging kiosk: order from a category with a prep default. `kds_routing_log.match_reason` should be
      `rule_prep_station` on the matching display. Check a grid tap and a search hit in templates A, B and C.
- [ ] After release: the prod kiosk-items-with-category count should climb from 0.
- Past orders are not backfilled.
- Possible follow-up (website repo, staging first): a server backstop that looks up the category from
  `category_items` when `p_category_id` is NULL. This would cover old kiosk builds and the ~150
  uncategorized POS items. It wasn't done because an item in several categories makes the lookup ambiguous.

Related: [kds-routing-no-rules-fail-safe.md](kds-routing-no-rules-fail-safe.md). Its "orphan items with
`resolved_prep_station = NULL`" were at least partly this bug.
