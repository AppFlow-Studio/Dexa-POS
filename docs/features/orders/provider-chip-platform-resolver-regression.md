# POS Orders Provider Chip Resolver Regression

## Summary

The Previous Orders Online tab shows accurate Uber Eats and DoorDash chip
counts, but selecting either chip returns no rows. Production stores platform
values as `Ubereats` and `Doordash`; the current server-side POS filter owns a
separate case-sensitive alias list that omits both spellings.

Notion ticket:
`https://app.notion.com/p/3c08280c1b1d81c9b3b5df51f1b07b73`

## Scope

- Keep the paginated Previous Orders query server-filtered.
- Generate marketplace query patterns from the shared platform resolver.
- Make chip roster, count, selected filter, row label, and glyph use the same
  canonical provider vocabulary.
- Keep unknown non-empty platforms visible under `Other`.
- Keep null/empty platforms in `All Sources` without creating a provider chip.
- Preserve provider reset when leaving Online and composition with status/search.

## Non-Scope

- Website Orders filters, which have a separate parity ticket.
- Database schema, RPC, migration, ingestion normalization, or production data
  backfill.
- The top-level Delivery-tab product decision for marketplace delivery orders.

## Plan

1. Move query aliases into `orderPlatformResolver` and derive them from its
   canonical provider definitions.
2. Replace the Previous Orders query builder's duplicate raw token table with
   case-insensitive patterns from the resolver.
3. Align `Other`, null, and empty handling between summary counts and filtering.
4. Add resolver and query-builder coverage for every ticket spelling and filter
   composition.
5. Run focused tests, lint, and tablet QA across all date presets.

## Progress

- [x] Notion ticket fetched and marked In progress.
- [x] Current staging filter/count/list paths traced.
- [x] Root cause confirmed against current staging architecture.
- [x] Resolver/query implementation complete.
- [x] Focused automated verification complete.
- [ ] Charcoal Gardenia tablet recording and independent sign-off complete.

## Verification

Completed automated coverage:

- Resolver inputs: `Ubereats`, `Uber Eats`, `uber_eats`, `UBEREATS`,
  `Doordash`, `DoorDash`, `Grubhub`, `grubhub`, null, empty, and unknown.
- Query generation for Uber Eats, DoorDash, Grubhub, House, and Other.
- Provider filter composed with status and search.
- Existing provider-reset implementation confirmed in
  `hooks/pos/useHistoryFilterControls.ts`.

Commands and results:

- Focused Jest: 3 suites passed, 64 tests passed.
- Targeted ESLint: 0 errors and 0 warnings.
- Targeted Prettier check: passed.
- `git diff --check`: passed.

Tablet verification is still pending and must not be treated as completed.

## Files

- `lib/orderPlatformResolver.ts`
- `lib/previousOrdersFilters.ts`
- `services/historyOrderFilters.ts`
- `__tests__/order-platform-resolver.test.ts`
- `__tests__/previousOrdersFilters.test.ts`
- `__tests__/historyOrderFilters.test.ts`
- `docs/features/orders/provider-chip-platform-resolver-regression.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

1. On Charcoal Gardenia, open Orders, select Online, and use Today.
2. Confirm Uber Eats shows exactly its badge count and DoorDash does the same.
3. Use Custom for Aug 16, 2026 and verify Grubhub includes
   `ORD-20260816-0008`.
4. Repeat each provider on Today, Yesterday, Last 7 Days, and Custom.
5. Combine a provider with Status = Paid and with provider-name search.
6. Switch Online to another channel and back; confirm `All Sources` is selected.
7. Verify an unknown non-empty staging platform under All Sources and Other.
8. Verify a null/empty platform remains under All Sources and creates no chip.
9. Record the 1920x1080 Landi result and send it to Abubeckr for sign-off.

No Supabase migration or website-repository change is required for this ticket.
