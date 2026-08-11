# Database Engineering

This directory contains POS-side database architecture, performance, measurement, and remediation-planning documentation. Database statistics described in the shared audit are cumulative evidence from the staging database used by both Dexa-POS and DexaPOS-Website; they are not POS-attributed runtime measurements unless a controlled workload capture says otherwise.

## Current Audit

- [POS Supabase Performance and Architecture Audit — 2026-08-03](POS-SUPABASE-PERFORMANCE-AUDIT-2026-08-03.md)
- [POS Supabase Performance Senior Summary — 2026-08-03](POS-SUPABASE-PERFORMANCE-SENIOR-SUMMARY-2026-08-03.md)
- [POS Runtime Capture Runbook — 2026-08-03](POS-SUPABASE-PERFORMANCE-RUNTIME-RUNBOOK-2026-08-03.md)
- [POS Partial Runtime Evidence — 2026-08-03](POS-SUPABASE-PERFORMANCE-PARTIAL-RUNTIME-EVIDENCE-2026-08-03.md)

The companion SELECT-only collector is `supabase/audits/20260731_database_workload_delta_readonly.sql`.

## Guardrails

- Treat shared catalog and `pg_stat_statements` snapshots as shared-database evidence.
- Version shared RPC changes and preserve deployed/offline-client compatibility windows.
- Use forward-only migrations from the declared canonical migration root.
- Do not infer index needs, Redis needs, or production capacity from static source alone.
- Keep payments, active orders, KDS, shifts, inventory acceptance, and subscription access authoritative in Postgres.
