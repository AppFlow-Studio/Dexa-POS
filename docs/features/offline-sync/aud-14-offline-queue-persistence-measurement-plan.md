# AUD-14 Offline Queue Persistence Measurement

## Summary

Measure full-array offline queue serialization and MMKV persistence under bad
Wi-Fi at queue depths 100, 300, and 500 before proposing any production
optimization.

Status: repository preparation complete; Landi measurement and evidence report
pending. No optimization or application behavior change has started.

## Scope

In scope for the first phase:

- Landi release-build measurements under controlled disconnect/throttle cycles.
- Queue-save serialization time, MMKV write time, total persistence time,
  persisted bytes, JS stalls, and reconnect replay duration.
- Queue depths 100, 300, and 500 with representative operation mixes.
- Ordering, idempotency, and crash-mid-replay observations.
- A written measurement report and an evidence-based go/no-go decision.

Out of scope until measurements justify it:

- Batching persistence writes.
- SQLite or append-only queue storage.
- Replay concurrency changes.
- Any payment-path persistence relaxation.

## Current Findings

- `services/offlineSyncService.ts` has 25 queue-transition call sites for
  `saveQueueToStorage()`.
- Every save filters the full in-memory array and calls
  `setSyncJSON('offline_operations_queue', toSave)`.
- `setSyncJSON` synchronously runs `JSON.stringify(value)` and writes the full
  string to the `dexa-pos-sync` MMKV instance.
- Existing `pos.queue_flush` telemetry measures overall replay but does not
  separate serialization from the MMKV write.
- The existing long-task watcher and telemetry export can capture stalls and
  total flush spans, but `setSyncJSON` has no queue-specific timing split.
- The Android release build is not debuggable/profileable, so Android Studio
  cannot attribute JS time to filter, `JSON.stringify`, and MMKV `set` without
  a measurement-only build or local instrumentation.
- Exact split timing therefore has an explicit tooling gap. Do not hide this
  gap by reporting total replay time as queue-save serialization time.

## Decisions For Approval

Recommended measurement gate:

- Proceed to batching research only if persistence P95 exceeds one 60 Hz frame
  budget (16.7 ms), repeated stalls exceed 100 ms, or replay measurably blocks
  live order/payment interaction.
- Payment and other transaction-critical operation transitions remain
  immediately durable regardless of batching results.
- First collect the no-code baseline available from the release build:
  `perf.pos.queue_flush`, long tasks, queue restoration, replay ordering, and
  reconnect-to-empty time.
- Before collecting the required filter/stringify/MMKV split, obtain approval
  for either a profileable measurement build or a temporary local diagnostic
  patch. The patch must never be committed or pushed and must be removed after
  evidence export.

## Plan

1. Define a representative queue mix containing order creation, items, kitchen
   status, discounts, and payment-adjacent operations without executing real
   charges.
2. Prepare a Landi release build and controlled network rig with online,
   throttled, disconnected, flap, and reconnect phases.
3. Populate depths 100, 300, and 500 through normal staging POS actions. Use
   distinct orders/items because repeated updates to the same entity can
   collapse into one queue operation. Capture at least 20 persistence
   transitions per depth and repeat reconnect replay five times per depth.
4. Record separately:
   - filter/copy time
   - `JSON.stringify` time
   - MMKV `set` time
   - total save time and payload bytes
   - JS long tasks over 100 ms
   - reconnect-to-empty duration and operation throughput
   - failures, retries, duplicates, and dependency-order violations
5. Force-kill at each depth, relaunch offline, and verify queue restoration;
   force-kill once during replay and verify safe recovery.
6. Attach raw telemetry JSON, device/build/network configuration, summary
   table, and screen recording to the ticket.
7. Stop after the report. Propose Step 2 batching only if the approved gate is
   crossed; require a separate implementation review before production code
   changes.

## Website Impact

None. The queue and `dexa-pos-sync` MMKV storage are React Native POS-only.
No website code, environment variable, or Supabase migration is required for
the measurement phase.

## Progress

- Notion ticket fetched and reviewed.
- Queue persistence implementation and all save call sites inspected.
- Added the physical-device runbook, Windows ADB export steps, and results
  worksheet in
  `aud-14-offline-queue-persistence-measurement-report.md`.
- Confirmed the release build can export replay spans and long-task samples,
  but cannot provide the required queue-save timing split without separately
  approved measurement instrumentation.
- Measurement data has not been collected because this environment has no
  connected Landi device or controlled bad-Wi-Fi rig.
- No application code changed.

## Verification

The measurement report must include:

- Depth, payload bytes, transition count, P50/P95/max persistence latency.
- Long-task count and worst stall.
- Replay duration, throughput, failure count, and final queue count.
- Relaunch and crash-mid-replay recovery result.
- Proof that payment operations were not reordered or dropped.

If optimization later ships, the replay/idempotency suite becomes mandatory
DoD: duplicate suppression, strict per-order ordering, and crash recovery.

## Files

Measurement phase:

- `docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-plan.md`
- `docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-report.md`
- No committed source changes expected

## Open QA

- Confirm Landi model, release build, and measured network-throttling method.
- Approve a measurement-only mechanism for the filter/stringify/MMKV split, or
  revise that metric in the ticket before execution.
- Run the 100/300/500-depth matrix and attach raw telemetry.
- Assign a non-implementer to record the final measurement run.
