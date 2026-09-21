# Handheld (Dexa Go)

Portrait, thumb-reach POS for handheld payment terminals (Landi P30, Valor
VP550). `station_type = 'handheld'` is its own switch, like KDS and Kiosk,
with one difference: the handheld keeps the register's runtime and swaps only
the screens.

Design source: the "Dexa Go Handheld" artifact (Abubeckr signs off on visuals).
Owner: Ali Jaffal. Migration review: Ali Dika. Device pass, native config,
prod apply, merge: Temur.

## Where things live

| Piece | File | Notes |
| --- | --- | --- |
| Migration | `utils/supabase/migrations/20260921120000_handheld_station_type.sql` | Byte-identical copy in `DexaPOS-Website/supabase/migrations/`. CHECK + trigger branch in one file, never split. |
| Station predicate | `lib/stationType.ts` | `isHandheldStationType`, `useIsHandheld`. Outside `handheld/` so register-side gates never import the lazy bundle. |
| Post-login route | `lib/authFlow.ts` `resolvePostLoginRoute` | `'handheld'` -> `app/(main)/handheld/index.tsx`. |
| Local data policy | `lib/db/policy.ts` `stationKind` | Falls through to `"pos"` on purpose (data policy is a follow-on ticket). |
| Register runtime | `contexts/RegisterRuntime.tsx` | Moved verbatim out of `app/(main)/_layout.tsx`. See below. |
| Routes | `app/(main)/handheld/{_layout,index,table/[id],order/[id],menu/[orderId],seat/[tableId],order/new}.tsx` | Nested native Stack with `POS_SCREEN_OPTIONS` (animation none, see lib/screenConfig.ts). Every route file `React.lazy`-loads its screen. |
| Frame | `handheld/HandheldFrame.tsx` | Pins `--ui-scale` to 1; edge to edge, no safe-area padding (bars hidden, product devices have no cutout). Wraps the Stack. |
| Tab root | `handheld/HandheldRoot.tsx` | One active tab + bottom tab bar (Checks badge = open checks marked ready). |
| Screens | `handheld/screens/{tables,checks,me}/` | Screen 1 (Tables), S1 (Checks), Me (with Sync now, Switch user, Dark mode). |
| Pages | `handheld/pages/{TablePage,OrderPage,CheckPage,MenuPage,SeatPage,NewOrderPage}.tsx` | Screen 5 / S3 (check with Send, more sheet, PIN overlay), 3 / 4 / S4 (menu, options, custom item), 2 (seat), S2 (new order). Pushed by tapping a row. |
| Check actions | `handheld/components/check/{CheckFooter,MoreSheet,ManagerPinScreen,DiscountSheet,NoteSheet,TakeOverCard,useCheckActions}.tsx` | Send / more / manager PIN / discount / note / station take-over. |
| PIN screens | `handheld/components/{PinScreen,StaffPinScreen}.tsx` | S6 overlay with the rule injected: `ManagerPinScreen` (manager roles, approvals) and `StaffPinScreen` (any staff via `useVerifyStaffPin`, per-order attribution). |
| Me tab setting | `handheld/screens/me/{OrderingRows,useRequirePinSetting}.tsx` | "Require PIN per order" switch; flips only after `ManagerPinScreen` approves, since the handheld has no Settings route. |
| Menu | `handheld/screens/menu/` | `useMenuRows` (menu tree → chips → rows), `MenuRow`, `OptionsSheet` + `useOptionsDraft`, `CustomItemSheet`, `CartButton`. |
| Seat / new order | `handheld/screens/seat/`, `handheld/screens/neworder/` | `useSeatTable` (the register's seat flow), `useStartOrder`. |
| Write rules | `handheld/lib/{cartItem,sendCourse,discounts,managerPin}.ts` | The register's CartItem shape, send path, discount pre-checks and manager-role rule, as pure functions. Plan and checklist: `wave2-3-plan.md`. |
| Primitives | `handheld/primitives/` | Screen, PageHeader, ListRow, Button, StickyActionBar, IconButton, BottomSheet, Keypad, SegmentedTabs, Switch. |
| Error sink | `lib/logError.ts` | `logger.error` + Sentry capture. |

## RegisterRuntime: what moved and what did not

`app/(main)/_layout.tsx` is an Expo Router layout, so the ticket's
`<RegisterRuntime>` skeleton maps onto it like this.

Moved into `RegisterRuntime` (verbatim):

- `LocationRealtimeProvider` with the register callbacks
- `OrderSyncRecoveryBridge`
- cash-drawer session hydration on boot
- `PaymentBottomSheet` (a native `Modal`; tree position is free)

Left in `MainLayout`, with the reason:

- `handleOrderChange` / `handlePaymentChange` and the `KDSSoundService` they
  play through: the kiosk branch uses the same callbacks, so they are passed
  in as props instead of duplicated.
- `useTableSessionInit({ skip: isKDS })`: already runs for every non-KDS
  station in `MainLayout`, which the handheld route passes through.
- `PaymentDetailBottomSheet`: an absolute-positioned z-index sibling of the
  register chrome (100, below the online-order tab at 150 and MenuSearchSheet
  at 200). Moving it changes layering, so it stays. The handheld payment
  ticket mounts its own copy inside `HandheldRoot` when it adds payment.
- the offline outbox: `PosSyncProvider`, at the root, shared by everything.

The register render tree is unchanged apart from `<LocationRealtimeProvider>`
+ `<OrderSyncRecoveryBridge>` + `<PaymentBottomSheet>` now being emitted by
`RegisterRuntime`. Confirm with the Landi screenshot diff.

## Boot diet

Every gate reads `isHandheldStationType(selectedStation?.station_type)`.

| Item | Decision | Where |
| --- | --- | --- |
| Floor-plan geometry | Keep the single `getFloorSnapshot` + `setActiveFloorPlan(default)`: that call is what populates `useFloorPlanStore.tables`, which the Tables list reads, and the ticket forbids a new query. Skip `prefetchFloorPlans` (every other plan), `_stripOrphanedSessions` (depends on that prefetch) and waitlist/reservations. | `contexts/PosSyncProvider.tsx` `syncFloorPlans` |
| Star printer discovery | Skip LAN discovery; keep the health check (feeds the printer list). | `contexts/PosSyncProvider.tsx` |
| CFD / second screen | No CFD server; handheld gets the same no-op context as CFD client mode — via `CFDServerProvider enabled={false}`, never by swapping the provider element: a swap at the moment a handheld station is chosen remounted the root Stack and dropped the navigation to pin-login. | `contexts/CFDProvider.tsx` |
| Payment + refund journal check on launch | Skip. Nothing to recover until handheld takes payments; the payment ticket must lift this. | `app/_layout.tsx` boot task |
| Five-minute staff refresh | Interval removed; the `pos.employees-refresh` resume task (foreground) keeps the same 5-minute staleness window. | `contexts/PosSyncProvider.tsx` |
| Landscape lock | Handheld locks PORTRAIT_UP from the root layout's orientation effect — the root never remounts on a theme toggle, whereas a lock owned inside the handheld tree flipped the device every time `<ThemeProvider key=…>` remounted. Native lock removal is Temur's Wave 0. | `app/_layout.tsx` |
| Immersive system bars | Hidden on the handheld too, like the register (changed 2026-09-21: the artifact draws the status bar and gesture pill, but a phone with a 3-button nav bar lost 48dp to it). `HandheldFrame` no longer mounts a `StatusBar` — a second one would re-show the bar. | `app/_layout.tsx` |
| Realtime, card-reader detection, heartbeat, outbox, printer list | Kept, untouched. | — |

Not on the ticket's list and therefore untouched: `isPOSMode` in the root
layout still mounts `SearchBottomSheet`, `CustomerSheet` and the modal hosts
for handheld. Candidate for the next boot-diet pass if the 3 s target is
missed.

## Data sources (no new Supabase queries)

- Tables: `useFloorPlanStore.tables` (active plan) + `useTableSessionStore.sessions`,
  same as `components/panels/TablesPanel.tsx`. Seatable objects only, merged
  sessions collapsed (`lib/tableSummary.ts`), "Needs you" pinned then the
  register's status order. Rows are pure; only the check total is a live
  per-row subscription (`useOrderByDbId`).
- Checks: `useOrderStore.ordersById`, filtered by `isOpenCheck`
  (`handheld/lib/checks.ts`), split Open / Closed. Rows subscribe to their
  own profile. Tables' Mine / All needs `view_scope = 'location'`, which the
  trigger sets.
- Offline banner: `useNetworkStatus().rawIsOnline` (not `isOnline`, so slow
  mode stays silent).
- Totals: `utils/currency.formatCurrency` on the `NUMERIC(12,2)` dollar values.

## Design mapping (artifact → code)

The artifact (`claude.ai/artifact/8fc1165b-…`, "Dexa Go Handheld") is drawn
dark at 360 × 720 dp with the app's own dark palette; `lib/theme-colors.js`
already carries every solid token it uses, so the module builds on
`colors.*` and adds only the translucent tints (`handheld/lib/tokens.ts`)
and the type ramp (`handheld/lib/type.ts`).

| Artifact | Code |
| --- | --- |
| `.top` header (80dp, 30/700 title, 14 subtitle, avatar) | `primitives/Screen.tsx`, `components/Avatar.tsx` |
| `.segs` pill segments — **Mine / All** on Tables, **Open / Closed** on Checks | `primitives/SegmentedTabs.tsx` |
| `.sub` "Needs you" / "Your section" | `components/SectionLabel.tsx`, grouping in `screens/tables/useTableRows.ts` |
| `.row` 76dp + `.tb` 48dp tile + `.st-*` / `.ot-*` tints, inset divider | `primitives/ListRow.tsx`, tints in `lib/tokens.ts`, mapping in `lib/tableStatus.ts` / `lib/checks.ts` |
| `.navb` 84dp bar, `.pi` 64×32 indicator, `.bd` badge | `components/TabBar.tsx`; badge = open checks the kitchen marked ready |
| `.bb` / `.btn` (primary, tonal, soft, off, text, fit) 56dp pills | `primitives/Button.tsx`, `primitives/StickyActionBar.tsx` |
| `.bar` pushed header (64dp, back, 20/500 title, 13 line) | `primitives/PageHeader.tsx`, used by `pages/CheckPage.tsx` |
| `.sheet` 28dp radius, grab handle, 24/600 title, close `.ib` | `primitives/BottomSheet.tsx`, `primitives/IconButton.tsx` (kept for S4 / S5) |
| `.swrow` / `.sw` switch | `primitives/Switch.tsx` (Dark mode on the Me tab) |
| `.card` / `.card-h` / `.ln` / `.sum` / `.chipx` / `.okd` / `.tag` | `components/check/*` |
| `.bn` offline card under the header | `components/OfflineBanner.tsx` (rendered by `Screen`) |
| `.kp` keypad (52dp keys, `.big` 64dp for the PIN pad) | `primitives/Keypad.tsx` |

Rules taken from the artifact's copy and the register's own logic:

- Overtime = minutes seated > `useSettingsStore.defaultSittingTimeMinutes`
  (the rule `useTableCardData` applies on the register); overtime tiles use
  `.st-over` and the elapsed time turns warning-coloured.
- "Needs you" = overtime, `check_presented`, or `session.needs_attention`;
  sorted longest-waiting first. The rest follow the register's status sort.
- "Mine" on Tables = sessions whose `server_staff_id` is the signed-in
  employee's `profileId`. "All" needs `view_scope = 'location'`.
- Checks title = `display_number · customer_name | table name | "Counter"`;
  detail = order type · kitchen state (`Not sent` warn, `Preparing 4m`,
  `Ready` ok, `Served`).
- Closed = `check_status === "Closed"` still held in the shared store; there
  is no history fetch on the handheld (no new queries).
- Header subtitle uses real data ("Main floor · 6 of 24 seated") because the
  app has no daypart concept for the artifact's "Dinner · Main floor".
- Tapping a row pushes screen 5 / S3 as a **read-only page** on the handheld
  Stack (`.bar` header with back, course cards, line items, totals) with no
  footer actions until Wave 2. `BottomSheet` stays for S4 / S5.
- Press feedback on the tab bar and icon buttons is a tinted state layer, not
  an Android ripple: a ripple clips to the Pressable's rectangle and flashed
  as a square on the flex-1 tabs.
- Light mode has no artifact; tile tints derive from the palette's solid
  status colours (`lightTint`), and the translucent layers in `tokens.ts` are
  computed from the active palette so they follow the switch.

## UI scale

`UiScaleProvider` computes `--ui-scale` from dp width against a 1333 dp
baseline and floors at 0.6. On a 360 dp handheld that shrinks `text-base` to
9.6 px and `min-h-12` to 29 dp. `HandheldFrame` wraps the handheld Stack in
`vars({ "--ui-scale": 1 })` so every utility class is dp-exact. RN font
scaling still applies to `Text`, which is why rows use `min-h-*`, never `h-*`.

## Migration verification (staging `dfwqakoyittmrwbqvxgw`)

Run after `db push`; paste all four outputs in the PR.

```sql
-- Use a real merchant/location from staging for :merchant and :location.

-- 1. Handheld capabilities come from the trigger.
INSERT INTO public.stations (merchant_id, location_id, station_name, station_type, station_number)
VALUES (:merchant, :location, 'VERIFY handheld', 'handheld', 9001)
RETURNING station_type, can_create_orders, can_process_payments, can_void_orders,
          can_apply_discounts, can_update_kitchen_status, view_scope;
-- expect: true, true, false, true, false, 'location'

-- 2. An order from that station is order_source = 'pos'.
--    Create an order through create_order_v* with p_station_id = the id above, then:
SELECT order_source FROM public.orders
WHERE station_id = :handheld_station_id ORDER BY created_at DESC LIMIT 1;
-- expect: 'pos'

-- 3. Existing types unchanged.
INSERT INTO public.stations (merchant_id, location_id, station_name, station_type, station_number)
VALUES (:merchant, :location, 'VERIFY register', 'register', 9002),
       (:merchant, :location, 'VERIFY checkout', 'checkout', 9003),
       (:merchant, :location, 'VERIFY kds', 'kds', 9004),
       (:merchant, :location, 'VERIFY kiosk', 'self_service', 9005)
RETURNING station_type, can_create_orders, can_process_payments, can_void_orders,
          can_apply_discounts, can_update_kitchen_status, view_scope;
-- expect: register      t t f t f location
--         checkout      t t t t f location
--         kds           f f f f t location
--         self_service  t t f f f own

-- 4. Bogus type fails readably (the BEFORE trigger fires before the CHECK).
INSERT INTO public.stations (merchant_id, location_id, station_name, station_type, station_number)
VALUES (:merchant, :location, 'VERIFY bogus', 'bogus', 9006);
-- expect: ERROR: Unknown station_type: bogus

-- Cleanup
DELETE FROM public.stations WHERE station_name LIKE 'VERIFY %';
```

## QA matrix

| Axis | Values |
| --- | --- |
| Width | 320, 360, 393, 430 dp (reference 360 x 720) |
| Height | 640 to 900 dp |
| Font scale | 1.0, 1.3 |
| Network | online, offline (banner shows, lists still render from stores) |
| Floor | 5 tables, 100 tables (55 fps JS on the 2GB / 4-core emulator) |
| Regression | register on the Landi profile (screenshot diff), KDS, CFD, Kiosk |

Measure and paste in the PR: tablet cold start before/after, handheld boot to
interactive Tables on the 2GB profile (target <= 3 s), tap-to-visual (< 100 ms),
sheet open (< 150 ms; `BottomSheet` animates in 120 ms).

## Out of scope here (follow-on tickets)

Adding items and sending, seating, payment, tip, cash and drawer, built-in
printer, low-battery transfer, local data policy, shared or floating handheld
stations, a floor-plan switcher on the Tables tab, portrait auth screens.

## Wave 2 + 3 — how writes reach the store

No new RPC and no new query. Every write is a register store action, so the
register's gates (closed check, station ownership, per-order PIN,
undeliverable items) and the outbox apply unchanged.

| Handheld | Register call | Notes |
| --- | --- | --- |
| Add item / custom item | `addItemToActiveOrder` | `lib/cartItem.ts` builds the CartItem ModifierScreen / OpenItemAdder build. `CheckPage` and `MenuPage` make the check the active order while mounted. |
| Options | `computeAddModeSelections`, `resolveContextPricedItem` (now exported from `useModifierSidebarStore`) | Prices come from the menu-tree copy of the item, as the register's cards pass. |
| Send | table check: `batchUpdateItemKitchenStatus` → `markCourseSent` → `dispatchAction SEND_TO_KITCHEN` (`lib/sendCourse.ts`, mirrors TableOrderView); other: `sendNewItemsToKitchenForOrder` | "Queued" chip = sent locally, items still `sync_status` pending. |
| Void / discount | manager PIN first (`lib/managerPin.ts`, same roles as ManagerPinModal) → `dispatchAction VOID_ORDER` / `voidOrder`; `applyDiscountToCheck` with DiscountBottomSheet's pre-checks | Handheld station has `can_void_orders = false`; the PIN is the approval. |
| Take over | `claimOrderById` | A check another station opened is read-only until claimed (`isOrderReadOnly`), same as the tablet's banner. |
| Seat | `startNewOrder` → `registerPendingOrderCreation` → `seatGuests({ createOrder: true, serverId })` | Signed-in employee is the server ("you'll be the server"). With per-order PIN on, `SeatPage` puts up `StaffPinScreen` first and the staff who enters it is both server and attributed creator (`setOrderAttributionStaff(..., PENDING_SEAT_ATTRIBUTION)`). |
| New takeout / delivery | `startOrResumeOrder` → `updateActiveOrderDetails` → `ensureActiveOrderCreated` | Dine in on S2 lands on the Tables tab (`lib/tabStore.ts`). With per-order PIN on, `NewOrderPage` collects the staff PIN before `start` and that staff is attributed to the order (what `ensureOrderCreated`'s PIN gate checks). |
| Require PIN per order | `useStoreSettingsStore.updateField("requirePinPerOrder")` | Me tab › Ordering, behind `ManagerPinScreen`. Same device-local field as the register's Settings › Order Line toggle; it is not synced between devices. |

Wave 3.5 (built 2026-09-21, not drawn in the artifact; file list and verify
boxes in `wave2-3-plan.md`) adds the register's item-level corrections on
the same store calls:

| Handheld | Register call | Notes |
| --- | --- | --- |
| Seat / course before adding | `useTableSeating` + `useTableCoursing` (`screens/menu/useSeatCourse.ts`), `setActiveSeat`, `setCurrentCourse` | Pills in `MenuPage`'s header; `useAddItem` mirrors ModifierScreen's `setItemSeat(…, skipBackendSync)` after the add. |
| Tap a line | `components/check/ItemSheets.tsx` under `useItemActions` | Unsent: `setItemQuantity`, `removeItemFromActiveOrder(id)`, `updateItemInActiveOrder` for options / note / seat / course (+ `setItemSeat` / `setItemCourse` with the db id for the backend). Sent: note, seat move, or void with a `VoidItemDialog` reason then manager PIN → `removeItemFromActiveOrder(id, reason)` + `printVoidTicket` when the location prints them. |
| Custom discount | `lib/discounts.ts applyCustomDiscount` → `applyDiscountToCheck` | `DiscountBottomSheet.handleApplyCustomDiscount`'s checks, verbatim. |

Still not built: the register's tax-exempt toggle is a toast with no store
write (`MoreOptionsBottomSheet.tsx` ~L424), so there is nothing to reuse
until the order gets a field; split / merge is Wave 4.

NativeWind trap, second time round: a utility class that no already-built
file uses (`grow-0`, `min-w-8`, `pt-10`…) is silently missing until Metro is
restarted with `--clear`, and the screen looks "broken" rather than erroring.
The write-phase files therefore put any spacing / sizing value that is new to
the build in `style`, and keep `className` for utilities the tablet already
compiles. Check with: every class in a new file must appear in some other
`.tsx` under `components/`, `app/` or `handheld/`.

## Handoff to Wave 4 (payment)

- Wave 3.5 is built: items carry `seatNumber` from the menu page's seat pill,
  which is what screen 6's "Split check · by seat" reads. Split / merge
  itself is Wave 4.
- No "Pay" button is rendered; `CheckFooter` has the Send action only.
- Mount `PaymentDetailBottomSheet` inside the handheld tree and lift the
  payment-journal gate in `app/_layout.tsx` (see Boot diet).
- `useCardPaymentDisabled` does not exist in the codebase; the offline
  "Card payments need a connection" state needs its own rule.

## Handoff to Wave 2 (write phase) — historical

State at the end of the Wave 1 session (2026-09-21):

- Wave 1 is read-only and page-based: Tables / Checks / Me tabs, tapping a
  row pushes `handheld/pages/TablePage` or `OrderPage` on the nested Stack.
- `tailwind.config.js` now lists `./handheld/**`; restart Metro with
  `--clear` after pulling, or handheld-only classes stay uncompiled.
- Portrait is locked from `app/_layout.tsx`; nothing in `handheld/` touches
  orientation.
- Not done: staging `db push` + the four verification queries above; the
  station-quota unblock (HQ Device Inventory, or an HQ-admin insert); Landi
  screenshot diff; perf numbers; Abubeckr's visual pass.

### Re-apply first (reviewed and confirmed, then reverted with a layout fix)

A 26-agent review confirmed these; they were rolled back together with a
StyleSheet rewrite that broke the layout on device. Each is small and
independent — apply them one at a time and check the device between them.

1. **Overtime reads a dead field.** `useTableRows.ts` and
   `useTableSummary.ts` use `useSettingsStore.defaultSittingTimeMinutes`;
   the register uses `useLocationConfigStore((s) => s.config.dining.defaultSittingTimeMinutes)`
   (`components/tables/cards/useTableCardData.ts`). Correctness, not polish.
2. Delivery rows: title should be the platform (`#1044 · DoorDash`) via
   `resolveOrderPlatformLogo({ deliveryPlatform, orderSource }).label` in
   `lib/checks.ts` `checkTitle`.
3. `LineItem`: render `<Tag label="TO GO" />` when `item.is_to_go`.
4. `CheckBody`: sent-course header "Sent 6:52 · 5 items" from
   `order.sent_to_kitchen_at` (12-hour clock, no am/pm).
5. `ListRow` detail accent: 500 weight only for warn/ok/overtime; plain
   states ("Preparing 4m") are 400 like the artifact.
6. `Card` header value: `type.price` (400), not `type.value` (500).
7. `useTableRows` `byStatus`: no `localeCompare({numeric:true})` in the
   comparator (a collator per call); precompute a numeric `sortKey`.
8. `HandheldRoot` badge: select a number from `useOrderStore`, not
   `useChecks()` (whole-map subscription re-renders the shell per broadcast).
9. `StickyActionBar`: positional keys, so "Sync now" → "Syncing…" does not
   remount the button.
10. `MeScreen`: import `syncNow` from `@/services/offlineSyncService`
    instead of subscribing through `useNetworkStatus`.

### Wave 2 pointers

- Screens 3–5 and S3–S6 in the artifact: add items (`MenuSection`), options
  sheet (`ModifierScreen` → `primitives/BottomSheet`), send
  (`SendToKitchenButton`), more-actions sheet (`MoreOptionsBottomSheet`),
  manager PIN (`ManagerPinModal` → `primitives/Keypad size="big"`).
- The "more" button goes in `PageHeader`'s `right` slot; Pay / Send go in a
  `StickyActionBar` footer on `CheckPage`.
- Writes go through the existing offline item write path and outbox
  (`PosSyncProvider`), never a new RPC from the handheld.
- When payment arrives: mount `PaymentDetailBottomSheet` inside the handheld
  tree and lift the payment-journal gate in `app/_layout.tsx`.
- Keep the file shape: `useXRows` hook + memoised row + page + primitives;
  no component over ~120 lines.
