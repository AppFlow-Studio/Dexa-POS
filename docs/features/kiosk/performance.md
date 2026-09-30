# Kiosk performance

Work to make the kiosk fast and light on every device it runs on, down to
low-memory Android tablets. Started 2026-09-28 on branch `kiosk-perf`, after
customer reports that the kiosk felt slow, one of them naming a specific moment:
choosing **Dine In / Takeaway** and then waiting for the menu.

The same code runs on every device. There are no device classes or low-memory
modes; each change below makes the kiosk itself cheaper.

## What was slow

Found by reading the code (no device profiling was done; see Verification).

1. **The order-type tap built the whole ordering screen.** None of the menu
   existed before the tap on Dine In / Takeaway. The header, category rail and
   grid mounted in the frames after it, while two screen fades ran. The grid
   then needed a second render to measure itself, ran its own fade-and-lift,
   and only then started downloading photos (the kiosk never prefetched them).
2. **Menu photos decoded at full resolution.** The menu cards, item detail and
   cart used React Native's `Image`, which on Android only downsamples local
   files. A network photo decoded at its uploaded size: a 12 MP phone photo is
   a ~48 MB bitmap behind a 300 px card.
3. **A kiosk ran the POS's background work.** Station gating existed only for
   KDS, so a kiosk loaded up to 200 of the location's active orders, merged
   every order broadcast in the location into three stores, joined the floor
   channel, ran the CFD server, synced floor plans and re-synced staff every 5
   minutes. The kiosk shows none of it.
4. **"Tap to start" waited on two network calls in a row**, with nothing on
   screen. It then replaced the station object even when nothing had changed,
   which re-rendered the app's providers and rewrote a persisted blob.
5. **The attract screen kept every slide decoded** (about 8 MB each on a
   1080×1920 panel), prefetched both orientations' images into memory, and
   created a video player even when there was no video.
6. **The staff-only settings screen loaded with the kiosk**: 3,161 lines, plus
   the profile editor behind it.

## What changed

### Order type → menu

- [x] The menu is built behind the order-type screen while the customer reads
      it (`useKioskOrderTypeStep`, used by all three templates). Once the
      screen's entrance has played, the ordering screen mounts underneath in a
      transition. It is hidden with `opacity: 0`, not `display: "none"`, so the
      grid still measures itself, mounts its cells and starts loading photos.
      The tap then only swaps which layer shows, and the order-type screen
      fades out over the menu.
- [x] A tap that beats the prebuild finishes it in the same transition. The
      order-type screen stays up, with the chosen tile ringed, until the menu
      has committed. Once one tile is chosen, both stop taking taps.
- [x] The grid's fade-and-lift only runs on a category switch, not on mount.
- [x] The category rail draws its selection fill only on the selected row,
      and still cross-fades it (layout animation), instead of keeping two
      animated values on every row. The first render covers the rows that fit
      on the panel, and the window beyond it is smaller (`windowSize` 5).

### Images and media

- [x] Menu cards (all three shapes), item detail and cart use
      `OptimizedListImage` (expo-image), which decodes at the view's size.
      Grid cells pass `recyclingKey` so a recycled cell never shows the
      previous item's photo.
- [x] Every kiosk-visible menu photo is downloaded to the disk cache after
      start-up and after each menu sync, six at a time, new photos only
      (`prefetchKioskMenuImages`).
- [x] Attract and banner images are prefetched to disk, not into memory.
- [x] `KioskMediaCarousel` mounts three image layers (previous, current,
      next) instead of every slide. The next slide is still decoded a whole
      slide ahead, so the cross-fade doesn't flash. The video player exists
      only while a video slide is showing.

### Background work on a kiosk

`PosSyncProvider`, `CFDProvider`, `LocationRealtimeProvider` and the main
layout now know about kiosks (`station_type === "self_service"`):

| Subsystem | On a kiosk | Why |
| --- | --- | --- |
| Menu sync, snooze reconcile, menu version watch, delta sync | Kept | The kiosk shows the menu. |
| Tax rates, receipt templates | Kept | Checkout pricing and receipts. |
| Employee sync at start-up and on resume | Kept | `KioskAdminPinModal` checks the manager PIN locally. |
| Employee resync every 5 minutes | Replaced: syncs when the PIN modal opens | PINs only matter when a manager opens Kiosk Settings. |
| Payment terminal, printers, `PrinterService`, order store, offline sync, outbox, heartbeat, order reconcile, draft cleanup | Kept | Checkout builds, pays and prints its own order through them. |
| `useOrdersQuery` (the location's active orders) and its resume refresh | Off | Nothing on the kiosk lists orders. |
| Order broadcasts | Only this station's orders, or ones the store already tracks | Everything else was merged into the order store, Previous Orders and the KDS store. |
| Floor channel, `useTableSessionInit`, floor-plan sync and resume refresh | Off | A kiosk has no tables. |
| CFD server (TCP listener, mDNS advert, foreground service) | Off | The kiosk is itself the customer's screen. |
| Business-day rollover, active-shift hydration | Off | They refresh Previous Orders and the timeclock, which a kiosk doesn't show. |
| Star printer health check and discovery | Only with a receipt printer assigned | |

A POS station that opens the kiosk route keeps its full feed; only a real kiosk
station narrows it.

### Start and settings

- [x] "Tap to start" shows the order-type screen at once. The access check
      (`checkKioskAccess`) runs alongside it, and the template awaits it before
      revealing the menu. A failure returns to the attract screen with the
      existing notice, before anyone reaches the menu. A pass skips the check
      for the next two minutes. Checkout still re-checks before it creates the
      order and before it charges.
- [x] `refreshSelectedStationOperationalState` replaces the selected station
      only when a field changed. Kiosk checkout calls it twice, so this helps
      there too.
- [x] `KioskDiagnosticsScreen` is lazy-loaded when staff open it.

## Not done, and why

- **Thumbnails.** Photos still download at their uploaded size, even though
  they now decode small. Serving a resized image needs Supabase image
  transformations or thumbnails written at upload time, and the upload code
  lives in the website repo.
- **Billing and station calls in parallel.** Tried and reverted:
  `posAccessService.test.ts` pins that a suspended merchant is refused before
  the station and terminal assignment is fetched. The start check no longer
  blocks the tap, so the sequential order costs the customer nothing there.
- **Lazy-loading the templates.** They share almost all their code; the
  template-only modules are small, and lazy loading would risk a blank frame on
  the first Start.
- **Metro `inlineRequires`.** App-wide, not kiosk-only: it changes when every
  module's import side effects run, including the payment path. It is still
  lever 1 in `docs/engineering/performance/startup-and-bundle.md` and needs a
  device pass on POS and KDS first.
- **Checkout round trips.** The items sync in parallel (one round trip, not
  one per line), then `waitForPendingSyncs`. A single create-with-items RPC
  would be a backend change.
- **Keeping the ordering screen mounted between customers.** Every session
  after the first would start instantly, but the menu would stay in memory
  under the attract screen, and any state the reset missed would leak to the
  next customer. Worth deciding once the changes above have been used in the
  field.

## Keep as is

These are deliberate (see the README), and the changes work around them:

- The grid is a FlashList with exact cell heights, and renders only after
  measuring itself — which is why the prebuilt menu is hidden with opacity.
- Screens are stacked and cross-fade.
- No `removeClippedSubviews` on kiosk lists.

## Verification

- `npx tsc --noEmit`: no errors in changed files. The 5 errors in
  `services/printing/PrinterService.ts` were already there and are untouched.
- ESLint on every changed file: 0 errors; the 16 warnings are all on lines
  this work didn't touch.
- Existing Jest suites: all eight kiosk suites and `posAccessService` pass
  (159 tests).
- **Not yet checked on a device.** On a production build on a low-memory
  tablet, check:
  - order type → menu (should swap with no pause);
  - that category switching and photos look right, including recycled cells
    while scrolling;
  - the attract carousel with 3+ images, and with a video;
  - that the manager PIN works after a PIN change on the website;
  - a full card checkout with a receipt;
  - `adb shell dumpsys meminfo com.temurappflowstudios.dexapos` before and
    after.

## Open questions

- Which devices, template and attract media do the reporting customers run?
- How large are the images in storage? (This decides how much thumbnails
  would save.)
