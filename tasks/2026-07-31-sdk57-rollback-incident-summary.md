# SDK 57 Rollback Incident Summary

**Date:** July 31, 2026  
**Status:** Source-control resolution complete; clean-build and device QA remain required

## What Happened

The POS release line was upgraded from Expo SDK 53 / React Native 0.79 to Expo SDK 57 / React Native 0.86. The upgrade was delivered across several mixed feature PRs rather than as an isolated framework migration.

After the upgrade, the app showed dependency, native-build, tooling, and runtime compatibility problems. The investigation found failures or incomplete migrations around clean dependency installation, `patch-package`, linting, tests, TypeScript, FileSystem, FlashList, bottom sheets, native Android configuration, and related libraries. The size of the framework jump also made it difficult to separate upgrade regressions from newly added payment, KDS, printing, Previous Orders, and performance work.

## The Problem

The SDK 57 release line was not stable enough for continued POS testing and release. A simple revert of the latest PR was not sufficient because SDK 57 had already entered the history in an earlier PR, while later PRs combined SDK changes with required business features.

Resetting directly to the last SDK 53 commit would also have removed valid work from other developers. The rollback therefore needed to restore the stable SDK foundation without discarding the newer POS features.

## Investigation

The audit identified:

- `aa80ef4b` as the last staging ancestor using Expo SDK 53.
- PR #158 as the first SDK 57 upgrade point.
- PRs #161 and #163 as mixed SDK and business-feature changes.
- A direct reset to `aa80ef4b` would remove 278 changed files.
- Database and website contracts should remain in place unless a specific compatibility problem is proven.

The full evidence and rollback options are recorded in the related audit documents.

## Solution

The team performed a selective rollback to the SDK 53-compatible foundation and ported the required feature work onto it instead of resetting shared history to the old baseline.

- `main` was updated through PR #165 at `5a9f20ba`: `Rollback to SDK 53 (drop SDK-57 perf regression) + port Valor/ATOM/PanelSheet + features`.
- `staging` was superseded by the SDK 53 rollback line at `b3ed86ae`.
- The application runtime/version was advanced to `2.3.0` to keep the rollback binary separate from the SDK 57 runtime.
- The resulting `main` and `staging` file trees are identical.
- The restored framework versions are Expo `~53.0.25`, React Native `0.79.6`, React `19.0.0`, and Reanimated `~3.19.5`.

## Current State

The source-control rollback is complete, and `main` and `staging` now contain the same application tree on the SDK 53 foundation. The current branches preserve the selected post-upgrade features rather than dropping all work added after July 21.

This confirms repository alignment only. Before release, the rollback build still needs a clean install/build and focused tablet QA for login, orders, payments, Valor/ATOM/Landi terminals, printing, KDS, Previous Orders, background/resume behavior, and database compatibility.

## Prevention

- Keep future Expo/React Native upgrades isolated from feature PRs.
- Upgrade one supported SDK step at a time where practical.
- Require a clean install, Android debug/release build, automated checks, and physical POS hardware QA before merging an SDK upgrade into staging.
- Use a distinct runtime version for every native SDK boundary.
- Preserve a tested rollback branch or release tag before promoting framework upgrades.
