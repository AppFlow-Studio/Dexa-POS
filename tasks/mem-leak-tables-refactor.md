# MEM-LEAK-TABLES: Refactor tables section to eliminate Reanimated worklet memory leaks

## Summary
Both Sidebar and FloorPlan (TableLayoutView + DraggableTable) leak native memory when navigating away from `/tables`. Root cause: excessive Reanimated worklet/shared-value creation per visit (~1000+ worklets for 28 tables) whose native JSI objects accumulate because the Cleaner queue doesn't drain fast enough, even with `cancelAnimation` cleanup and `detachInactiveScreens: true`.

## Scope
- **Sidebar.tsx**: Remove all Reanimated animations (width expand/collapse, text opacity). Replace with plain conditional rendering.
- **TableLayoutView.tsx**: Remove crossfade skeleton animation, remove entry animation. Keep canvas pan/zoom gestures (they're essential).
- **DraggableTable.tsx**: Remove entry animation, pulse animation, PulsingBorder, ReservationBadge animation. Keep drag gesture (essential for edit mode).
- **Panels (TablesPanel, WaitlistPanel, etc.)**: Remove `Animated.View` with `Layout` animations from Section component.

## Non-scope
- No changes to stores, hooks, or data layer
- No changes to gesture handlers for drag/pan/zoom (these are essential)
- No changes to SVG components
- No changes to `lib/screenConfig.ts` (already has `detachInactiveScreens: true`)

## Plan
1. Refactor `Sidebar.tsx` - strip Reanimated, use plain View/Text
2. Refactor `TableLayoutView.tsx` - strip crossfade + entry animations, keep canvas gestures
3. Refactor `DraggableTable.tsx` - strip entry/pulse/border animations, keep drag gesture
4. Refactor `TablesPanel.tsx` - strip `Animated.View` with `Layout` from Section
5. Refactor `WaitlistPanel.tsx` - same treatment
6. Refactor `ReservationsPanel.tsx` - same treatment
7. Refactor `HistoryPanel.tsx` - same treatment

## Progress
- [x] Analyze root cause and plan
- [x] Refactor Sidebar.tsx
- [x] Refactor TableLayoutView.tsx
- [x] Refactor DraggableTable.tsx
- [x] Refactor TablesPanel.tsx
- [x] Refactor WaitlistPanel.tsx
- [x] Refactor ReservationsPanel.tsx
- [x] Refactor HistoryPanel.tsx (no Reanimated usage found)
- [x] Verify no TypeScript errors from refactored files

## Verification
- TypeScript compilation passes
- No Reanimated imports remain in Sidebar.tsx
- No entry/pulse/border animations remain in DraggableTable.tsx
- No crossfade/skeleton animations remain in TableLayoutView.tsx
- No `Animated.View` with `Layout` in panel components

## Files
- components/tables/Sidebar.tsx
- components/tables/TableLayoutView.tsx
- components/tables/DraggableTable.tsx
- components/panels/TablesPanel.tsx
- components/panels/WaitlistPanel.tsx
- components/panels/ReservationsPanel.tsx
- components/panels/HistoryPanel.tsx

## Open QA
- Need to verify on-device that Native Heap no longer climbs on /tables navigation

---

## Phase 2 — Shared-value allocation (the actual leak)

Phase 1 stripped the *visual* animations but the Native Heap kept climbing. Root cause was
not the animations — it was the **Reanimated shared values + animated styles themselves**,
allocated unconditionally per table per mount even in the read-only `/tables` view.

### Changes
1. **DraggableTable.tsx — split by `isEditMode`**
   - `StaticTable` (view mode, the `/tables` common path): plain `View` + inline
     `transform` from `table.x/y/rotation`. **Zero `useSharedValue` / `useAnimatedStyle`.**
     Was ~12 SV + 2 animated styles per table (~390 native JSI objects per 28-table visit).
   - `EditableTable` (floor-plan editor only): keeps all drag/rotate/wall-resize shared
     values + gestures. Heavy footprint paid only when actually editing.
   - Shared logic extracted to `useTableCardData` hook + `TableCardContent` component —
     no change to labels/badges/colors/server-initials/reservation behavior.
2. **Deleted `lib/tablePositionRegistry.ts`** — `getTablePositionSV` had zero consumers;
   dead code that pinned 2 SV refs per table per mount. Removed import + registering effect.
3. **TableLayoutView.tsx** — removed the residual `opacity` shared value + `withTiming(1)`
   reveals, the `cancelAnimation(opacity)` target, and the now-unused `withTiming` import.
   Camera pan/zoom shared values kept (essential).

### Not done (deferred until on-device verification)
- Table order view subtree (`TableOrderView` → `MenuSection` / `TableBillSection` /
  bottom sheets) not audited. `TableOrderView` itself has no Reanimated; children may.
  Revisit only if heap still climbs on order open/close after Phase 2.

---

## Phase 3 — Interrupted-transition retain (the actual root cause of fast-nav growth)

On-device observation: navigating **slowly**, native heap drops back down; navigating
**fast**, it stays high / climbs and does NOT recover on idle. That rules out simple GC-lag
(idle would recover) and points to a real retain that only releases on the slow path.

### Root cause
`POS_SCREEN_OPTIONS` used `animation: 'fade'` (`animationDuration: 150`). The
react-native-screens cleanup that releases the removed screen's view tree parked in
`ViewGroup.mTransitioningViews` runs via `onViewAnimationEnd() → endRemovalTransition()`,
which is driven by `View#onAnimationEnd`. That callback **only fires when the animation
completes**. A fast navigation that starts the next transition before the 150ms fade finishes
**interrupts** the animation → `onAnimationEnd` never fires → the entire removed view tree
(SVG / ReactViewGroup subtrees) stays strongly retained. Slow navigation lets the fade
complete, so cleanup runs and the heap drops. Exactly matches the symptom.

The existing `onDestroy` patch only covered the `animation:'none'` case; it did not reliably
fire for an interrupted `'fade'` either.

### Fixes
1. **lib/screenConfig.ts** — `animation: 'fade' (150ms)` → **`animation: 'none'`**. No
   transition to interrupt, so cleanup no longer depends on an animation completing.
2. **patches/react-native-screens+4.11.1.patch** — added an `onDestroyView()` override that
   calls `screen.endRemovalTransition()` before view teardown. `onDestroyView` runs on every
   view teardown regardless of animation state (incl. interrupted transitions) and fires
   before `onDestroy`, so the parked view tree is released deterministically on every
   navigation, fast or slow. `endRemovalTransition()` guards on `isBeingRemoved` → safe no-op
   when already ended. (Existing `onDestroy` cleanup kept as belt-and-suspenders.)
   - Note: had to `rm -rf node_modules/react-native-screens/android/{.cxx,build}` before
     `npx patch-package` — stale native build artifacts had Windows-too-long paths that broke
     patch-package's internal git index.

### Verify (requires a native rebuild — patch + screenConfig)
- `npm run android` (rebuilds native; patch-package applies on postinstall/prebuild).
- Profile: enter/exit `/tables` **fast** ×10. Native heap should now plateau/recover even
  under fast navigation (previously only recovered on slow navigation).
- Confirm navigation still feels fine with instant (`'none'`) transitions on the POS routes.

### Verify (on-device — chosen path)
- Build with Phase 2 changes. Android Studio Profiler → Native (or
  `adb shell dumpsys meminfo <pkg>`). Baseline, then enter/exit `/tables` ×10.
  Native Heap should plateau instead of climbing per-visit.
- Functional smoke (view mode): tap → context sheet, long-press → order overlay,
  colors/badges/duration update live, table positions/rotations render correctly.
- Edit mode (`/tables/floor-plan`): drag, wall-resize, rotate, lock still work + persist.