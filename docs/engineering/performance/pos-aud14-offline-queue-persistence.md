# POS AUD-14 Offline Queue Persistence

## Summary

Measure full-array offline queue persistence at depths 100, 300, and 500 under
controlled poor Wi-Fi before approving any optimization.

## Scope

POS/Landi measurement only. Website work and production behavior changes are
out of scope.

## Plan

The authoritative protocol is maintained in
`docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-plan.md`
and its companion measurement report.

## Progress

The runbook and report worksheet are prepared. No queue optimization has been
implemented, and physical-device measurements are still pending.

## Verification

No performance conclusion can be recorded until the Landi 100/300/500-depth
matrix and replay/recovery checks are complete.

## Files

- `docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-plan.md`
- `docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-report.md`

## Open QA

Use a Landi release build and measured bad-Wi-Fi setup. Collect telemetry,
replay timing, restart recovery, crash-mid-replay behavior, and ordering proof.
No Supabase migration is required.
