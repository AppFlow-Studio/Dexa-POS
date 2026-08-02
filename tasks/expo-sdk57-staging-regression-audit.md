# Expo SDK 53 to 57 Staging Regression Audit

## Summary

Date: 2026-07-31

Audited target: `origin/staging` at `a4d73f305d2e6ba3cd1de28c967b0be1be66dcb1`

Pre-upgrade comparison point: `aa80ef4baa19bb056324ee1f2b58968b49752062`

Audit type: read-only code, dependency, build, and compatibility investigation

Verdict: **not release-ready**. The app can produce an Android JavaScript bundle, and the core Expo/React Native/Reanimated versions are compatible in principle. However, staging has a reproducible clean-install failure, broken lint and type gates, a failing Jest environment, several incomplete SDK API migrations, and a high-risk bottom-sheet compatibility layer that still needs full tablet verification.

No application code, native code, `package.json`, or lockfile was changed by this audit.

## Scope

This audit covers:

- The Expo SDK 53 to 57 dependency and native-runtime upgrade now present on staging.
- The latest staging commit and the commits that actually introduced the version upgrade.
- Package graph consistency and clean-install behavior.
- Expo Doctor, Expo dependency validation, TypeScript, lint, Jest, Metro export, and Android build diagnostics.
- SDK-sensitive application APIs: Reanimated, bottom sheets, FlashList, FileSystem, MMKV, StatusBar, testing utilities, Metro, Expo Updates, and custom native modules.
- A release-gate and tablet QA matrix for the affected POS surfaces.

This audit does not:

- Modify dependencies or source code.
- Run `expo prebuild --clean` because this repository contains manually registered native modules.
- Claim all existing TypeScript errors were introduced by this upgrade.
- Validate physical Star, Landi, payment-terminal, CFD, or kiosk hardware without the required devices and environment.

## Commit Boundary

The latest staging commit is not, by itself, the dependency-version commit.

| Commit | Role in the upgrade |
| --- | --- |
| `7b8eccdedacf7b9a5f37e9888645887e0d893110` | Earlier PR #158 upgrade work that was subsequently described as incomplete. |
| `4ee75d9eefc78285ddde5f1d2433ad71d00cca23` | PR #161 squash containing the main SDK 53 to 57 dependency, native, Reanimated, and PanelSheet migration. |
| `dc7652f1f25d3f3033a98fc838c847f27fd64f7a` | Merge of the SDK/payment work into staging. |
| `a4d73f305d2e6ba3cd1de28c967b0be1be66dcb1` | Current `origin/staging` tip, PR #163. It adds further SDK fixes and a package-lock change, but does not change `package.json`. |

The current staging tip is a 94-file squash with 15,193 additions and 8,568 deletions. It combines SDK fixes with payment-terminal work, previous-orders redesign, printing, lifecycle/performance changes, and Skia table changes. This makes regression attribution and rollback substantially harder than a dedicated SDK upgrade PR.

Local commits after `origin/staging`, including `9ca14dc7` and `38219a10`, were not attributed to staging in this report.

## Dependency Change Matrix

| Area | Before | Staging | Assessment |
| --- | --- | --- | --- |
| Expo | `~53.0.25` | `~57.0.8`, lock `57.0.8` | Four-SDK jump; current Expo validator expects `~57.0.9`. |
| React Native | `0.79.6` | `0.86.0` | SDK 57 line, but validator currently expects `0.86.2`. |
| React | `19.0.0` | `19.2.3` | Correct React line for SDK 57. |
| Reanimated | `~3.19.5` | `4.5.0` | Compatible with RN 0.86 only on New Architecture; validator expects `4.5.1`. |
| Worklets | none | `0.10.0` | Correct Reanimated 4 pairing; validator expects `0.10.1`. |
| Gesture Handler | `~2.24.0` | `2.32.0` | Installed version conflicts with a patch made for `3.0.2`. |
| Screens | `4.11.1` | `4.26.2` | Installed version differs from patch target `4.11.1`. |
| FlashList | `1.7.6` | `2.0.2` | Major migration incomplete; removed v1 props remain. |
| MMKV | `4.1.0` | `4.3.2` | V4 API mismatch remains in one store. |
| Skia | `^2.8.0` | `2.6.2` | Version moved backward while table/print rendering changed; requires visual and print verification. |
| Sentry RN | `^8.8.0` | `~7.11.0` | Major downgrade; crash reporting and source-map upload require verification. |
| Metro | `0.82.x` | root `0.84.4`, companion packages `0.87.0` | Split Metro graph with both 0.84 and 0.87 installed. |
| Testing Library RN | `13.3.3` | `14.0.1` | Major API shift to async render APIs; tests were not fully migrated. |
| TypeScript | `~5.8.3` | `~6.0.3` | Major compiler upgrade exposes many existing and migration-related errors. |
| ESLint | `^9.25.0` | `10.7.0` | Incompatible with Expo's current React/import plugin peer ranges. |

The SDK 57 core combination is not intrinsically invalid. Expo SDK 57 targets React Native 0.86 and React 19.2.3, and Reanimated 4.5 supports RN 0.86 with Worklets 0.10.x. The current failures come from incomplete migration work, stale patch files, mixed tooling versions, and unverified behavior changes.

## Findings

### F1 - Blocker - Clean installs fail during `postinstall`

Status: **confirmed and reproducible**

Evidence:

- `npm ci --ignore-scripts` completed and installed 1,855 packages.
- The project `postinstall` script runs `patch-package`.
- `patch-package --error-on-fail` failed on `patches/react-native-gesture-handler+3.0.2.patch`.
- The patch targets Gesture Handler `3.0.2`, while staging installs `2.32.0`.
- `patches/react-native-screens+4.11.1.patch` applies to installed Screens `4.26.2` only with a version-mismatch warning.
- The Metro and TCP Socket patches matched their installed versions.

Impact:

- A normal clean `npm ci` is not reproducible.
- CI, a new developer machine, Android Studio Gradle sync after dependency restoration, and EAS install phases can fail before compilation.
- The Screens patch may apply syntactically without being behaviorally valid for the installed source.

Required action:

- Decide whether the Gesture Handler patch is still required on `2.32.0`.
- Remove it if obsolete, or recreate it against the exact installed Expo-compatible version.
- Recreate and review the Screens patch against `4.26.2`.
- Require a clean `npm ci` with lifecycle scripts enabled before release.

### F2 - Blocker - Bottom-sheet recovery does not preserve the full application contract

Status: **confirmed static mismatch; runtime breadth not fully verified**

Background:

- Earlier SDK 57 regression work recorded that Gorhom sheets mounted off-screen under Reanimated 4/Fabric.
- The failure blocked modifier completion, leaving ghost order items, a zero subtotal, and Send disabled.
- Staging now routes 69 source files through `components/ui/bottomSheet.tsx` and defaults to the custom in-tree `PanelSheet`.

Confirmed compatibility gaps:

- `PanelSheetProps` explicitly accepts and ignores `enableDynamicSizing`.
- It accepts and ignores `enableContentPanningGesture`.
- It accepts and ignores `keyboardBehavior`, `keyboardBlurBehavior`, and `android_keyboardInputMode`.
- It accepts and ignores custom `backdropComponent`, `containerStyle`, handle, and background behavior.
- The adapter replaces `BottomSheetBackdrop` and `BottomSheetHandle` with components that render `null`.
- The sheet always renders its own handle and scrim.
- On Android, the internal `KeyboardAvoidingView` has no behavior configured.
- Swipe-to-close is attached only to the handle, not the content.

Affected call-site footprint:

| Ignored behavior | Call-site files |
| --- | ---: |
| Custom backdrop | 45 |
| Keyboard behavior | 10 |
| Keyboard blur behavior | 7 |
| Android keyboard input mode | 4 |
| Container style | 6 |
| Dynamic sizing | 3 |
| Content panning | 3 |

Impact:

- Sheet forms can be obscured by the Android keyboard.
- Dismiss, scrim, handle, sizing, panning, and layout behavior can differ silently from the original call-site intent.
- Type permissiveness hides unsupported behavior instead of forcing each caller to migrate explicitly.
- Payment, modifier, refund, table, cash-drawer, profile, scheduling, and settings flows share the same adapter, so a single compatibility defect has a wide operational blast radius.

Required action:

- Treat all sheet-dependent operations as blocked from release until the QA matrix below passes on the target tablets.
- Replace accepted-and-ignored behavior with either implemented behavior or explicit unsupported-prop removal at each call site.
- Add adapter-level tests for present, dismiss, hardware Back, backdrop press, keyboard visibility, multiple snap points, footer, and repeated close calls.
- Retain an app-wide kill switch only if both paths are built and tested in the same release candidate.

### F3 - High - Lint is completely broken by ESLint 10

Status: **confirmed**

Evidence:

- `npm ci` reports invalid peer resolution for `eslint-plugin-import@2.32.0` and `eslint-plugin-react@7.37.5` against ESLint `10.7.0`.
- `npm ls` exits with `ELSPROBLEMS` and marks ESLint 10 invalid for those peers.
- `npm run lint` crashes while loading `react/display-name` with `contextOrFilename.getFilename is not a function`.

Impact:

- Lint cannot assess any application source.
- CI cannot use lint as a merge or release gate.
- New SDK regressions can enter while the static-quality gate appears configured but is nonfunctional.

Required action:

- Use the ESLint major supported by the installed Expo 57 config/plugin graph, or upgrade the whole plugin graph to versions that explicitly support ESLint 10.
- Require `npm run lint` to execute to completion after alignment.

### F4 - High - SDK FileSystem migration is incomplete in the print cleanup path

Status: **confirmed runtime defect**

Evidence:

- `services/printing/utils/tempImageCleanup.ts` imports from `expo-file-system`, not `expo-file-system/legacy`.
- It reads `FileSystem.cacheDirectory`, which does not exist on the SDK 57 modern root API.
- It calls root `deleteAsync` and `readDirectoryAsync`; SDK 57 marks these legacy root exports as methods that throw at runtime.
- TypeScript reports `cacheDirectory` missing.

Impact:

- Normal deletion catches and logs the runtime error, so rendered Star receipt PNGs are not removed.
- The orphan sweep sees no legacy `cacheDirectory` and returns without cleaning.
- The print-cache leak that this module was added to solve remains active, with disk growth proportional to Star print volume.

Required action:

- Move this module consistently to `expo-file-system/legacy`, or rewrite it fully with `Paths`, `File`, and `Directory`.
- Verify repeated Star receipt and kitchen-ticket printing followed by cache stabilization.

### F5 - High - FlashList v2 migration is incomplete

Status: **confirmed compile-time mismatch; runtime effect needs device QA**

Evidence:

- FlashList was upgraded from 1.7.6 to 2.0.2.
- FlashList v2 removes `estimatedItemSize` and handles sizing automatically.
- Three v1-only `estimatedItemSize` props remain:
  - `app/(main)/menu/index.tsx` category list.
  - `app/(main)/menu/index.tsx` grouped item list.
  - `components/online-orders/KanbanColumn.tsx`.
- TypeScript rejects all three props.

Impact:

- The project cannot pass type validation.
- Menu management and online-order Kanban virtualization have not completed the documented v2 migration.
- Unknown props may be ignored at runtime, but list sizing, scroll position, column changes, and recycling still require device verification.

Required action:

- Remove v1-only properties and review all FlashList v2 migration requirements, including ref types, key usage, recycling assumptions, and `maintainVisibleContentPosition` behavior.

### F6 - High - The automated test harness was not migrated with Testing Library 14

Status: **confirmed**

Evidence:

- `@testing-library/react-native` moved from 13.3.3 to 14.0.1.
- Version 14 uses async APIs by default.
- TypeScript reports many tests treating `render()` and `renderHook()` promises as synchronous results.
- A targeted six-suite run produced 71 passing tests in five suites, but `appLifecycleCoordinator.test.ts` failed during Expo/Jest setup with `Platform.select` undefined.
- Jest also logged an Expo modules logger initialization warning.

Impact:

- Existing component/hook tests can fail for harness reasons instead of product behavior.
- The lifecycle suite added with the staging performance work is not currently executable in the clean staging environment.
- Test results are not a trustworthy release signal until the harness is migrated.

Required action:

- Follow the Testing Library 14 migration contract and await async render APIs where required.
- Repair Expo native-module mocks and Jest setup for SDK 57.
- Run the full suite after migration and separate pre-existing product test failures from framework migration failures.

### F7 - High - TypeScript is not a usable release gate

Status: **confirmed; mixed pre-existing and upgrade-related debt**

Evidence:

- TypeScript was upgraded from 5.8 to 6.0.
- `npx tsc --noEmit --pretty false` exits with 257 error lines.
- Largest groups are TS2591, TS2339, TS2304, and TS2322.
- A large portion concerns missing Node/Deno test or Supabase-function environments and pre-existing domain types.
- Upgrade-related errors are present for FlashList v2, FileSystem, StatusBar, MMKV, Testing Library 14, Expo symbol types, and bottom-sheet method compatibility.

Impact:

- The repository cannot distinguish a new migration regression from old type debt using one root command.
- Claims that migration errors are fixed cannot be mechanically enforced.

Required action:

- Split app, Jest, and Supabase Edge Function TypeScript projects.
- Establish an app-only baseline and make new errors fail CI.
- Resolve the known SDK-specific errors before attempting broad legacy cleanup.

### F8 - High - Native/config sources of truth are drifting

Status: **confirmed**

Evidence:

- Expo Doctor reports that `orientation`, icons, scheme, UI style, iOS, Android, and plugins in `app.json` are not automatically synchronized because native folders are committed.
- `app.json` version and Android/iOS runtime version are `2.2.2`.
- `android/app/build.gradle` still declares `versionName "2.1.6"` and `versionCode 1`.
- The Android update resource contains runtime version `2.2.2`, so runtime and native display/package versions are not the same contract.
- `android/gradle.properties` says app.json is the source for `newArchEnabled`, but app.json no longer contains that field; Gradle is the actual source.
- The app icon and adaptive foreground image are 1092 by 1120 rather than square, failing Expo schema validation.

Impact:

- Developers can change app config believing it changes native behavior when it does not.
- Builds, displayed versions, update targeting, and support diagnostics can disagree.
- Non-square adaptive icon assets can render incorrectly or fail stricter distribution validation.

Required action:

- Document one source of truth for every native setting.
- Reconcile native versionName/versionCode with the intended EAS remote-version workflow.
- Correct stale comments and square the icon assets.
- Compare committed native projects against Expo's SDK 53 to 54, 54 to 55, 55 to 56, and 56 to 57 native upgrade guidance without regenerating away custom modules.

### F9 - Medium - Expo package patch versions are not aligned

Status: **confirmed**

`npx expo install --check` and Expo Doctor report 16 packages behind the current SDK 57 expected patch set, including Expo, React Native, Reanimated, Worklets, Router, Updates, Dev Client, UI, Asset, Constants, and Jest Expo.

Impact:

- Known SDK patch fixes are absent.
- Updating only one package later can create another inconsistent native/JS combination.

Required action:

- Align the SDK patch set atomically with `expo install --fix` in a dedicated dependency PR.
- Rebuild native binaries after native package changes.
- Recreate all package patches against the final exact versions.

### F10 - Medium - Metro is split between 0.84 and 0.87

Status: **confirmed**

Evidence:

- Expo SDK 57 and React Native 0.86 resolve Metro `0.84.4`.
- Root `metro` is `0.84.4`.
- Direct root dependencies `metro-cache`, `metro-cache-key`, and `metro-transform-worker` are `0.87.0`.
- `metro-transform-worker@0.87.0` pulls a nested Metro 0.87 stack.
- The installed tree therefore contains complete 0.84 and 0.87 Metro families.

Impact:

- Tooling can import companion packages from a different Metro protocol/version than the active bundler.
- Cache keys, transformers, patches, and Windows file-descriptor workarounds become harder to reason about.
- Duplicate bundler stacks increase install size and maintenance risk.

Required action:

- Remove unused direct Metro internals, or pin every directly required Metro package to the exact Expo/RN Metro line.

### F11 - Medium - Additional removed/deprecated APIs remain

Status: **confirmed static debt**

| API | Evidence | Risk |
| --- | --- | --- |
| `Extrapolate` | Used in `app/(main)/menu/index.tsx` and `components/menu/DraggableMenuItem.tsx`. | Reanimated now documents `Extrapolation`; compatibility alias may be removed later. |
| StatusBar `translucent` | Still passed in `app/_layout.tsx`; TypeScript rejects it. | Edge-to-edge makes translucency deprecated/no-op on modern Android. |
| MMKV `.delete()` | Used by `stores/useFloorPlanEditorStore.ts`; installed MMKV type exposes `.remove()`. | Persisted floor-editor state removal can throw when invoked. |
| Old sheet method shims | Two components construct partial `BottomSheetMethods` objects missing `present`/`dismiss`. | Ref behavior can diverge by sheet implementation. |

Required action:

- Resolve these in the same SDK cleanup PR and cover the state-changing cases with focused tests.

### F12 - Medium - Custom native and hardware libraries need explicit New Architecture certification

Status: **release risk; not proven broken by this audit**

Evidence:

- Expo Doctor marks `react-native-star-io10` and `react-native-tcp-socket` as untested on New Architecture.
- It has no React Native Directory metadata for `castles-usb` and the Solana mobile wallet protocol package.
- `MainApplication.kt` manually registers TcpServer, SecondaryDisplay, HardwareDetection, LandiPrinter, NsdPublisher, NsdDiscovery, and AtomBridge packages.
- Reanimated 4 requires New Architecture, so falling back to the legacy architecture is not an available safety switch.

Impact:

- Printer, CFD, network discovery, and terminal paths can compile while failing under real hardware/runtime conditions.
- Running `expo prebuild --clean` can remove manual registrations and silently create a build missing required modules.

Required action:

- Keep New Architecture enabled.
- Never run destructive prebuild regeneration without a reviewed native diff.
- Require clean native builds and hardware verification on each supported device class.

### F13 - Medium - The upgrade is too broad to roll back safely

Status: **confirmed process risk**

Expo recommends upgrading SDK versions incrementally. This repository crossed SDK 53, 54, 55, 56, and 57 while also changing payment terminals, bottom sheets, printing, order history, lifecycle coordination, and table rendering.

Impact:

- A crash or slowdown cannot be quickly assigned to the framework, a dependency, or a feature.
- Reverting the upgrade would also revert unrelated operational work.
- Device QA has too many variables per build.

Required action:

- Do not add more feature work to the stabilization PR.
- Repair the dependency/build baseline first, then land API fixes and runtime verification in small, reversible waves.

## Diagnostics

All commands were run against a detached worktree at the exact staging tip. The current working branch and its existing changes were not modified.

| Check | Result | Interpretation |
| --- | --- | --- |
| Node | `v22.16.0` | Meets Expo SDK 57 minimum Node 22.13.x. |
| npm | `11.17.0` | Install tool executed normally. |
| `npm ci --ignore-scripts` | Pass, 1,855 packages | Lockfile can install only when lifecycle patching is bypassed. |
| `patch-package --error-on-fail` | Fail | Clean install blocker: Gesture Handler patch mismatch. |
| `npx expo install --check` | Fail, 16 packages | SDK patch set is stale. |
| `npx expo-doctor` | 16/20 pass | Config, native sync, package metadata, and SDK version checks fail. |
| `npm run lint` | Fail before linting | ESLint 10/plugin API incompatibility. |
| `npx tsc --noEmit` | Fail, 257 error lines | Mixed legacy debt plus confirmed SDK API errors. |
| Targeted Jest | 5 suites pass, 1 setup failure; 71 tests pass | Product helpers mostly pass, lifecycle/Expo test environment is broken. |
| `npx expo export --platform android --clear` | Pass | 6,724 modules, 22 MB Hermes bundle. JavaScript bundling works. |
| Gradle `:app:assembleDebug` | Inconclusive | Local Android SDK has an incomplete NDK 27.0 directory; staging requests complete NDK 27.1. This is a workstation blocker, not evidence of app source failure. |

Historical task notes record that a prior SDK 57 build compiled and booted to PIN on a Landi P30. They also record the real Gorhom sheet and toast regressions that prompted the current adapter. Those historical checks do not replace validation of the current staging tip.

## What Still Works

- Expo/Metro can resolve and bundle the full Android application.
- React 19.2.3, RN 0.86, Reanimated 4.5, and Worklets 0.10 form a supported core combination.
- New Architecture is enabled as required by Reanimated 4 and FlashList 2.
- Five targeted data/filter/cache/Skia suites passed 71 assertions.
- The native host uses `ExpoReactHostFactory`, preserving Expo Updates and Dev Launcher integration.
- The old Hermes compiler path was removed, matching RN 0.86 packaging.
- Runtime version `2.2.2` is embedded in Android resources, preventing SDK 57 bundles from intentionally targeting older runtime identifiers if updates are published correctly.

These positives mean the migration is repairable without reverting to SDK 53, but they do not override the release blockers.

## Remediation Plan

### Wave 0 - Freeze and reproduce

- Stop unrelated dependency and feature changes on the stabilization branch.
- Preserve a failing clean-install log and the current device symptom/logcat.
- Define one staging release candidate commit and one supported Node/Java/Android SDK toolchain.

Exit criteria: every developer and CI job starts from the same commit and toolchain.

### Wave 1 - Restore dependency and tool gates

- Align the full Expo 57 patch set atomically.
- Resolve Gesture Handler and Screens patches against exact installed versions.
- Remove the Metro 0.87 companion split or align it to Metro 0.84.4.
- Align ESLint and its plugins.
- Run normal `npm ci`, Expo Doctor, Expo install check, and lint.

Exit criteria: clean install and lint pass with no invalid dependency tree.

### Wave 2 - Complete SDK API migration

- Fix print FileSystem usage.
- Remove FlashList v1 props and review v2 semantics.
- Replace MMKV `.delete()` with the v4 contract.
- Remove StatusBar `translucent` and migrate `Extrapolate` usage.
- Repair bottom-sheet method shims.
- Separate app, Jest, and Deno typecheck configurations and clear app-specific SDK errors.

Exit criteria: app-only TypeScript passes and Metro export remains green.

### Wave 3 - Make sheet behavior explicit

- Inventory each sheet's required keyboard, backdrop, sizing, panning, handle, and footer behavior.
- Implement required behavior in PanelSheet or simplify each call site to the supported contract.
- Add adapter tests and targeted flow tests.
- Verify no sheet can leave a partial order/payment state when presentation fails.

Exit criteria: automated adapter checks pass and the full sheet QA matrix passes on tablet.

### Wave 4 - Native and hardware qualification

- Repair the local Android NDK installation without changing project source.
- Build debug and release variants from a clean clone using Java 21 and the pinned NDK.
- Reconcile app/native version and icon configuration.
- Verify all manually registered native packages.
- Build a new SDK 57 binary before publishing any runtime `2.2.2` update.

Exit criteria: signed release candidate boots and passes the hardware matrix.

### Wave 5 - Controlled rollout

- Publish to a preview channel/runtime first.
- Test overnight resume, offline recovery, payment-in-flight backgrounding, and printing soak.
- Monitor startup, native crashes, JS errors, failed updates, sheet-open telemetry, and payment/print failures.
- Roll out gradually and retain a tested rollback update for the same runtime.

Exit criteria: pilot sign-off with no blocker regression and acceptable telemetry.

## Tablet QA Matrix

### Boot and account

- Install the APK on a device with no prior app data.
- Cold boot to location/station selection and PIN login.
- Background/foreground, lock/unlock, and kill/restart the app.
- Confirm Clerk/session restoration, station config, subscription gates, and no update rollback loop.

### Order entry and sheets

- Open menu search and dismiss by button, backdrop, swipe, and Android Back.
- Add an item with modifiers and confirm it commits to the cart with correct subtotal.
- Test modifier text input with the keyboard visible and rotate/reopen where supported.
- Open payment, split payment, discount, service charge, custom item, and payment details.
- Confirm footers stay visible and actions are not covered by the keyboard.
- Rapidly open/close the same sheet and switch between different sheets.

### Tables and staff

- Open table context, transfer, merge, unmerge, and table-order detail sheets.
- Drag and resize tables and confirm gestures remain responsive.
- Open profile, timeclock, staff review, cash drawer, scheduling, inventory, and settings sheets.
- Verify hardware Back closes only the top sheet and does not navigate away.

### Lists and online orders

- Scroll large menu category and item lists quickly in both directions.
- Search/filter while scrolled and verify stable row recycling.
- Exercise Online Orders Kanban in one-column and four-column layouts.
- Confirm no blank rows, jumping scroll position, duplicate cards, or wrong recycled content.

### Payment hardware

- Test cash and card checkout.
- Test Dejavoo, Castles, Valor TCP/USB, and ATOM/Landi paths available to the merchant.
- Cancel an in-flight payment and retry safely.
- Background/restore during a payment without creating a duplicate charge.

### Printing and CFD

- Print and reprint customer and kitchen receipts on Star and Landi.
- Run a multi-receipt soak and confirm temporary image cache stops growing after cleanup.
- Verify logos, raster content, cash drawer, printer discovery, and printer reconnect.
- Verify built-in and external CFD screens through payment success and idle reset.

### Updates and release

- Install a fresh SDK 57 binary for runtime `2.2.2`.
- Publish only a preview update targeted to that runtime.
- Confirm an older binary does not load the SDK 57 update.
- Confirm failed update recovery returns to a known-good embedded bundle.

## Release Gates

- [ ] Normal clean `npm ci` passes with `postinstall` enabled.
- [ ] `npm ls --depth=0` reports no invalid dependency tree.
- [ ] `npx expo install --check` passes.
- [ ] `npx expo-doctor` passes or every intentional exclusion is documented.
- [ ] `npm run lint` executes and passes the agreed baseline.
- [ ] App-only TypeScript has zero errors.
- [ ] Full Jest suite executes under the SDK 57 harness.
- [ ] Android debug and release builds pass from a clean clone.
- [ ] SDK 57 binary boots on Landi and standard Android tablet.
- [ ] Bottom-sheet QA matrix passes.
- [ ] Payment-terminal matrix passes.
- [ ] Star and Landi print/reprint soak passes with bounded temp storage.
- [ ] CFD and network discovery pass.
- [ ] Preview EAS Update is verified against the intended runtime.
- [ ] Pilot video and verifier sign-off are attached.

## Verification Status

Audit complete. Fix implementation and physical-device QA are pending.

The current staging commit should not be marked release-ready based only on the successful Metro export or historical device boot. The clean-install, lint, test-harness, API migration, and bottom-sheet gates above remain open.

## Files

Files changed by this audit:

- `tasks/expo-sdk57-staging-regression-audit.md`
- `tasks/ticket-log.md`

High-priority files identified for later remediation, not changed here:

- `package.json`
- `package-lock.json`
- `patches/react-native-gesture-handler+3.0.2.patch`
- `patches/react-native-screens+4.11.1.patch`
- `components/ui/PanelSheet.tsx`
- `components/ui/bottomSheet.tsx`
- `services/printing/utils/tempImageCleanup.ts`
- `app/(main)/menu/index.tsx`
- `components/online-orders/KanbanColumn.tsx`
- `stores/useFloorPlanEditorStore.ts`
- `app/_layout.tsx`
- `jest-setup.ts`
- `app.json`
- `android/app/build.gradle`
- `android/gradle.properties`

## References

- Expo SDK upgrade workflow: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- Expo SDK 57 version matrix: https://docs.expo.dev/versions/latest/
- Expo native upgrade helper: https://docs.expo.dev/bare/upgrade/
- Expo FileSystem legacy API: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/
- Expo runtime versions: https://docs.expo.dev/eas-update/runtime-versions/
- FlashList v2 migration: https://shopify.github.io/flash-list/docs/v2-migration/
- Reanimated compatibility: https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/
- Reanimated 3 to 4 migration: https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/
- React Native edge-to-edge and StatusBar behavior: https://reactnative.dev/blog/2026/06/11/react-native-0.86
- Existing local regression history: `tasks/sdk57-regression-plan.md`
- Existing local regression follow-up: `tasks/sdk57-regression-session2-state.md`

## Open QA

- Reproduce the reported app break on the exact target tablet and capture logcat plus screen recording.
- Repair the workstation's incomplete Android NDK installation and rerun clean debug/release builds.
- Execute every release gate and tablet QA item after fixes are implemented.
- Obtain senior review before dependency alignment or bottom-sheet remediation is merged.
