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
- [ ] POS-only services still running on KDS: gate each one that the KDS
      doesn't need (from the boot-footprint audit).
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

### Focus header jump

The single-select quick-action row replaced the header with a fixed `s(44)`
block, but the normal header's height varies (a "Server:" line adds a row), so
focusing shrank most cards and shifted everything below. The row now overlays
the normal header, which keeps setting the height.

## Verification

- `npx tsc --noEmit`: 0 errors project-wide.
- `eslint`: `kds.tsx` has the same 9 pre-existing errors as HEAD (one fewer
  warning); no new problems in other touched files.
- `android: ./gradlew :app:compileDebugKotlin`: compiles.
- Jest: `kdsTicketBoard.test.tsx` (6) proves the layout, measured stacking,
  windowing, height reuse across remounts, and that a front-of-board bump
  re-renders and remounts no card; `kdsLowEndPerf.test.ts` (12) guards the
  idle-load fixes. All 14 KDS/storage suites pass (94 tests + the new guard).

## Files

- `android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/TcpServerModule.kt`
- `contexts/CFDProvider.tsx`
- `app/(main)/kds.tsx`
- `components/kds/KDSTicketBoard.tsx` (new)
- `stores/useKDSStore.ts`
- `lib/storage.ts`
- `services/kds/kdsSoundService.ts`
- `__tests__/kdsTicketBoard.test.tsx` (new), `__tests__/kdsLowEndPerf.test.ts` (new)

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
