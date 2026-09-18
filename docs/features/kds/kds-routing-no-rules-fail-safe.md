# KDS routing fail-safe: filtered display with zero rules

## Problem

A KDS display (`kds_displays`) with `routing_mode != 'all'`, **no** `kds_routing_rules`,
and `show_all_items = false` matches no item on its own. Routing is server-authoritative:
the `route_items_to_kds()` trigger writes `kds_item_status` rows only for matched items, and
`get_kds_tickets_v2/v3` hard-filters to those rows when a `p_kds_display_id` is passed
(`AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)`).

The last-resort "blast to every display" fallback only fires when an item matched **no display
anywhere**. So at a location where another display claims items by rule, the rule-less display
receives nothing. Operators read this as *"the KDS shows nothing unless I turn on show-all."*

- Confirmed on **staging**: `kitchen display 2 KDS` (0 rules) skipped 150 real items in 30 days
  while `Kitchen Display - Main` / `Bakery` claimed them by rule.
- Confirmed on **prod**: 6 active displays across 4 locations were in the trap
  (`714c2c9d…`, `85c8f238…`, and all four at `94dd8b80…`).

Related: `docs/engineering/performance/kds-routing-traceability-pos.md`, `feedback_landi_*` (unrelated).

## Fix

Migration: `dexapos-website/supabase/migrations/20260917140000_kds_routing_fail_safe_no_rules.sql`

Inside `route_items_to_kds()`, a non-`all` display with **zero** rules is treated as catch-all
(new `match_reason = 'no_rules_catch_all'`, counted as a specific match). The moment any rule is
added, normal filtering resumes. Everything else is preserved: the NULL→non-NULL fire guard,
prep-station resolution, `show_all_items`, the expo relabel, the last-resort blast, and the full
`kds_routing_log`. The reason is also added to the `kds_routing_log_reason_chk` CHECK constraint.

Side benefit: orphan items at a location that has a rule-less catch-all display now land on that
display instead of being blasted to every specialized screen.

No client change is required — the broadcast filter already skips filtering when a display has zero
cached rules (`shouldUseDisplayFilter` requires `cachedRules.length > 0`), so broadcast and RPC are
now consistent (both show everything for a rule-less display).

## Verification (staging, rolled back)

Synthetic fires wrapped in `DO $$ … RAISE EXCEPTION … $$` (auto-rollback):

- [x] Item matching no rule → trap display routed with `no_rules_catch_all`.
- [x] Item carrying Main's prep station (`Kitchen`) → `MAIN rows=1 reason=rule_prep_station`,
      `TRAP rows=1 reason=no_rules_catch_all`, `blast_rows=0`. Before the fix TRAP would be 0.

## Deploy / follow-ups

- [x] Applied to **staging** (`dfwqakoyittmrwbqvxgw`).
- [ ] Deploy migration to **prod** (`hifouuofcaytijrkbvcy`) — manual, per repo convention.
- [ ] (Optional, admin website) Give the 6 prod trap displays intended `kds_routing_rules`,
      set them to `routing_mode='all'`, or enable `show_all_items` — the trigger fix neutralizes
      the blank screen regardless, but explicit config documents intent.
- [ ] **Menu config**, not KDS: every "orphan" item had `resolved_prep_station = NULL`. Items/categories
      need prep stations assigned (admin website) for prep-station routing to actually target screens.
- [ ] (Optional, POS repo) Cosmetic: `components/kds/KDSSettingsModal.tsx:972` colors the MODE badge with
      `routingMode === "filtered"`, but real values are `all`/`category`/`prep_station`, so filtered
      displays render in the muted "unset" color. Not committed here (this is the `feat/code-pay` branch).
