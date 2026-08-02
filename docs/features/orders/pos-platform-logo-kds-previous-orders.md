# POS Platform Logos On KDS And Previous Orders

## Summary

Ticket: POS/Expo side of the platform-logo follow-up.

KDS and POS previous-orders had inconsistent platform-logo rendering. The badge existed, but platform identity resolution was fragmented and the active KDS card memo comparison did not account for `delivery_platform` / `order_source` changes. The POS scope is client-only: no schema or RPC changes.

Expected POS behavior:

- KDS tickets show the platform badge in every state that uses the shared active ticket card, plus Done.
- POS previous-orders rows and detail surfaces use the same badge resolver.
- GrubHub, DoorDash, and Uber Eats normalize casing/separator variants.
- `website` / `app` / `kiosk` render first-party badges.
- `orderout`, `other`, and unresolved online orders render a generic Online badge.
- `order_source = pos` renders no logo.

## Scope

In scope:

- POS shared platform resolver.
- Existing POS delivery platform badge.
- KDS active/done ticket rendering path.
- POS previous-orders rows and detail views that already consume the badge.
- KDS ticket equality/memo comparison so platform changes trigger render updates.

Out of scope:

- Web dashboard Orders list / Order Details.
- Schema changes.
- RPC changes.
- Network-loaded platform assets.
- Backfilling `orders.delivery_platform`.

## Plan

1. Add a shared POS resolver that follows the contract priority:
   - `orders.delivery_platform`
   - `orders.metadata.delivery_company`
   - `online_orders.delivery_company`
   - `online_orders.provider`
   - `orders.order_source`
2. Keep legacy `normalizePlatform` behavior for existing settings/logos outside this ticket.
3. Update `DeliveryPlatformBadge` to use the resolver and bundled local assets.
4. Keep existing KDS and previous-orders badge call sites, since they already render the shared badge.
5. Add KDS equality checks for `order_source` and `delivery_platform` so active tickets refresh when platform data changes.
6. Add targeted unit tests for resolver behavior.

## Progress

- Added shared resolver:
  - `lib/orderPlatformResolver.ts`
- Updated the shared POS badge:
  - `components/order/DeliveryPlatformBadge.tsx`
- Preserved legacy alias helper:
  - `lib/platformAliases.ts`
- Updated KDS ticket store equality:
  - `stores/useKDSStore.ts`
- Updated active KDS card memo comparison:
  - `app/(main)/kds.tsx`
- Added targeted test:
  - `__tests__/order-platform-resolver.test.ts`
- Updated `docs/tickets/ALL-TICKETS-REFERENCE.md`.
- Updated `docs/handoffs/pos-ticket-senior-summary-2026-06-27.md`.

## Verification

Targeted automated verification:

```powershell
npx jest --runTestsByPath __tests__/order-platform-resolver.test.ts
npx jest --runTestsByPath __tests__/kdsTimer.test.ts
npx jest --runTestsByPath __tests__/kdsAutomation.test.ts
```

Manual QA still required:

- GrubHub order shows logo on KDS active states and Done.
- Uber Eats casing variant such as `UBEREATS` resolves to Uber Eats.
- DoorDash casing/separator variants resolve to DoorDash.
- Website/app/kiosk order shows first-party badge.
- Online order with no platform shows generic Online badge.
- POS/in-store order shows no platform badge.
- POS previous-orders row shows the badge for online orders and no badge for POS orders.

## Files

- `lib/orderPlatformResolver.ts`
- `lib/platformAliases.ts`
- `components/order/DeliveryPlatformBadge.tsx`
- `stores/useKDSStore.ts`
- `app/(main)/kds.tsx`
- `__tests__/order-platform-resolver.test.ts`
- `docs/features/orders/pos-platform-logo-kds-previous-orders.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/handoffs/pos-ticket-senior-summary-2026-06-27.md`

## Open QA

- Physical/on-device POS KDS and Previous Orders video proof still required.
- Web dashboard logo slice is intentionally not handled in this repo/task.
- Abubeckr signoff required before marking Done.
