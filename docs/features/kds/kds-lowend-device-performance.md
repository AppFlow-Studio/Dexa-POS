# KDS performance on low-end (4GB) Android tablets

## Summary

KDS stations run on older ~4GB Android tablets. Rendering, navigation, tapping
cards, entering the manager PIN, and bumping (2–4s freeze on a front-of-board
bump) all lag. The lag predates `MasonryFlashList` (2026-08-27), so the list
library is not the root cause.

Evidence from the SM-P613 (Galaxy Tab S6 Lite, 3.5GB usable, debug build),
KDS board idle with 25 pending + 28 cooking tickets and nobody touching it:

- ~400–575% total app CPU. Two Kotlin `DefaultDispatch` threads at ~145% each
  were `TcpServerModule.startServer`'s accept loop spinning on a closed socket
  (`Accept error: Socket is closed`, thousands of lines/sec).
- The board redraws continuously at 60fps: 585 frames in 10 idle seconds, each
  a full 2000×1200 repaint (~12ms on RenderThread) of ~1,000 native views
  including 94 SVG icons. The only continuously changing pixels were the
  header's looping `PulsingDot`; the per-card timers change once a second.
- 4–8 ExoPlayer instances alive (4 per `KDSSoundService`).

## Scope

- Layout is product-fixed: tickets flow left to right across N columns, and the
  whole board scrolls as one surface. Every fix keeps that layout.
- KDS runtime only. The POS keeps its behavior, except that the TCP server fix
  also applies to the POS (the leak exists there too).

## Non-scope

- Backend/RPC changes.
- Visual redesign of the ticket card.

## Plan

- [x] `TcpServerModule.kt`: track the accept `Job`, cancel it on stop, exit
      the loop once the socket is closed, back off on real accept errors,
      close a socket whose start was superseded.
- [x] `CFDProvider.tsx`: never start the CFD server (TCP + mDNS + foreground
      service) on a KDS station.
- [x] `kds.tsx` header: static connection dot instead of an infinite
      `Animated.loop` (removes the 60fps full-window repaint).
- [x] `useKDSStore` persist: stable `partialize` so the 1Hz timer tick (and
      other non-persisted changes) stops re-stringifying every ticket each second.
- [x] `kdsSoundService.ts`: one shared, lazily created player per preset for
      the whole app instead of 4 preloaded players per instance.
- [x] Bump path: `KDSTicketBoard` replaces `MasonryFlashList`. Same layout, but a
      bump moves cards instead of re-rendering/remounting them.
- [x] Focus: quick actions overlay the card header instead of replacing it, so
      tapping a ticket no longer resizes it and shifts the cards below.
- [x] Settings round trip: KDS settings open as a panel over the board
      (`KdsSettingsPanel`) instead of the `/kds-settings` route, so the board
      is never unmounted. Hardware back closes it; closing refreshes the
      display config + tickets in the background.
- [x] Settings race: on a KDS device, settings only fetches the device's own
      display config (it could fetch station index 0's first).
- [x] First paint: the board mounts only on-screen cards in the first frame;
      the off-screen buffer mounts after that frame paints.
- [x] Online-orders drawer on KDS: bounded to the current business day like
      the POS drawer; online orders from an earlier business day are pruned
      when the day rolls over; order cards show the date for non-today orders.
- [x] PIN entry, app-wide: one `usePinEntry` hook for all 13 PinNumpad
      screens (fixes the extra-digit and dropped-digit bugs under fast typing);
      keys register on touch-down with a native ripple and don't re-render per
      digit; no auto-submit wherever a Confirm button is shown.
- [ ] POS-only services still running on KDS: gate each one that the KDS
      doesn't need (the audit workflow stalled; re-run against current code).
- [ ] Remaining verified audit findings (render, interaction, memory).

## Progress

### Why a bump froze the board (and did before FlashList too)

Left-to-right flow means bumping the front ticket moves every later ticket to a
different column. `MasonryFlashList` (v1, no `optimizeItemArrangement`) deals
tickets round-robin into one nested list per column, so after a bump every
column list holds different tickets at every index: every mounted cell rebinds
to a new ticket, every card body re-renders, and every cell re-measures because
the heights no longer match. The earlier column-per-list layout expressed the
same move as unmount + remount of every card.

`components/kds/KDSTicketBoard.tsx` keeps the exact layout (ticket i → column
i % columns, one `ScrollView`) but keys each card by `ticket_id` and absolutely
positions it. A bump recomputes positions from cached heights in O(n); moved
cards get new `left/top` and their memoized bodies skip rendering. Heights are
measured once per ticket via `onLayout` on the slot's inner view (fires only on
a size change, never on a move) and cached per width across tab switches. Cards
more than one viewport above or two below the scroll position aren't mounted.

### Settings → back was a full rebuild

The `(main)` group swaps routes through `<Slot />`, not a stack, so
`router.push("/kds-settings")` unmounted the entire board and "Back" rebuilt it:
every card, the sound service (players released and recreated), polling, the
realtime callback. While settings was open, new-order sounds stopped. Unmount
also ran `useKDSStore._cleanup`, which cancels in-flight bump retries and
clears recall state and acknowledged notices. The board now stays mounted
under the settings panel, so none of that happens; closing does the two
refreshes the remount used to (`fetchKDSDisplay`, background ticket fetch).

### Stale online orders only on the KDS drawer

The KDS skips `useOrdersQuery`, so `useKdsOnlineOrdersBootstrap` seeds the
order store for the drawer. It loaded every online order in an active status
(`pending`→`ready`) with no date bound, so any order that never reached a
terminal status — from any day — sat in the KDS drawer (75 on staging). The POS
drawer reads the same store, but the POS loads it through `useOrdersQuery`,
which is floored at the business-day start, so the POS never showed them.
Cards printed only a time ("2:45 PM"), so old orders read as current.

The bootstrap now uses the same floor (`resolveBusinessDayStartUtc`, exported
from `useOrdersQuery`), and after each refresh prunes online orders opened
before the business day that the fetch no longer returns, so a board left
running across the rollover sheds yesterday's leftovers. `formatOrderTime`
(`lib/onlineOrderLabel.ts`) prefixes the date for any order not placed today.
The narrower query is also cheaper — this embed is the platform's most
expensive statement (see the PERF note in the hook).

### PIN entry (whole app)

Every PinNumpad screen had its own digit handler, each with one of two
stale-state bugs that only show under fast typing on a slow device (several
taps land before the next render): `if (pin.length < 4) setPin(prev => prev + d)`
checks a stale length but appends to the latest value, so the PIN grew past 4 —
on login, Sign In stayed disabled until the user backspaced an invisible 5th
digit; `setPin(pin + d)` builds from a stale value and drops digits. MainMenu
and the tables Sidebar also auto-submitted through `setTimeout(submit, 100)`,
which read a 3-digit `currentPin` whenever the re-render took longer than
100ms.

`hooks/usePinEntry.ts` keeps the digits in a ref that each key press reads and
writes synchronously, and exposes a stable `onKeyPress`. `PinNumpad` registers
keys on touch-down with a native Android ripple (instant even when JS is busy)
and memoizes its keys so a digit re-renders only the dots. Product rule: a
prompt that shows a Confirm/Verify button never submits on its own; only
`OrderPinGate` (no confirm button) submits on the 4th digit.

Found along the way, not changed: the tables Sidebar manager-PIN gate accepts
any 4 digits (`TODO: Implement actual PIN validation`); `ManagerApprovalModal`
has a no-op keypad but is imported nowhere. MainMenu no longer logs stored PINs.

### Focus header jump

The single-select quick-action row replaced the header with a fixed `s(44)`
block, but the normal header's height varies (a "Server:" line adds a row), so
focusing shrank most cards and shifted everything below. The row now overlays
the normal header, which keeps setting the height.

## Verification

- `npx tsc --noEmit`: 0 errors project-wide.
- `eslint`: `kds.tsx` has exactly HEAD's pre-existing problems (9 errors, 11
  warnings); no new problems in other touched files.
- `android: ./gradlew :app:compileDebugKotlin`: compiles.
- Jest: `kdsTicketBoard.test.tsx` (7) proves the layout, measured stacking,
  staged first paint, windowing, height reuse across remounts, and that a
  front-of-board bump re-renders and remounts no card; `kdsLowEndPerf.test.ts`
  (14) guards the idle-load, header, and settings-panel fixes. All KDS suites
  pass (86 tests). `kdsOnlineOrdersBusinessDay.test.ts` (7) covers the date
  label, the business-day query floor, and rollover pruning; all 9
  online-order suites pass (100 tests). `usePinEntry.test.tsx` (32) covers
  rapid taps from one stale render (never >4 digits, never a dropped digit),
  backspace/clear, disabled, stable handler, every PIN screen on the hook, and
  no auto-submit where a Confirm button shows. Lint on all 15 PIN files
  matches HEAD.

## Files

- `android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/TcpServerModule.kt`
- `contexts/CFDProvider.tsx`
- `app/(main)/kds.tsx`
- `components/kds/KDSTicketBoard.tsx` (new)
- `stores/useKDSStore.ts`
- `lib/storage.ts`
- `services/kds/kdsSoundService.ts`
- `components/kds/KdsSettingsPanel.tsx` (new), `app/(main)/kds-settings.tsx`
- `app/(main)/settings/kds.tsx`
- `hooks/pos/useKdsOnlineOrdersBootstrap.ts`, `hooks/pos/useOrdersQuery.ts`
- `lib/onlineOrderLabel.ts`, `components/online-orders/OnlineOrderCard.tsx`
- `hooks/usePinEntry.ts` (new), `components/auth/PinNumpad.tsx`, and the 13 PIN
  screens (`app/(auth)/pin-login.tsx`, `app/(main)/settings/{kds,general}.tsx`,
  `components/{MainMenu,tables/Sidebar,bill/MoreOptionsBottomSheet}.tsx`,
  `components/auth/{DeactivateTerminalModal,OrderPinGate}.tsx`,
  `components/timeclock/{PinInputModal,ClockInOutModal}.tsx`,
  `components/settings/security-and-login/SwitchAccountModal.tsx`,
  `components/cash-drawer/{NoSaleModal,PayInOutModal}.tsx`)
- `__tests__/usePinEntry.test.tsx` (new),
  `__tests__/kdsTicketBoard.test.tsx` (new), `__tests__/kdsLowEndPerf.test.ts` (new),
  `__tests__/kdsOnlineOrdersBusinessDay.test.ts` (new)

## Open QA

- On-device (release build) before/after: idle CPU per thread, idle frame count,
  bump-to-paint time on a 50-ticket board, PIN modal open and keypress latency.
- The TCP server fix is native: it ships only with a new build (EAS), not an
  OTA update. All JS changes can go out over the air.
- Board: fling-scroll a long board (cards mount as they near the viewport),
  switch tabs back and forth, bump from the front, focus/unfocus a card with a
  "Server:" line, change column count in KDS settings.
- Sounds: new-order sound on first order after launch (players now warm from
  the configured presets), settings previews on each preset.
- Online-orders drawer on KDS: only today's (business-day) active online
  orders; count matches the POS drawer; a board left running past the
  business-day rollover drops yesterday's leftovers within ~2 min.
- PIN (login, KDS manager PIN, clock in/out, cash drawer, tax exempt): type
  fast with two thumbs — never more than 4 dots' worth, never a lost digit;
  nothing submits until Confirm/Sign In is tapped (except the per-order PIN
  gate, which has no confirm button); keys look unchanged and ripple on press.
- Settings panel: open (PIN), change columns / workflow / sounds, close with
  the Back button and with Android back — board updates without a reload; a
  new order arriving while settings is open plays its sound; logout from
  settings still returns to login.
