# Performance Baseline Protocol (Landi C20 Pro)

Repeatable on-device measurement script for the perf roadmap. Run the full
protocol **before and after every perf phase** and record results in the
baseline table below. Budgets come from the approved roadmap
(`~/.claude/plans/role-objective-cryptic-dusk.md`).

## Setup (once)

- **Device**: Landi C20 Pro, rebooted, no other apps in foreground, screen
  brightness fixed. Charger connected (thermal throttling is still possible —
  note device temperature if results look odd).
- **Build**: EAS `preview` profile (release-mode JS — dev builds are 2-5x
  slower and invalid for budgets). Dev builds are fine for the FPS overlay and
  React DevTools Profiler work, but never for budget numbers.
- **Data**: staging merchant seeded with the standard worst-case dataset:
  ~500 menu items (heavy modifier groups on at least 100 of them), 50 tables,
  ~30 active orders, ~100 previous orders.
- **Network**: merchant-realistic WiFi. Run the script once on good WiFi and
  once with throttled WiFi (router QoS or distance) — label each run.
- **Where numbers come from**: the `pos.*` interaction spans (op
  `pos.interaction`) in Sentry Performance, plus `[perf]` console lines in dev
  builds. Sampling is 30% in release — repeat each interaction ≥10× so several
  samples land.

## The 10-step script (run 3×, use median)

1. **Cold start**: force-stop the app, launch, stopwatch/screen-record until
   the PIN screen is interactive. Record Sentry app-start metric too.
2. **PIN → order screen**: log in with a cashier PIN. `pos.boot_to_order`
   span captures PIN success → order screen renderStage 2.
3. **Menu scroll**: switch to the largest category, fling-scroll the menu grid
   top-to-bottom twice. Watch FPS overlay (dev build) / slow+frozen frames on
   the navigation transaction (release).
4. **Add to cart ×5**: tap 5 different items, including item #20+ in the
   category (beyond the modifier precompute window). Spans:
   `pos.open_modifier_sheet` (check the `prewarmed` attribute),
   `pos.add_to_cart`.
5. **Modifier-heavy item**: open an item with ≥3 modifier groups, select
   options, confirm.
6. **Send to kitchen**: `pos.send_to_kitchen` span = tap → optimistic ack.
   Also note tap → ticket visible on a KDS station (manual stopwatch).
7. **Open payment**: `pos.open_payment` span. Close and reopen the sheet —
   second open should not refetch (F1 fix validation).
8. **Tables floor plan**: navigate to tables, pan/zoom the floor plan, seat a
   party, return to order screen. FPS overlay for jank.
9. **Previous orders**: open the previous-orders tab, scroll one page.
10. **Offline flush**: airplane mode ON, add 10 items + send to kitchen on 2
    orders, airplane mode OFF. `pos.queue_flush` span (`ready_ops`,
    `success_count` attributes) measures the flush.

## Baseline table

| Metric (span) | Budget | Baseline (date: ____) | After P1 | After P2 | After P3 |
|---|---|---|---|---|---|
| Cold start → PIN interactive | ≤ 2.5s | | | | |
| `pos.boot_to_order` | ≤ 1.5s | | | | |
| `pos.add_to_cart` p95 | ≤ 100ms | | | | |
| `pos.open_modifier_sheet` p95 (prewarmed=false) | ≤ 250ms | | | | |
| `pos.send_to_kitchen` p95 | ≤ 150ms | | | | |
| `pos.open_payment` p95 | ≤ 300ms | | | | |
| Menu grid scroll FPS / frozen frames | ≥55 / 0 | | | | |
| Floor plan FPS / frozen frames | ≥55 / 0 | | | | |
| `pos.queue_flush` (50 ops) | ≤ 30s | | | | |
| Orders bootstrap fetch | ≤ 2.5s | | | | |

## Sentry dashboard (one-time)

In Sentry → Performance, filter `transaction.op:pos.interaction` and build a
dashboard widget per span name (p50/p95). Exclude `cancelled:true` spans.
Confirm slow/frozen frames appear on navigation transactions
(`enableNativeFramesTracking` is on in `app/_layout.tsx`).
