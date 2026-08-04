# AUD-14 Offline Queue Persistence Measurement

## Summary

Measure full-array offline queue serialization and MMKV persistence under bad
Wi-Fi at queue depths 100, 300, and 500 before proposing any production
optimization.

Status: source audit and measurement protocol complete; Landi measurement
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
- Exact timing therefore requires the documented temporary, uncommitted
  measurement patch; production code remains unchanged until results cross the
  approved gate.

## Decisions For Approval

Recommended measurement gate:

- Proceed to batching research only if persistence P95 exceeds one 60 Hz frame
  budget (16.7 ms), repeated stalls exceed 100 ms, or replay measurably blocks
  live order/payment interaction.
- Payment and other transaction-critical operation transitions remain
  immediately durable regardless of batching results.
- If direct timing cannot be captured with existing tools, use a temporary
  local diagnostic patch around stringify/MMKV write, never commit it, and
  discard it before attaching the report.

## Plan

1. Define a representative queue mix containing order creation, items, kitchen
   status, discounts, and payment-adjacent operations without executing real
   charges.
2. Prepare a Landi release build and controlled network rig with online,
   throttled, disconnected, flap, and reconnect phases.
3. Seed depths 100, 300, and 500. Capture at least 20 persistence transitions
   per depth so P50/P95/max are meaningful; repeat reconnect replay at least
   five times per depth.
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
   crossed; require a separate implementation review before code changes.

## Website Impact

None. The queue and `dexa-pos-sync` MMKV storage are React Native POS-only.
No website code, environment variable, or Supabase migration is required for
the measurement phase.

## Progress

- Notion ticket fetched and reviewed.
- Queue persistence implementation and all save call sites inspected.
- Added the physical-device runbook and results worksheet in
  `aud-14-offline-queue-persistence-measurement-report.md`.
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

- Confirm Landi model, release build, and network-throttling method.
- Run the 100/300/500-depth matrix and attach raw telemetry.
- Assign a non-implementer to record the final measurement run.
