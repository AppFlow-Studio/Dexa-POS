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

## Wave 3.5 — correct a check

Added 2026-09-21 after the Wave 2 + 3 device pass. None of these are drawn in
the artifact; they are the register's own item-level corrections, without
which a wrong add can only be fixed by voiding the whole check. Two of them
(seat, course) are implied by screen 3's "Course 2 · Seat 2" header and are
what Wave 4's "Split check · by seat" option depends on. Abubeckr draws the
picker; until then the seat and course chips go in `MenuPage`'s header line
and the item sheet uses `primitives/BottomSheet`.

### Register paths reused

| Handheld action | Register call | Where it lives |
| --- | --- | --- |
| Pick seat before adding | `useSeatingStore.activeSeat` / `setActiveSeat`; `lib/cartItem.ts` copies it into `seatNumber` | `components/bill/SeatAccordion.tsx` `onSelectSeat` |
| Pick course before adding | `useCoursingStore.setCurrentCourse`; `addItemToActiveOrder` stamps `courseNumber` and calls `setItemCourse` | `stores/useOrderStore.ts` ~L9042 |
| Move an item to another seat | `updateItemInActiveOrder({ ...item, seatNumber })` | `components/menu/ModifierScreen.tsx` ~L1473 |
| Move an item to another course | `useCoursingStore.setItemCourse(orderId, itemId, course)` | `stores/useCoursingStore.ts` L122 |
| Change quantity (unsent) | `setItemQuantity(itemId, qty)` | `components/bill/BillItem.tsx` ~L333 |
| Remove (unsent) | `removeItemFromActiveOrder(itemId)` | `BillItem.tsx` ~L339 |
| Void (sent) | manager PIN (`lib/managerPin.ts`) → `removeItemFromActiveOrder(itemId, reason)`; `PrinterService.printVoidTicket` when `config.printing.printVoidTickets` | `BillItem.tsx` `handleConfirmVoid` ~L370; the station has `can_void_orders = false`, the PIN is the approval, as for whole-check void |
| Edit options | `OptionsSheet` in edit mode → `updateItemInActiveOrder(cartItem)` with the same id | `ModifierScreen.tsx` `openToEdit` commit ~L1473 |
| Item note | `updateItemInActiveOrder({ ...item, customizations: { ...c, notes } })` | `ModifierScreen.tsx` notes field |
| Custom discount | `DiscountBottomSheet.handleApplyCustomDiscount`: `{ id: custom_<ts>, name, value, type }` → `validateDiscountDoesNotGoNegative` → `applyDiscountToCheck` | `components/bill/DiscountBottomSheet.tsx` L176–220 |

Not in this wave: **tax-exempt**. The register's MoreOptions toggle is a
toast with no store write (`MoreOptionsBottomSheet.tsx` ~L424); the order
has no field for it, only `CartItem.is_tax_exempt` (which the handheld's
custom item already sets). Build the order field on the register first.
**Split / merge** is Wave 4 (screen 6 draws "Split check · Evenly or by seat").

### Files

Built 2026-09-21. Pages / screens (`handheld/`):

- [x] `pages/MenuPage.tsx` — header line becomes two chips, "Course N" and "Seat N / Shared", each opening a picker sheet; chosen values go into `useAddItem` and `CustomItemSheet`. Totals moved to `screens/menu/useMenuTotals.ts` to keep the page short.
- [x] `screens/menu/useSeatCourse.ts` — the register's `useTableSeating` (party size from the session) + `useTableCoursing` for one check; `CheckPage` runs it too so the seating store is initialised before the item sheet asks for seats
- [x] `screens/menu/SeatPickerSheet.tsx` — Shared + 1..seat count with item counts; writes `useSeatingStore.setActiveSeat`
- [x] `screens/menu/CoursePickerSheet.tsx` — shown only when `config.dining.enableCoursing`; fired courses listed but not selectable, one empty course after the last; writes `useCoursingStore.setCurrentCourse`
- [x] `lib/cartItem.ts` — `seatNumber` on `ItemDraft` and both builders; `selectionsOf` (seed an edit from the line) and `withOptions` (the edited line, re-priced from its own base price)
- [x] `screens/menu/useAddItem.ts` — after `addItemToActiveOrder`, ModifierScreen's `setItemSeat(…, skipBackendSync)` + `setActiveSeat`
- [x] `screens/menu/Stepper.tsx` — `Stepper` / `QuantityRow` moved out of `OptionsSheet` so the item sheet shares them
- [x] `components/check/LineItem.tsx` — a `Pressable` when `onPress` is given (not on a read-only check); `CheckBody` threads `onPressItem`
- [x] `components/check/ActionRow.tsx` — `ActionRow` / `ManagerPill` moved out of `MoreSheet`, with a right-aligned `value`
- [x] `components/check/ItemSheet.tsx` — one sheet, two modes. Unsent: qty stepper, Edit options (not for open items), Note, Seat, Course, Remove. Sent: Note, Move to seat, Void (Manager pill) — the register opens a sent line view-only, the handheld keeps the note editable. Course move is unsent-only: the kitchen already has a sent line, and `setItemCourse` refuses non-open courses anyway
- [x] `components/check/useItemActions.ts` — the calls above; owns its own reason + PIN state and renders the same `ManagerPinScreen` (no `GatedAction` change in `useCheckActions`)
- [x] `components/check/ItemSheets.tsx` — mounts whichever item sheet is up, one Modal at a time; `CheckPage` adds this one line
- [x] `components/check/ItemNoteSheet.tsx` — same shape as `NoteSheet`, writes `customizations.notes`
- [x] `components/check/VoidReasonSheet.tsx` — `VoidItemDialog`'s four reasons as rows + a typed reason; then the manager PIN, then `removeItemFromActiveOrder(id, reason)` + `printVoidTicket` when the setting is on
- [x] `screens/menu/OptionsSheet.tsx` + `useOptionsDraft.ts` — `target.existing` seeds the draft; button reads "Save · $"; `saveOptions` calls `updateItemInActiveOrder(withOptions(...))`
- [x] `components/check/DiscountSheet.tsx` — "Custom amount" row at the bottom → `CustomDiscountSheet`
- [x] `components/check/CustomDiscountSheet.tsx` — Percent / Amount segment, `primitives/Keypad`, the register's checks
- [x] `lib/discounts.ts` — `buildCustomDiscount` + `applyCustomDiscount` mirroring `handleApplyCustomDiscount` and `validateDiscountDoesNotGoNegative`
- [x] `primitives/PageHeader.tsx` — `picker` accepts a list

Rules carried over: no new RPC; nothing over ~120 lines; new spacing values in
`style`, not `className` (NativeWind trap); no Android ripple on flex-1
Pressables.

### Verify

- [ ] Seat and course chosen on the handheld show on the tablet's seat / course accordion for the same check
- [ ] Qty change and remove of an unsent item never reach the outbox as a void; the tablet shows the corrected line
- [ ] Voiding a sent item refuses a non-manager PIN, records the reason, and prints the void ticket when the setting is on
- [ ] Editing options re-prices the line the way the tablet does (context price, modifier deltas)
- [ ] Custom discount over 100 % or below zero is refused with the register's messages; a valid one shows on the tablet's bill
- [ ] Device pass on 360 dp, font scale 1.3

## Out of scope (later waves)

Payment, tip, receipts, cash drawer, split check / merge (Wave 4); offline
Pay gating, low battery transfer, Wi-Fi roaming (Wave 5); tax-exempt (needs
an order field on the register first); floor-plan switcher.
