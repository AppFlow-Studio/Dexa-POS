# POS OrderOut Ready-Path Audit And E2E

## Summary

Prove that every POS/KDS Ready or Done action advances `orders.status` and
triggers the shared OrderOut relay exactly once.

## Scope

POS and KDS writer-path audit plus staging relay validation. Rebuilding the
website-owned outbound relay is out of scope.

## Plan

The authoritative matrix and test sequence is maintained in
`docs/features/orders/orderout-ready-path-audit-e2e-plan.md`.

## Progress

Repository writer chokepoints are identified. This is not code-complete: live
staging RPC definitions, feature-flag routing, relay deployment, and E2E
evidence remain unresolved.

## Verification

No final E2E verification has been completed.

## Files

No source or migration file is expected unless the live writer audit confirms
a gap.

## Open QA

Obtain staging relay access, inspect every deployed writer RPC, then exercise
POS Online Orders and every KDS Ready/Done path while checking one status
transition, one relay row, and one provider request per action.
