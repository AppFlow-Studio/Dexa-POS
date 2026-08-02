# POS menu grid - DESSERT duplicate Strawberry Banana Crepe card

## Summary

- Ticket: Saucy merchant, Order Line -> DESSERT -> Crepes & Waffles shows a duplicate card for `Strawberry Banana Crepe`.
- Evidence provided:
  - screenshot of the overlapping card in the POS grid
  - video: `C:\Users\Ali DIka\Desktop\POS_Development_Chat_Video_(1).mp4`
  - pasted ticket brief in Codex attachment
- Reported expectation: exactly one card per menu item.

## What The Ticket Is About

- This is a POS order-entry menu-grid defect on a high-traffic cashier surface.
- The symptom is isolated to one item in one category, not the whole grid.
- The written ticket already suspects a duplicate row in the data source rather than a pure layout bug.

## Repo Understanding

- The POS menu grid renders from `components/menu/MenuSection.tsx`.
- `MenuSection` does not build items itself; it renders `activeCategoryEntry.items`.
- The grid key extractor is `item.id`, so duplicate rows with the same `menu_item.id` are especially dangerous:
  - they can produce duplicate-key / recycling issues in `FlashList`
  - that matches the visible overlap symptom in the screenshot/video
- The category item payload is shaped in `types/menu.ts`:
  - `MenuCategoryEntry.items`
  - `MenuCategoryItem.menu_item`
- The sync transform is in `stores/useMenuStore.ts`:
  - `transformMenuItemsFromSync`
  - category items are sorted and mapped, but not deduped
- The full menu payload currently comes from `hooks/pos/usePosSync.ts` via:
  - `get_pos_full_sync`
- Supabase types confirm likely backend touchpoints:
  - `get_menu_with_categories`
  - `v_location_menu_items`

## Current Hypothesis

1. Backend sync payload returns the same `menu_item.id` twice for this category/item context.
2. `transformMenuItemsFromSync` passes both rows through without deduping.
3. `MenuSection` hands those duplicate IDs to `FlashList`, which can render as the overlapped duplicated card seen on screen.

This means the visible UI bug can still be caused by a backend duplicate row even if the render component is technically “working as coded”.

## Investigation Plan

1. Confirm the actual upstream source used by `get_pos_full_sync` / `get_menu_with_categories` for menu-category items.
2. Inspect whether the duplicate exists in the RPC/view payload before Zustand transform.
3. Inspect whether transform-side dedupe is missing for `MenuCategoryEntry.items`.
4. Decide fix location:
   - backend / view / RPC if the payload is truly wrong
   - frontend guard if backend uniqueness cannot be guaranteed immediately
5. Preserve pricing correctness:
   - `effective_price`
   - `effective_cash_price`
   - category ordering / `display_order`

## Likely Fix Directions

- Preferred:
  - fix the source query / RPC so each menu item appears once per menu/category/location context
- Defensive fallback:
  - dedupe category item rows in `transformMenuItemsFromSync` by stable item identity before they reach `MenuSection`
- Important:
  - do not mask a real pricing/override bug if duplicates are caused by a join fan-out

## Scope

- In scope:
  - POS menu sync payload
  - menu/category item transformation
  - Order Line menu-grid rendering path only as needed
- Out of scope:
  - unrelated categories / menus unless needed for regression verification
  - pricing math changes
  - receipt / CFD / checkout flows

## Progress

- Ticket brief reviewed.
- Screenshot and video context reviewed at a high level.
- Repo touchpoints identified:
  - `hooks/pos/usePosSync.ts`
  - `types/menu.ts`
  - `stores/useMenuStore.ts`
  - `components/menu/MenuSection.tsx`
- Confirmed the local repo snapshot includes `get_pos_full_sync`, but not the underlying `get_menu_with_categories` implementation that likely introduces the duplicate upstream.
- Implemented a defensive dedupe guard at the sync-transform boundary:
  - category item rows are sorted first
  - duplicate `menu_item.id` rows inside the same category are dropped before mapping into `MenuItemType`
  - `__DEV__` warning logs the dropped duplicate IDs with menu/category context
- Added targeted regression coverage for the new dedupe helper.

## Verification Plan

- Automated:
  - `npx jest __tests__/menu-sync-dedupe.test.ts`
- Manual:
  - Confirm only one row for `Strawberry Banana Crepe` reaches the rendered category items list.
  - Confirm Order Line -> DESSERT -> Crepes & Waffles shows one clean card only.
  - Confirm item order remains correct.
  - Confirm price / cash price remain correct.
  - Spot-check at least one other category and one other merchant or menu if feasible.

## Files

- `lib/menuSyncDedupe.ts`
- `stores/useMenuStore.ts`
- `__tests__/menu-sync-dedupe.test.ts`
- `tasks/menu-grid-dessert-duplicate-card.md`
- `tasks/ticket-log.md`

## Notes

- The backend ticket text suggests DB-side investigation first; the repo confirms there was also no frontend dedupe at the category-items boundary.
- Because the grid key is `item.id`, duplicate item IDs are more likely to cause an overlap artifact than two fully separate visible cards.
- This fix is intentionally defensive and ticket-scoped. If you later want the true upstream root cause removed, the next DB follow-up is to inspect the live `get_menu_with_categories` / `v_location_menu_items` definitions in Supabase.
