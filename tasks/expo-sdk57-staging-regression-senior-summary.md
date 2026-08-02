# Expo SDK 57 Staging Regression - Senior Summary

## Summary

Date: 2026-07-31

Audited target: `origin/staging` at `a4d73f305d2e6ba3cd1de28c967b0be1be66dcb1`

Status: **stabilization required before release**

The POS was upgraded from Expo SDK 53 to SDK 57, including React Native 0.79 to 0.86, React 19.2, Reanimated 4, Worklets, FlashList 2, and related native/tooling packages. The core SDK versions are compatible, and Android JavaScript bundling succeeds. The current staging tree is still not release-ready because clean installation, linting, tests, several migrated APIs, and critical bottom-sheet behavior remain broken or unverified.

The complete evidence and per-file analysis are in:

- `tasks/expo-sdk57-staging-regression-audit.md`

## Decision Requested

Do not release the current staging tip to pilot merchants yet.

Create a dedicated SDK 57 stabilization PR and freeze unrelated feature work in that PR. Repair the reproducible dependency and API failures first, then run the tablet and hardware qualification matrix before publishing an SDK 57 update or APK.

A rollback to SDK 53 is not currently recommended. The SDK 57 core can bundle and is supported; the safer path is a focused stabilization pass.

## Commit Clarification

The latest staging commit is not the original dependency-version commit.

- `4ee75d9e` from PR #161 contains the main SDK 53 to 57 migration.
- `dc7652f1` merged that work into staging.
- `a4d73f30` from PR #163 is the current staging tip and adds further SDK fixes plus unrelated performance and feature work.

The current tip combines 94 changed files, 15,193 additions, and 8,568 deletions. SDK fixes are mixed with payments, printing, previous orders, lifecycle performance, and Skia work, making regression attribution difficult.

## Confirmed Blockers

### 1. Clean install failure

The project runs `patch-package` during `postinstall`.

- Gesture Handler installed version: `2.32.0`.
- Gesture Handler patch target: `3.0.2`.
- React Native Screens installed version: `4.26.2`.
- Screens patch target: `4.11.1`.

`patch-package` fails on Gesture Handler and warns on Screens. A normal clean `npm ci`, CI build, new developer setup, or EAS dependency install is therefore not reliable.

### 2. Critical bottom-sheet contract is incomplete

Earlier SDK testing confirmed Gorhom sheets stopped opening under the Reanimated 4/Fabric upgrade. This prevented modifier completion and left orders with ghost items and a zero subtotal.

The replacement `PanelSheet` is now used through an adapter imported by 69 source files. It opens through a different implementation but silently ignores behavior still requested by call sites:

| Behavior                    | Affected call-site files |
| --------------------------- | -----------------------: |
| Custom backdrop             |                       45 |
| Keyboard behavior           |                       10 |
| Keyboard blur behavior      |                        7 |
| Android keyboard input mode |                        4 |
| Container styling           |                        6 |
| Dynamic sizing              |                        3 |
| Content panning             |                        3 |

This affects modifiers, payments, refunds, tables, cash drawer, staff, scheduling, inventory, and settings. These flows must be treated as release-blocking until tablet QA confirms correct keyboard, dismissal, sizing, footer, Back button, and repeated-open behavior.

### 3. Print-image cleanup is broken at runtime

`services/printing/utils/tempImageCleanup.ts` uses legacy FileSystem methods from the SDK 57 modern root import. Those methods throw at runtime, and `cacheDirectory` is unavailable.

The errors are caught, so printing may appear successful, but temporary Star receipt images are not deleted. High-volume stores can continue accumulating print files until storage becomes a problem.

### 4. Static and automated quality gates are broken

- `npm run lint` crashes because ESLint 10 is incompatible with the installed Expo React/import plugins.
- TypeScript reports 257 error lines. Not all are upgrade-caused, but confirmed SDK errors are included.
- Testing Library moved to version 14 with async render APIs, but existing tests still use synchronous behavior.
- A focused run passed 71 assertions in five suites, while the lifecycle suite failed during Expo/Jest initialization.

The repository currently cannot use lint, TypeScript, or the full Jest suite as reliable release gates.

### 5. Several SDK API migrations remain incomplete

- FlashList 2 no longer accepts `estimatedItemSize`, but three lists still pass it.
- MMKV 4 exposes `.remove()`, while the floor-plan editor store still calls `.delete()`.
- StatusBar `translucent` remains in the root layout despite the edge-to-edge migration.
- Reanimated's old `Extrapolate` name remains in menu animation code.
- Some bottom-sheet ref shims do not implement the complete method contract.

### 6. Native configuration is drifting

- Expo Doctor passes 16 of 20 checks.
- Expo reports 16 packages behind the current SDK 57 patch set.
- `app.json` version/runtime is `2.2.2`, while Android `versionName` remains `2.1.6` and `versionCode` remains `1`.
- The configured icon is 1092 by 1120 rather than square.
- Committed native folders mean several `app.json` settings do not automatically update Android/iOS projects.
- Custom printer, terminal, TCP, discovery, and secondary-display packages require explicit New Architecture testing.

## Verification Results

| Check                             | Result                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Node `22.16.0`                    | Compatible with SDK 57 minimum.                                               |
| Install without lifecycle scripts | Pass, 1,855 packages.                                                         |
| Package patches                   | Fail on Gesture Handler; warning on Screens.                                  |
| Expo dependency check             | Fail, 16 expected patch updates.                                              |
| Expo Doctor                       | 16/20 checks pass.                                                            |
| Lint                              | Crashes before linting source.                                                |
| TypeScript                        | Fails with 257 error lines.                                                   |
| Focused Jest run                  | 5 suites pass, 1 suite setup failure, 71 tests pass.                          |
| Android Expo export               | Pass, 6,724 modules and 22 MB Hermes bundle.                                  |
| Android native build              | Inconclusive because the workstation contains an incomplete NDK installation. |
| Current tablet/hardware sweep     | Not completed.                                                                |

## What Is Working

- Expo SDK 57, React Native 0.86, React 19.2, Reanimated 4.5, and Worklets 0.10 are a supported core combination.
- New Architecture is enabled as required by Reanimated 4 and FlashList 2.
- Metro can resolve and bundle the full Android application.
- The Expo-aware React host and RN 0.86 Hermes configuration are present.
- Focused order-history, cache, filter, and Skia tests passed.
- Historical testing recorded a successful Landi P30 build and boot to PIN on an earlier SDK 57 state.

These results show that stabilization is feasible, but they do not prove the current staging tip is safe for release.

## Stabilization Plan

### Wave 1 - Restore reproducible tooling

- Align the full Expo 57 patch set in one dependency change.
- Remove or recreate stale package patches against exact installed versions.
- Align ESLint with its plugin support.
- Remove the Metro 0.84/0.87 split.
- Require normal `npm ci`, Expo check, Expo Doctor, and lint to pass.

### Wave 2 - Finish SDK API migration

- Repair print FileSystem usage.
- Complete FlashList 2 migration.
- Correct MMKV, StatusBar, Reanimated, and bottom-sheet method APIs.
- Separate app, Jest, and Supabase/Deno TypeScript configurations.
- Repair the SDK 57 Jest setup and Testing Library 14 tests.

### Wave 3 - Qualify bottom sheets

- Define the supported PanelSheet behavior rather than accepting ignored props.
- Add adapter tests for open, close, backdrop, Back button, keyboard, footer, snap points, and repeated calls.
- Test every critical sheet-dependent merchant flow on tablet.

### Wave 4 - Native and hardware release candidate

- Repair the workstation NDK installation and run clean debug/release builds.
- Reconcile native/config versions and icons.
- Build a fresh SDK 57 binary for runtime `2.2.2`.
- Test Landi, standard Android tablet, Star printer, Landi printer, CFD, and available payment terminals.
- Publish first to a preview update channel and monitor before pilot rollout.

## Required QA

Record one consolidated video after fixes showing:

- Fresh install, cold boot, station selection, and PIN login.
- Menu scrolling and item search.
- Item modifier sheet with keyboard and successful cart subtotal update.
- Cash and card payment sheets.
- Table context, transfer, and merge sheets.
- Previous-order details, refund/reprint, and Android Back behavior.
- Star and Landi printing, including reprint.
- Background/foreground and lock/unlock recovery.
- At least one connected payment-terminal transaction where hardware is available.
- Preview update loading only on the intended SDK 57 runtime.

## Release Gates

- [ ] Normal clean `npm ci` passes with `postinstall` enabled.
- [ ] Dependency tree has no invalid peers or mixed Metro internals.
- [ ] Expo dependency check passes.
- [ ] Expo Doctor passes or intentional exceptions are documented.
- [ ] Lint executes successfully.
- [ ] App-only TypeScript passes.
- [ ] Full Jest suite executes under SDK 57.
- [ ] Clean Android debug and release builds pass.
- [ ] Bottom-sheet tablet matrix passes.
- [ ] Star and Landi print soak passes with bounded temporary storage.
- [ ] Payment-terminal and CFD checks pass.
- [ ] Preview runtime/update verification passes.
- [ ] Senior and pilot verifier sign-off are attached.
