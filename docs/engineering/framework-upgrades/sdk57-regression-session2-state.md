# SDK 53→57 Regression — Session 2 state & handoff

Continues `docs/engineering/framework-upgrades/sdk57-regression-plan.md`. Branch `feat/landi-pay`. Device: Landi P30 (serial `264EAPTW0078`, pkg `com.temurappflowstudios.dexapos`). Staff PIN: **1388** (manager "Temur").

## TL;DR
- **Toast fix (moti → reanimated): DONE, applied, NOT yet verified.** Low risk.
- **Bottom-sheet fix: the upstream fix (PR #2720) is applied + confirmed in the running bundle, but it is INSUFFICIENT.** Sheets still mount off-screen. Do **NOT** commit it as-is. Root cause is deeper (reanimated 4.5, not just one reaction).

## What was changed this session
1. **`components/ui/CustomToast.tsx` + `components/ui/ToastContainer.tsx`** — rewritten off `moti` onto reanimated (`Reanimated.View` + `useSharedValue`/`useAnimatedStyle`/`withTiming` for enter, `exiting={FadeOut}` for exit; dropped `AnimatePresence`). `moti` no longer imported anywhere (bundle graph dropped 7219→6882 modules). **Committed? NO.** **Verified? NO** (couldn't trigger a toast on-device). Still safe to keep.
2. **`node_modules/@gorhom/bottom-sheet/src/` — full PR #2720 applied** (3 files): `BottomSheetHostingContainer.tsx` (+`modal` prop, seeds `state.containerHeight` at measurement, dep array), `bottomSheetHostingContainer/types.d.ts` (+`modal?: boolean`), `BottomSheet.tsx` (pass `modal={$modal}`; `useEffect` setInterval(100ms,≤20) → `runOnUI` re-dispatch of `evaluatePosition(ANIMATION_SOURCE.MOUNT)`). **This is in node_modules only — NOT captured via `patch-package`, NOT committed. It is ephemeral (lost on `npm install`).**

## The bug, precisely (verified on-device)
Tap a menu item → `[perf] pos.open_modifier_sheet` fires (`.present()` runs), the sheet + a full-screen "Bottom sheet backdrop" mount into the tree, but the sheet **content is parked at `boundsInScreen Rect(0, 1200-1920, 1200)`** = the closed position at the very bottom edge, ~0px visible. No JS error. **Consequence: the modifier sheet is where an item commits to the cart, so a broken sheet means items never actually add** (user confirmed: order line shows ghost items, subtotal stays $0.00, nothing server-side, "Send" disabled). App-wide: ~60 sheets affected.

## Why PR #2720 is insufficient (root cause)
`node_modules/@gorhom/bottom-sheet/src/hooks/useAnimatedLayout.ts` drives layout via **`useAnimatedReaction`** (lines 72–89 read `rawContainerHeight`→write `containerHeight`; 90–107 do the same from `containerLayoutState.height`). On **reanimated 4.4/4.5 + Fabric these reactions can silently never fire on mount** (upstream issue #2721). PR #2720 seeds only `containerHeight` directly — but the **downstream detents + position evaluation use the same reaction mechanism and also don't fire**, so `evaluatePosition(MOUNT)` still can't compute a target and parks the sheet closed. Confirmed my patch IS in the bundle (grepped `enforceMountPosition`×3, `rawContainerHeight`×7). So per-reaction patching is whack-a-mole; **the fault is reanimated 4.5's mount-time reaction scheduling.**

## Recommended next steps (in order)
1. **Root-cause fix — change reanimated version.** The real fix is a reanimated build whose `useAnimatedReaction` fires reliably on mount under Fabric. Evaluate: (a) the last reanimated 4.x BEFORE the 4.4 scheduling regression (check worklets pairing + Expo 57/RN 0.86 compat), or (b) a fixed 4.6+/4.7+ if released. ⚠️ reanimated has a **native module** — a version change likely needs a **native rebuild** (`cd android && ./gradlew :app:clean :app:installDebug`), NOT JS-only. Never `expo prebuild --clean` (drops the 17 custom native modules). This fixes ALL sheets at once with no library patch.
2. **If staying on reanimated 4.5** — a *comprehensive* bottom-sheet patch that forces the WHOLE mount chain (containerHeight AND detents AND `isLayoutCalculated` AND the initial position) from JS via `runOnUI`, not just `containerHeight`. Fragile; trace `useAnimatedDetents` + `evaluatePosition`'s early-exit guards + when `didAnimateOnMount` flips (if it flips true at the closed position, the re-dispatch's `if (didAnimateOnMount.value) return` guard skips forever — suspect this).
3. Once a sheet actually opens on-device: verify toast + sheets, then `npx patch-package @gorhom/bottom-sheet` (patch-package is already set up, `postinstall` runs it), remove `moti` from package.json, commit.

## Device/verification gotchas (cost hours this session)
- **Auto-lock confound:** the P30 auto-locks fast; a dimmed/pre-lock screen looks exactly like a UI "wedge" and taps on a locking screen don't register. **Fix: `adb shell settings put system screen_off_timeout 1800000` + `adb shell svc power stayon true`** before testing. Several early "wedge" reads were this, not the app.
- **Screenshots:** `screencap -p /sdcard/..` gets a Landi anti-capture watermark ("Unauthorized Transactions Prohibited / Code 00000100") and the lockscreen shows the same. Use **`adb exec-out screencap -p > file.png`** (clean) and **`adb shell uiautomator dump`** (reads the true tree; screencap can't be trusted).
- **Floor-plan tables are canvas** — zero accessible nodes, only unreliable coordinate taps. The **sidebar** table list + menu items + toolbar buttons ARE accessible.
- **Test menu has NO items with modifiers** — every item adds "directly" (really: fails to commit due to the sheet bug). Can't reproduce the modifier sheet via a normal menu item; need an item with modifiers or the TableContextSheet (table tap).
- `com.deep.simulateled` overlay is `NOT_TOUCHABLE` (ruled out as a touch-blocker). The bundle URL that works: `http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true` (the `/index.bundle` URL returns a 6KB stub).
