# POS Online Orders Local-Day Boundaries

## Summary

Make Today, Yesterday, Last 7, and Custom use location-local midnight and keep
active online orders visible independently of the selected historical range.

## Scope

POS Online Orders plus the shared Supabase RPC. Website date filtering is out
of scope.

## Plan

The authoritative implementation and QA plan is maintained in
`docs/features/orders/online-orders-local-day-boundaries-plan.md`.

## Progress

POS code and migration are implemented. Staging migration deployment and
tablet QA remain.

## Verification

Targeted Jest previously passed 19 tests and targeted lint passed.

## Files

See the authoritative plan's Files section. The required migration is
`supabase/migrations/20260804120000_online_orders_board_local_day.sql`.

## Open QA

Apply the migration to staging, then run Today/Yesterday/Last 7/Custom,
local-midnight, active-order, and DST fallback checks from the authoritative
plan.
