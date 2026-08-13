# SDK 53→57 Migration — Regression Test & Fix (handoff prompt)

> Paste this into a fresh Claude Code session. The Landi P30 is connected and the
> migrated app is installed/running on it; Metro is on 8081. Work on branch
> `feat/landi-pay`.

## Your job
The Expo **SDK 53→57** migration is committed and the app builds + runs on the
Landi P30, but the **reanimated-4 animation layer has regressions**. Systematically
**test and fix every animation/gesture/sheet/toast regression** caused by the
migration, verifying each fix live on the P30. Then (optionally) do the EAS build.

## What was migrated (committed on `feat/landi-pay`)
- `1141cb32` — JS/deps: Expo 53→57, RN 0.79→**0.86**, React 18→**19**, reanimated
  3.19→**4.5.0** (+ **react-native-worklets 0.10.0**), gesture-handler→**2.32.0**,
  metro 0.82→0.87, `@babel/core` 7→8, nativewind tailwind pinned **v3**,
  `expo-file-system`→`/legacy` (7 files), babel plugin
  `react-native-reanimated/plugin`→**`react-native-worklets/plugin`**.
- `95856ef3` — native: `MainApplication.kt` → **`ExpoReactHostFactory.getDefaultReactHost`**
  (NOT RN's plain `getDefaultReactHost` — that skips expo-updates/dev-launcher host
  handlers); `SecondaryDisplayModule.kt` → `reactContext.currentActivity`.
- Already-fixed reanimated-4 API changes: `useAnimatedGestureHandler`→`Gesture.Pan()`
  /`GestureDetector` (NotificationItem, OrderBadge); `Animated.SharedValue`→`SharedValue`
  (PieChart, ManagerPinModal, RefundApprovalModal, TableCardContent);
  `SpringConfig`→`WithSpringConfig` (Pie-Slice).

## Observed regressions
1. **All `@gorhom/bottom-sheet` modals fail to open.** `.present()` runs (e.g.
   `[perf] pos.open_modifier_sheet` completes in logcat) but the sheet never animates
   on-screen, and there is **no JS error**. Confirmed on TableContextSheet + the
   modifier sheet; bottom-sheet is used in **~60 screens** so this is app-wide.
2. **Custom Toast throws an error.** `components/ui/CustomToast.tsx` +
   `components/ui/ToastContainer.tsx` are the ONLY `moti` users. **`moti ^0.30.0` on
   reanimated 4.5 is the prime suspect** (moti 0.30 predates solid reanimated-4 support).

## Root-cause hypotheses (work in this order)
1. **Stale Metro cache.** Metro was restarted with `--clear` at the end of the prior
   session (the project's `npm run android` always uses `--clear --reset-cache`; it had
   been started without). **FIRST: force-reload the app and re-test sheets + toast.** If
   they work now → it was the cache; done.
2. **moti 0.30 ✗ reanimated 4** (the Toast). `npx expo install moti` / bump to a
   reanimated-4-compatible release, or replace the 2 moti usages with plain reanimated
   `Animated.View` + `useAnimatedStyle`. Bounded: 2 files.
3. **@gorhom/bottom-sheet 5.2.14 ✗ reanimated 4.5.** Peers are satisfied on paper
   (`reanimated: >=3.16.0 || >=4.0.0-`), but 5.2.14 may mis-animate on reanimated 4.5.
   Try bumping bottom-sheet to the latest 5.x and retest a single sheet.
4. **Residual app-level reanimated-4 breakage.** Audit remaining reanimated usage for v4
   changes: `Extrapolate`→`Extrapolation`, Layout/Keyframe animation API, `withTiming`/
   `withSpring` callback signatures, strict worklet rules in `useAnimatedStyle`.

## Environment (already set up on this machine)
- **Device**: Landi P30 via adb — serial `264EAPTW0078`, pkg
  `com.temurappflowstudios.dexapos`. Debug APK installed & running.
- **Metro**: on **8081** — `npx expo start --dev-client --localhost --port 8081 --clear`.
  `adb reverse tcp:8081 tcp:8081` + `tcp:8080 tcp:8080` are set. Port 8081 is free.
- **Force-reload the app** (it has a foreground service, so force-stop then cold-launch):
  ```
  adb shell am force-stop com.temurappflowstudios.dexapos
  adb shell am start -a android.intent.action.VIEW \
    -d "dexapos://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" \
    com.temurappflowstudios.dexapos
  ```
- **See the screen**: `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png /tmp/s.png` → Read `/tmp/s.png`.
- **Get the exact error**: `adb logcat -c` (clear) → reproduce on device → `adb logcat -d | grep -iE "ReactNativeJS|Error|Exception|reanimated|worklet|moti|gorhom"`.
- **Native rebuild** (ONLY if you touch `android/` — otherwise just reload JS):
  `cd android && ./gradlew :app:clean :app:installDebug` (installs onto the P30, ~1 min).
  ⚠️ **Do NOT run `expo prebuild --clean`** — it regenerates `MainApplication.kt` and
  would drop the 17 manually-registered custom native modules (ATOM/Castles/Landi/etc.).

## Test → fix → verify loop
1. Force-reload. Test: open a table → tap it (TableContextSheet should slide up); open an
   order → add an item (modifier sheet should slide up); trigger a toast (should render, no
   error). Screenshot to confirm.
2. If sheets STILL fail post-`--clear`: it's version/code. Bump `@gorhom/bottom-sheet`,
   reload, retest one sheet. If fixed, done (no code changes needed across the 60 files —
   it's a library issue).
3. Toast: capture the logcat stack; fix moti (upgrade or replace in the 2 files).
4. Re-verify each fix live on the P30 (reload + screenshot). Then sweep every animated
   surface: sheets across tables/bill/menu/inventory/scheduling/profile; the migrated
   gestures (swipe NotificationItem, swipe-to-complete OrderBadge); analytics PieChart;
   table drag/drop.
5. Commit fixes on `feat/landi-pay` with clear messages.

## Key files
- **Toast (moti)**: `components/ui/CustomToast.tsx`, `components/ui/ToastContainer.tsx`
  (+ `lib/toastService.ts`, `stores/useToastStore.ts`, `lib/takeoverToast.ts`).
- **Bottom sheets**: ~60 files under `components/{tables,bill,menu,inventory,scheduling,
  profile,cash-drawer,notifications,settings,floor-plan}`; provider is
  `BottomSheetModalProvider` in `app/_layout.tsx`.
- **Migrated reanimated**: `components/notifications/NotificationItem.tsx`,
  `components/order/OrderBadge.tsx`, `components/analytics/{PieChart,Pie-Slice}.tsx`,
  `components/auth/ManagerPinModal.tsx`, `components/previous-orders/RefundApprovalModal.tsx`,
  `components/tables/cards/TableCardContent.tsx`, `babel.config.js`.

## Known-good (already verified last session)
- Gradle build compiles all 17 native modules on RN 0.86; app boots to PIN login and loads
  JS from Metro. `npx tsc --noEmit`: migration-caused errors fixed (remaining ~274 are
  pre-existing). CFD web build + full `expo export` succeed. `npx expo-doctor` 17/20.

## Also pending (not a regression)
- **EAS preview build** requested but blocked on `eas login` (not authenticated). Needs
  `SENTRY_AUTH_TOKEN` as an EAS env secret or the Sentry gradle step fails. Do this AFTER
  the regressions are fixed: `npx eas build -p android --profile preview`.
