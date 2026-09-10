# POS subscription access and billing exemption

## Summary

POS-side consumer of the shared merchant/location subscription access contract.
The original suspended-access work used the merchant-only
`get_merchant_subscription_status` RPC. This follow-up moves POS to
`get_subscription_access_state(merchant, location)` so active billing
exemptions and past-due grace remain usable without weakening manual suspension,
cancellation, station quota, or paid-feature assignments.

Status: POS code and focused automated tests complete. Shared migration
deployment, generated type refresh, and device QA remain open.

## Scope

- Use the shared location-aware access RPC for station loading, online PIN
  login/takeover, queued-login replay, active-session validation, and kiosk
  checks before order creation and terminal charging.
- Treat explicit `allowed`, `access_allowed`, or `pos_access_allowed` as the
  authoritative decision.
- Provide a fail-closed `get_subscription_entitlement` client helper for paid
  modules without deriving entitlements from billing exemption metadata.
- Preserve station quota/inactive-station handling and the existing shared
  Valor kiosk payment sequence.

## Non-Scope

- No POS schema or migration. The shared source of truth is the website
  migration `supabase/migrations/20260908130000_merchant_billing_exemption.sql`.
- No direct read of `merchants.billing_exempt` and no duplicated expiry/card
  logic in POS.
- No website edits, subscription management UI, or invented service-code to
  POS-screen mappings.
- No changes to terminal charging, payment persistence, kitchen dispatch,
  dependencies, or lockfiles.

## Plan

1. Replace the merchant-only access call with the shared merchant/location RPC.
2. Make explicit RPC decisions win over nested legacy subscription statuses.
3. Recheck access at login, session refresh, kiosk order creation, and kiosk
   payment boundaries.
4. Add the canonical location entitlement helper and focused contract tests.
5. Deploy the website-owned migration, regenerate types, then run device QA.

## Progress

- `fetchMerchantBillingAccess` now calls `get_subscription_access_state` with
  both merchant and selected location IDs.
- The normalizer allows `billing_exempt` and `past_due_grace`, honors explicit
  allow decisions, and blocks explicit denial including merchant suspension and
  canceled merchant-tier/location subscriptions.
- Station list, station refresh, PIN login/takeover, queued login replay, and
  active-session refresh all use the location-aware path.
- Online PIN access verification now fails closed when the access RPC cannot be
  reached. Offline sign-in retains the last known blocked-state behavior.
- `fetchLocationSubscriptionEntitlement` calls the shared entitlement RPC and
  only enables a feature when `entitled === true`; exemption metadata cannot
  manufacture an entitlement.
- No existing POS production code directly read subscription tables or
  `billing_exempt`, and no confirmed service-code screen mappings existed to
  migrate.
- Kiosk still checks access before creating an order and again immediately
  before charging. Customer Valor payment, persistence, and kitchen sequencing
  are unchanged.

## Shared Contract

Required deployment before E2E testing:

`DexaPOS-Website/supabase/migrations/20260908130000_merchant_billing_exemption.sql`

The migration returns matching `allowed`, `access_allowed`, and
`pos_access_allowed` booleans. POS trusts that decision instead of inspecting
nested statuses. It also owns exemption expiry and entitlement calculation.

Backend defense-in-depth gap: the POS SQL copies of `pos_staff_login_v2` do not
call `get_subscription_access_state`, and the current client performs the
subscription check before login/session operations. The POS now fails closed
for online login verification and rechecks queued login/session state, but the
backend should eventually enforce the same RPC decision to protect other or
modified clients. That change belongs with the shared backend owner, not this
POS-only implementation.

`database.types.ts` does not yet include `get_subscription_access_state` or
`get_subscription_entitlement`. Calls are isolated behind one service boundary
using temporary RPC casts. Regenerate Supabase types after the shared migration
is deployed, then remove the casts.

## Verification

Focused command run on 2026-09-08:

```powershell
npx jest __tests__/posAccessService.test.ts __tests__/posAccessControl.test.ts __tests__/kioskValorCheckout.test.tsx __tests__/kioskChargeOutcome.test.ts __tests__/authFlow.test.ts --runInBand --silent --verbose=false
```

Result: 5 suites passed, 75 tests passed, 0 failures.

Targeted ESLint result: 0 errors and 6 pre-existing warnings in
`app/(auth)/pin-login.tsx`. No full native build or physical terminal QA was
performed.

Coverage includes active, billing-exempt, expired exemption, manual suspension,
canceled tier/location, past-due grace, location-isolated entitlements,
unassigned exempt features, pre-order/pre-charge denial, normal exempt Valor
payment, exactly-one persistence/kitchen dispatch, and uncertain/partial retry
holds.

## Files

- `lib/posAccessControl.ts`
- `services/posAccessService.ts`
- `app/(auth)/pin-login.tsx`
- `hooks/useStationLoginSync.ts`
- `__tests__/posAccessControl.test.ts`
- `__tests__/posAccessService.test.ts`
- `__tests__/kioskValorCheckout.test.tsx`
- `docs/features/billing/billing-pos-suspended-access.md`
- `docs/features/kiosk/valor-validation.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- [ ] Deploy the shared website migration in the target Supabase environment.
- [ ] Regenerate `database.types.ts` and remove the temporary RPC casts.
- [ ] Verify an active location can select a station and sign in.
- [ ] Verify a billing-exempt merchant with no SaaS billing card can sign in and
  use only its assigned features.
- [ ] Verify past-due grace remains accessible.
- [ ] Verify manual merchant suspension, canceled tier, and canceled location
  block station selection/login with clear copy.
- [ ] Verify Location A entitlement does not enable the same module at Location B.
- [ ] On a configured Valor kiosk, verify exemption still requires customer card
  payment and produces one payment plus one kitchen dispatch.
- [ ] Suspend an active session and verify polling/foreground validation logs it
  out; restore access and verify station/terminal state refreshes.
- [ ] Record device/video evidence. Do not use production cards or credentials.
