# Handheld Wave 2 + 3 — write phase plan

Branch `handheld`. Wave 2 (add to a check) ships before Wave 3 (open a check).
Design: the "Dexa Go Handheld" artifact, screens 3–5 / S3–S6 then 2 / S2.
Engineering reference: `README.md` next to this file.

Rules carried over from Wave 1:

- Writes go through the register's store actions and the outbox; no new RPC.
- One file per concern: `useXRows` hook + memoised row + sheet + page; nothing
  over ~120 lines. Primitives over inline styling.
- `handheld/**` stays lazy; route files `React.lazy` their page.
- No "Pay" until Wave 4. The artifact's Pay button is not rendered.

## Step 0 — re-apply the reviewed fixes (README "Re-apply first")

One at a time, device check between them.

- [x] 1. `useTableSummary` overtime → `useLocationConfigStore.config.dining.defaultSittingTimeMinutes`
- [x] 2. `checkTitle` delivery rows → platform label via `resolveOrderPlatformLogo`
- [x] 3. `LineItem` renders `<Tag label="TO GO" />` for `is_to_go`
- [x] 4. `CheckBody` sent-course header "Sent 6:52 · 5 items" from `sent_to_kitchen_at`
- [x] 5. `ListRow` detail accent: 500 only for warn / ok / overtime
- [x] 6. `Card` header value uses `type.price`
- [x] 7. `useTableRows` comparator: precomputed numeric `sortKey`, no collator per call
- [x] 8. `HandheldRoot` badge selects a number from `useOrderStore`
- [x] 9. `StickyActionBar` positional keys
- [x] 10. `MeScreen` imports `syncNow` from `@/services/offlineSyncService`

## Wave 2 — add to a check

### Register paths reused

| Handheld action | Register call | Where it lives |
| --- | --- | --- |
| Add menu item | `useOrderStore.addItemToActiveOrder(cartItem)` after `setActiveOrder(orderId)` | CartItem shape: `components/menu/ModifierScreen.tsx` ~L1679 |
| Add custom item | same, open-item CartItem | `components/menu/OpenItemAdder.tsx` ~L455 |
| Modifier groups + prices | `useMenuStore.getModifierGroupsByIds`, precompute helpers exported from `stores/useModifierSidebarStore.ts` | — |
| Send | `useOrderStore.sendNewItemsToKitchenForOrder(orderId)` | `services/sessionEffects/sendToKitchenEffect.ts` |
| Void | table order: `dispatchAction({ type: "VOID_ORDER" })`; else `voidOrder` | `components/bill/MoreOptionsBottomSheet.tsx` ~L395 |
| Discount | `applyDiscountToCheck` / `removeCheckDiscount` | `hooks/useDiscounts.ts` |
| Manager PIN | `useEmployeeStore.findEmployeeByPin` + `MANAGER_ROLES` | `MoreOptionsBottomSheet.tsx` ~L424 |
| Print check / kitchen ticket | existing `services/printing` entry points | verify at step |

### Files

Routes (`app/(main)/handheld/`):

- [x] `menu/[orderId].tsx` → lazy `handheld/pages/MenuPage`

Pages / screens (`handheld/`):

- [x] `pages/MenuPage.tsx` — screen 3: header (table / order, course · seat), search, chips, list, "Review order · $" footer
- [x] `screens/menu/useMenuRows.ts` — menus → categories → items from `useMenuStore`, honouring availability windows, hidden menus, snoozed items, search
- [x] `screens/menu/MenuRow.tsx` — `.mi` row, `.qa` plus / in-order count
- [x] `screens/menu/CategoryChips.tsx`, `screens/menu/SearchField.tsx`
- [x] `screens/menu/useAddItem.ts` — quick add when no modifier groups, otherwise open the options sheet; builds the CartItem
- [x] `screens/menu/OptionsSheet.tsx` — screen 4: Dine in / To go, quantity, groups, "Add N to order · $"
- [x] `screens/menu/OptionGroup.tsx`, `OptionRow.tsx` — radio / check rows, "Required" pill
- [x] `screens/menu/useOptionsDraft.ts` — selection state, required / min / max validation, total
- [x] `screens/menu/CustomItemSheet.tsx` — S4: name, price keypad, taxable switch
- [x] `components/check/CheckFooter.tsx` — "Send course N" / "Send to kitchen", disabled with nothing unsent, "Queued" offline
- [x] `components/check/MoreSheet.tsx` — S5: discount (Manager), note, print check, print kitchen ticket, void (Manager)
- [x] `components/check/ManagerPinScreen.tsx` — S6: full-screen overlay, `Keypad size="big"`, dots, cancel
- [x] `components/check/useCheckActions.ts` — void / discount / note / print wiring
- [x] `components/check/DiscountSheet.tsx` — presets from `useDiscounts` with the register's eligibility pass (its picker is a register-layout bottom sheet)
- [x] `components/check/NoteSheet.tsx`, `components/check/TakeOverCard.tsx` — order note; station-ownership claim (`claimOrderById`) before a check opened elsewhere is editable
- [x] `lib/cartItem.ts`, `lib/sendCourse.ts`, `lib/discounts.ts`, `lib/managerPin.ts` — pure builders / the register's send, discount and PIN rules
- [x] `pages/CheckPage.tsx` — header `right` = more button, "Add items" row in the unsent card, footer, sets the active order on mount

### Verify

- [ ] Add, option, quantity and to-go land in `order.items` with the register's CartItem fields; check on the tablet that the same order renders identically
- [ ] Send from the handheld reaches KDS; "Sent" card folds; offline send shows Queued and drains on reconnect
- [ ] Void and discount refuse a non-manager PIN with the register's messages
- [ ] Custom item shows CUSTOM tag and totals match the register
- [ ] Device pass on 360 dp, font scale 1.3

## Wave 3 — open a check

### Register paths reused

| Handheld action | Register call |
| --- | --- |
| Seat a table | `startNewOrder({ tableId, guestCount })` → `setActiveOrder` → `registerPendingOrderCreation` → `useTableSessionStore.seatGuests({ tableIds, partySize, createOrder: true, localOrderId, selected_station, device_id, serverId })` (`app/(main)/tables/index.tsx` ~L725) |
| Start an order on a seated table with no check | `startNewOrder({ tableId, sessionId })` |
| New takeout / delivery | `startOrResumeOrder()` → `updateActiveOrderDetails({ order_type, customer_name, customer_phone })` → `ensureActiveOrderCreated` |

### Files

- [x] `app/(main)/handheld/seat/[tableId].tsx` → `pages/SeatPage.tsx` — screen 2: big count, 1–8+ grid, note, "Seat N guests", hint; replaces itself with `table/[id]`
- [x] `screens/seat/useSeatTable.ts` — the seat flow above, server = signed-in employee
- [x] `screens/tables/TableRow.tsx` — "Seat" pill on available tables
- [x] `app/(main)/handheld/order/new.tsx` → `pages/NewOrderPage.tsx` — S2: type tiles, name / phone, "Start … order"; Dine in switches to the Tables tab
- [x] `screens/checks/ChecksScreen.tsx` — "New order" FAB
- [x] `pages/TablePage.tsx` — hydrates a session's order the store has not loaded (seated elsewhere); a session without an order is not a state the register produces, so no "Start a check"
- [x] `lib/tabStore.ts` — root tab outside HandheldRoot so New order → Dine in can land on Tables

### Verify

- [ ] Same table seated from handheld shows on the tablet floor plan with the right server and guest count
- [ ] Open the same check from two devices: items added on both appear on both, no duplicate order rows
- [ ] Takeout order from the handheld appears in the tablet's order rail with name and phone

## Out of scope (later waves)

Payment, tip, receipts, cash drawer (Wave 4); offline Pay gating, low battery
transfer, Wi-Fi roaming (Wave 5); editing or removing a line item from the
handheld (not drawn in the artifact); floor-plan switcher.
