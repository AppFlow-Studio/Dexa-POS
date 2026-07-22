# Kiosk Feature Architecture

Last updated: 2026-07-22

## Purpose
The kiosk feature turns a POS device/station into a self-service ordering surface. A customer starts from an attract screen, chooses dine-in or takeaway, builds a cart from the location menu, pays by card, and the paid order is sent to the kitchen.

The kiosk is identified by station type, not by a separate app. A station with `station_type = 'self_service'` routes to the kiosk experience and uses kiosk-specific profile configuration, media, orientation, cart/session state, payment handling, and reporting channel tagging.

## Product Outline
- Entry: staff selects a station in Station Select, logs in by PIN, and `self_service` stations route to `/kiosk`.
- Idle mode: customer-facing attract screen with template-specific static or carousel media.
- Active session: order type selection, menu browsing, item detail/modifiers, cart review, checkout, and success screen.
- Configuration: kiosk profile controls template, theme, orientation, media slots, idle timers, tip screen, receipt prompt flags, and terminal assignment.
- Payment: card-only checkout path using the station's configured payment terminal. Castles is wired through the shared terminal service; Dejavoo/unsupported terminal paths currently simulate in the inspected code path.
- Reporting: kiosk revenue is separated by `orders.order_source = 'kiosk'`, not `order_type` or `online_order_provider`.
- Diagnostics: manager-PIN-gated screen from the attract screen for profile/station/terminal/network checks and terminal assignment.

## High-Level Architecture
```text
Station Select
  -> selectedStation.station_type = self_service
  -> PIN Login
  -> resolvePostLoginRoute(...) = kiosk
  -> app/(main)/kiosk.tsx

Kiosk route
  -> useKioskProfile()
  -> useKioskProfileStore persisted config
  -> useKioskOrientation(config.orientation)
  -> KioskAttractScreen or KioskAttractCarouselB while idle
  -> KioskTemplateRouter while active

Ordering template
  -> order type screen
  -> menu view from useMenuStore
  -> item detail + useItemModifiers
  -> useKioskCartStore
  -> KioskCheckoutView
  -> useKioskCheckout
  -> useOrderStore + payment services
  -> order_payments + KDS
```

## Runtime Entry And Shell
The route entry point is `app/(main)/kiosk.tsx`.

Responsibilities:
- Load resolved kiosk profile via `useKioskProfile`.
- Persist and apply the active config via `useKioskProfileStore`.
- Prefetch kiosk images via `prefetchKioskImages`.
- Lock screen orientation via `useKioskOrientation`.
- Render idle/attract screen when `isIdle = true`.
- Render `KioskTemplateRouter` when a customer starts an active session.
- Open diagnostics from a long press on the attract logo/center target.

The main layout treats kiosk as a full-screen station. In `app/(main)/_layout.tsx`, kiosk stations skip normal POS chrome such as payment bottom sheets, notification sheets, payment detail sheets, online-order drawer, and POS header overlays. Realtime still runs through `LocationRealtimeProvider`.

Auth routing:
- `lib/authFlow.ts` maps `station_type = 'self_service'` to `kiosk`.
- `app/(auth)/station-select.tsx` stores `kiosk_profile_id` on `selectedStation`.
- `app/(auth)/pin-login.tsx` routes after PIN login using `resolvePostLoginRoute(selectedStation.station_type)`.

## Profile And Configuration
The kiosk profile lives in `public.kiosk_profiles`.

Primary schema migration:
- `supabase/migrations/20260524120000_create_kiosk_profiles.sql`

Media-slot migration:
- `supabase/migrations/20260716120000_kiosk_media_slots.sql`

Station payload migration:
- `utils/supabase/migrations/get_location_stations_with_kiosk_profile.sql`

Resolution order in `hooks/kiosk/useKioskProfile.ts`:
1. `stations.kiosk_profile_id`
2. Latest active `kiosk_profiles` row for the location
3. Safe default config

Client normalization happens in `types/kiosk.ts`:
- Raw row type: `KioskProfileRow`
- App-ready config: `KioskConfig`
- Normalizer: `normalizeKioskProfile`
- Helpers: `kioskIdleImages`, `kioskIdleVideo`, `kioskOrderBannerImages`

Important behavior:
- Profiles poll every 3 minutes.
- The last resolved config persists to local storage so kiosk can render instantly/offline.
- If a profile edit arrives during an active customer session, it is stored as `pendingConfig`.
- Pending config only applies when the kiosk returns to idle, preventing theme/template changes mid-order.

## Templates
Template routing is centralized in `components/kiosk/KioskTemplateRouter.tsx`.

Supported IDs:
- `template_a`
- `template_b`
- `template_c`

Template A:
- File: `components/kiosk/template-a/KioskTemplateA.tsx`
- Idle: plain welcome/logo screen.
- Menu: category rail plus item grid.
- Layout: vertical uses one-third category rail and three columns; horizontal uses one-quarter rail and four columns.

Template B:
- File: `components/kiosk/template-b/KioskTemplateB.tsx`
- Idle: full-bleed media carousel.
- Menu: Template A style rail/grid plus vertical-orientation order banner.
- Shared checkout, item detail, and cart screens.

Template C:
- File: `components/kiosk/template-c/KioskTemplateC.tsx`
- Idle: same carousel path as Template B.
- Menu: media banner plus horizontal category pill bar and item grid.
- Horizontal orientation uses a left-side media strip instead of a top banner.

Shared flow shape:
```text
orderType -> menu -> itemDetail -> cart -> checkout -> success -> idle
```

## Menu And Cart
Menu reads come from `useMenuStore`, not a kiosk-specific menu cache.

Menu filtering:
- Menus must be available now via `isMenuAvailableNow`.
- Categories must be active and available now via `isCategoryAvailableNow`.
- Items with `availability === false` are hidden.

Item detail logic:
- Shared hook: `components/kiosk/shared/useItemModifiers.ts`
- Handles required/optional groups, single/multi selection, max selection rules, default selections, quantity, and add-to-cart validation.

Cart state:
- Store: `stores/useKioskCartStore.ts`
- Cart is local-only until checkout.
- Backend order creation is intentionally deferred until the customer commits to payment.
- Cart lines store base card/cash price, quantity, selected modifiers, notes, and display image.
- Cart clears when returning to idle or after successful payment.

Pricing note:
- Kiosk checkout uses card pricing.
- `toCartItem` in `useKioskCheckout` passes base card and base cash prices separately so the existing POS order calculator handles modifiers and dual-pricing consistently.

## Checkout And Payment Flow
Checkout UI:
- `components/kiosk/template-a/KioskCheckoutView.tsx`

Checkout orchestration:
- `components/kiosk/shared/useKioskCheckout.ts`

Flow:
1. Compute totals locally with `calculateOrderTotals`.
2. Customer selects tip if enabled.
3. `startNewOrder({})` creates a local takeout order.
4. If selected, cart `orderType` patches the local order to `dine_in` or `takeout` before backend creation.
5. `ensureActiveOrderCreated` creates the backend order.
6. Cart lines are added to the active order.
7. `waitForPendingSyncs` waits for item sync.
8. Guard confirms all expected items exist and each has a backend item ID before charging.
9. Card terminal is charged.
10. `payFullCard` records the payment.
11. Only after payment success, `sendNewItemsToKitchenForOrder` sends items to KDS.
12. Success screen shows pickup/display number and returns to idle after 10 seconds or Done.

Failure behavior:
- If backend order creation fails, checkout returns an error and no payment is attempted.
- If item sync is incomplete, the partially created order is voided best-effort and payment is not attempted.
- If charge fails before approval, the unpaid order is voided best-effort.
- If payment is verifying or fails after terminal interaction, the customer is told to see staff or retry depending on result.

Payment terminal path:
- Castles terminal path uses `getSharedCastlesService`, terminal counter, and payment journal.
- Payment journal is written before terminal sale and promoted after terminal approval.
- Castles response data is mapped into `terminalResponse` for `payFullCard`.
- Dejavoo/unsupported terminal path currently simulates success in the inspected checkout hook. This is a known follow-up if real Dejavoo kiosk payment is required.

## Order Creation And Reporting Source
Kiosk orders are treated as self-service orders by station context.

Client-side order creation:
- `stores/useOrderStore.ts` sets local `order_source = 'kiosk'` for `self_service` stations.
- Kiosk orders use server name `Self Service`.
- Kiosk orders bypass per-order staff PIN attribution because no staff member rings the order.
- `ensureOrderCreated` sends `p_order_source: 'kiosk'` or `'pos'` during initial RPC creation.
- Offline replay in `services/offlineSyncInit.ts` also sends `p_order_source`.

Server-side reporting contract:
- Migration: `supabase/migrations/20260722120000_kiosk_channel_reporting.sql`
- Canonical reporting sources: `pos`, `kiosk`, `online_store`, `orderout`
- Legacy `online` rows are backfilled to `online_store`.
- `orders_order_source_canonical` constrains future values.
- `orders_enforce_order_source_channel` forces orders from self-service stations to `kiosk` server-side.
- `create_order_v2` and `create_order_v3` overloads accept `p_order_source`.
- Channel report RPCs: `get_business_day_summary_v2`, `get_sales_by_item_report_v2`, `get_payment_summary_stats_v2`, `get_admin_transaction_summary_v2`.

Important distinction:
- Reporting channel is `orders.order_source`.
- `online_order_provider = 'kiosk'` is routing/platform metadata only and must not be used as the revenue channel.
- Kiosk is intentionally not in `ONLINE_ORDER_SOURCES` in `lib/orderSource.ts`.

## Idle, Timeout, And Session Safety
Idle state lives in `useKioskProfileStore`.

Customer inactivity:
- Hook: `components/kiosk/shared/useKioskIdleTimer.ts`
- No cart: idle timeout returns to attract screen.
- Active cart/unpaid checkout: cart reset timeout shows a warning, then resets if ignored.
- Paid success screen suppresses active-cart timeout and owns its own 10-second return.

Why backend order creation is deferred:
- Walking away during menu/cart does not leave an orphan backend order.
- Backend order exists only once the customer commits to payment.
- KDS send happens only after payment success, preventing unpaid self-service tickets in the kitchen.

## Media, Orientation, And Scaling
Orientation:
- Root layout locks non-kiosk surfaces to landscape.
- Kiosk uses `hooks/kiosk/useKioskOrientation.ts`.
- Profile orientation maps `vertical` to portrait and `horizontal` to landscape.

Scaling:
- `components/kiosk/shared/KioskScaleProvider.tsx`
- Uses kiosk UI scale so large kiosk displays can scale beyond normal tablet POS limits.
- `kioskPx` is used for raw numeric sizes.

Media:
- `lib/kioskMediaPrefetch.ts` prefetches logo and all orientation-specific images.
- `components/kiosk/template-b/KioskMediaCarousel.tsx` handles image cross-fade and idle video playback.
- Images stay mounted and opacity-animate to avoid white flashes.
- Video is mounted only for the active video slide.

Media slots:
- Logo: single `logo_url`
- Idle images: vertical and horizontal arrays
- Idle video: vertical and horizontal URL
- Order banner images: vertical and horizontal arrays
- Video is idle-only, not used in order banner.

## Diagnostics And Device Management
Diagnostics entry:
- Long press the attract logo or center target for about 2 seconds.
- Manager PIN modal gates access: `components/kiosk/shared/KioskAdminPinModal.tsx`.
- Diagnostics screen: `components/kiosk/shared/KioskDiagnosticsScreen.tsx`.

Diagnostics capabilities in inspected code:
- Shows selected location/station/profile context.
- Shows network status and pending sync count.
- Shows current payment terminal status.
- Tests terminal connection.
- Assigns an existing terminal to the kiosk station.
- Registers a new terminal.
- Edits terminal config.
- Updates `kiosk_profiles.payment_terminal_id` when terminal assignment changes.
- Invalidates the kiosk profile query so config refreshes.

Native lock-task:
- Wrapper: `native/kiosk/LockTask.ts`
- Supports Android-only `enterLockTask`, `exitLockTask`, and `isLockTaskActive`.
- The wrapper exists, but the inspected kiosk route does not directly call it. If production kiosk lockdown is required, verify native module wiring and where lifecycle calls should run.

## Database Objects
Core kiosk objects:
- `kiosk_profiles`: profile/theme/template/media/behavior/terminal config.
- `stations.kiosk_profile_id`: links a self-service station to a kiosk profile.
- `kiosk_pickup_sequences`: sequence table intended for kiosk pickup numbers.
- `payment_terminals`: terminal assignment for kiosk station.
- `station_devices`: station-to-terminal association used by station payload RPC.
- `orders.order_source`: reporting channel.
- `order_payments`: payment record used by reporting and EOD summaries.

RPC/function touchpoints:
- `get_location_stations_with_status`: includes `kiosk_profile_id` and active terminal payload.
- `create_order_v2` / `create_order_v3`: current POS-backed order creation path.
- `get_business_day_summary_v2`: adds `by_channel`.
- `get_sales_by_item_report_v2`: optional channel filter.
- `get_payment_summary_stats_v2`: optional channel filter.
- `get_admin_transaction_summary_v2`: channel rows for HQ/admin reporting.

## File Map
| Area | Files |
| --- | --- |
| Kiosk route | `app/(main)/kiosk.tsx` |
| Full-screen shell | `app/(main)/_layout.tsx`, `app/_layout.tsx` |
| Auth/station routing | `lib/authFlow.ts`, `app/(auth)/station-select.tsx`, `app/(auth)/pin-login.tsx` |
| Profile loading | `hooks/kiosk/useKioskProfile.ts`, `stores/useKioskProfileStore.ts`, `types/kiosk.ts` |
| Orientation/scaling | `hooks/kiosk/useKioskOrientation.ts`, `components/kiosk/shared/KioskScaleProvider.tsx` |
| Attract screens | `components/kiosk/KioskAttractScreen.tsx`, `components/kiosk/template-b/KioskAttractCarouselB.tsx` |
| Template routing | `components/kiosk/KioskTemplateRouter.tsx` |
| Templates | `components/kiosk/template-a/KioskTemplateA.tsx`, `components/kiosk/template-b/KioskTemplateB.tsx`, `components/kiosk/template-c/KioskTemplateC.tsx` |
| Menus | `components/kiosk/template-a/KioskMenuView.tsx`, `components/kiosk/template-b/KioskMenuViewB.tsx`, `components/kiosk/template-c/KioskMenuViewC.tsx` |
| Item details/modifiers | `components/kiosk/template-a/KioskItemDetail.tsx`, `components/kiosk/shared/useItemModifiers.ts` |
| Cart | `stores/useKioskCartStore.ts`, `components/kiosk/shared/KioskCartView.tsx`, `components/kiosk/shared/KioskCartButton.tsx` |
| Checkout | `components/kiosk/template-a/KioskCheckoutView.tsx`, `components/kiosk/shared/useKioskCheckout.ts` |
| Diagnostics | `components/kiosk/shared/KioskDiagnosticsScreen.tsx`, `components/kiosk/shared/KioskAdminPinModal.tsx` |
| Media | `components/kiosk/template-b/KioskMediaCarousel.tsx`, `lib/kioskMediaPrefetch.ts` |
| Native kiosk mode | `native/kiosk/LockTask.ts` |
| Reporting channel | `lib/orderSource.ts`, `supabase/migrations/20260722120000_kiosk_channel_reporting.sql` |
| Schema migrations | `supabase/migrations/20260524120000_create_kiosk_profiles.sql`, `supabase/migrations/20260716120000_kiosk_media_slots.sql`, `utils/supabase/migrations/get_location_stations_with_kiosk_profile.sql` |

## Extension Guide
To add a new template:
1. Add the template id to `KioskTemplateId` in `types/kiosk.ts`.
2. Add the DB check value to `kiosk_profiles_template_check`.
3. Create the template component under `components/kiosk/template-*`.
4. Register it in `KioskTemplateRouter`.
5. Reuse shared cart, item modifier, checkout, idle timer, and media helpers unless behavior truly differs.

To add a new profile field:
1. Add the column/migration in Supabase.
2. Add it to `KioskConfig`.
3. Resolve it in `normalizeKioskProfile`.
4. Add a default in `DEFAULT_KIOSK_CONFIG`.
5. Consume it in the relevant template/shared component.
6. Confirm pending profile updates still apply only on idle.

To add a new reporting channel:
1. Add the source to the DB CHECK constraint through a migration.
2. Update `CANONICAL_ORDER_SOURCES`.
3. Update `normalize_order_source` in SQL and `normalizeOrderSourceChannel` in TS.
4. Update channel report RPC channel lists and labels.
5. Add website/dashboard labels and filters.

## QA Checklist
Station/profile:
- Select a `self_service` station and confirm PIN login routes to kiosk.
- Confirm `selectedStation.kiosk_profile_id` is present when linked.
- Confirm no POS header, payment sheets, online drawer, or normal POS chrome appears.
- Change profile theme/template/orientation in DB/dashboard and confirm active session does not change until returning to idle.

Templates:
- Template A: plain attract, category rail/grid menu, item detail, cart, checkout.
- Template B: media attract carousel, menu banner in vertical orientation, shared checkout.
- Template C: media attract carousel, pill-bar menu, horizontal media strip behavior.
- Test vertical and horizontal orientations.

Cart/modifiers:
- Required modifiers block Add until selected.
- Single-choice groups replace selection.
- Multi-choice groups respect max selection.
- Defaults preselect correctly.
- Cart quantity/change/remove works.
- Card and cash base prices stay distinct in generated cart items.

Checkout:
- Tip presets and no-tip path work.
- No backend order is created before checkout payment commit.
- Incomplete item sync prevents charging.
- Failed charge voids unpaid order best-effort.
- Successful payment records payment, sends to KDS, and shows pickup/display number.
- Success screen returns to idle and clears cart.

Terminal/diagnostics:
- Long press attract screen opens manager PIN modal.
- Diagnostics shows profile/station/network/terminal state.
- Assigning/registering terminal updates station/profile and refreshes kiosk config.
- Castles payment path works against real terminal.
- Dejavoo path needs explicit production verification because inspected hook simulates unsupported/Dejavoo terminals.

Reporting:
- New kiosk order writes `orders.order_source = 'kiosk'`.
- Kiosk order does not appear as online/platform revenue.
- `get_business_day_summary_v2.by_channel` includes kiosk and reconciles to headline totals.
- Item-sales/payment-summary v2 filter by `p_order_source = 'kiosk'`.
- Refund of kiosk order stays attributed to kiosk.

## Known Gaps And Watch Items
- `create_kiosk_order` is not present in this POS branch. If T4 adds it later, review the live function body and confirm it sets `order_source = 'kiosk'` server-side.
- Checkout currently uses the existing POS `create_order_v2/v3` path. This is protected by station-based DB enforcement, but a dedicated kiosk RPC would be cleaner long term.
- Dejavoo/unsupported terminal checkout path is simulated in `useKioskCheckout`; do not assume live Dejavoo kiosk payment is complete without testing/fixing that path.
- Receipt prompt fields exist in config, but the inspected checkout flow does not implement customer email/SMS receipt collection.
- `autoPrintReceipt` exists in config, but the inspected checkout flow does not show receipt printing after payment.
- Native Android lock-task wrapper exists, but route-level lifecycle calls were not found in the inspected kiosk route.
- Kiosk pickup sequence table exists, but checkout currently displays the order display number from `useOrderStore`; verify whether dedicated kiosk pickup numbering is required.
- Profile defaults use safe fallback config when no active profile exists; production rollout should prefer explicit active kiosk profiles.
