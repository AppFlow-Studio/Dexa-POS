# Kiosk Valor payment validation

## Summary

Branch: `feat/kiosk-valor-validation`. Base: `origin/staging` at `32ec8132`,
fetched 2026-09-08; local staging had zero commits ahead/behind and a clean tree.
Validate unattended checkout using the existing shared terminal adapter.

Status: confirmed code gaps implemented and automated verification passed.
Physical terminal QA and deployed RPC verification are not complete. No sandbox terminal has been
configured or charged by this work.

## Scope

Use `chargeActiveTerminal` and the shared Valor service for both TCP and USB.
Preserve order-before-charge, approval-before-payment, payment-before-kitchen,
late-approval precedence, and staff reconciliation for uncertain/partial payments.
No new processor implementation, schema migration, package/lockfile change, or
DexaPOS-Website edit.

## Plan

1. Inspect kiosk, terminal resolution, transports, payment persistence, access
   controls, and the four requested test suites.
2. Fix confirmed checkout races and unsafe recovery/retry behavior.
3. Test the hook through the shared adapter, plus service/transport regressions.
4. Publish a draft PR; leave device and deployment checkboxes open for evidence.

## Progress

- Audited the requested kiosk, adapter, cancellation, Valor transport/mapper,
  registration/identity, access, and test files against the staging base.
- Implemented confirmed gaps through the existing shared payment path.
- Completed focused automated tests and lint; physical/deployment checks remain
  pending. Publish as draft, not a production-ready or Done claim.

## Audit And Changes

| Requirement | Evidence / outcome |
| --- | --- |
| Same terminal as POS | Both use `resolveActiveProcessor`; kiosk refreshes selected station before order creation and before charging. ATOM preference remains respected. For Valor QA, disable the on-device ATOM preference. |
| Active station/terminal | Existing `get_location_stations_with_status` resolves active terminals from `payment_terminals.station_id`; explicit inactive stations are now rejected. Capabilities checked before checkout. Kiosk profile ID retained during refresh. |
| TCP and USB | Shared adapter uses TCP/local_socket or USB. EPI, valid TCP/cancel ports, and registered identity-mismatch status checked. Defaults remain 5000/5001. Missing/unsupported configuration fails before sale. |
| USB identity | Refuse multiple compatible USB devices instead of selecting the first. Physical device must match the assigned EPI/serial; USB VID/product hints alone do not prove merchant identity. Terminal query may return ACK only, so hardware identity verification remains manual. No invented USB identity column. |
| Endpoint changes | Fix connection reuse comparing the new config to itself. Switching terminal, host, port, or transport reconnects. |
| Amount/tip | Fetch server `orders.card_total` after item sync; require a finite positive amount matching recalculated local total, reject invalid tips, and charge rounded total plus tip. Valor receives base/tip in integer cents. Mismatch aborts before charge. |
| Persisted processor data | Existing mapper passes transaction ID, TRAN_NO, STAN, approval code, RRN, last four, brand, raw masked PAN and terminal ID to payFullCard; captured STAN now survives finals omitting STAN. Tip passed separately to payment RPC. Actual DB column promotion remains deployment QA. |
| Double-submit | Synchronous hook guard plus per-station execution lock on this app installation. Confirmed success cannot submit again from the same hook. This is not a distributed lock across different tablets. |
| Decline/cancel | Clean settled failure voids unpaid order. Back dispatches Valor cancelInFlight; settled approval always completes. Late cancel after charge settlement is ignored. Secondary cancel acknowledgement alone does not overwrite the sale outcome. |
| Recovery | Existing TRAN_MODE 90 after STAN preserved; unknown recovery states remain unknown. USB timeout without STAN is uncertain because USB can skip the handshake while collecting a card. |
| Partial/uncertain/exception | Persistent station payment hold, staff-assistance screen without customer retry. Held checkout cannot reset or restart a sale; idle timer pauses. Hold survives remount/restart. |
| Payment persistence failure | Never advise another charge; retain order/hold. Reuse the adapter journal's idempotency key for payFullCard and complete the journal only after confirmed fully-paid result. |
| Kitchen | One shared send invocation after payment success. Store now returns sent/queued/rejected/skipped. Anything except confirmed sent routes to staff; queued work keeps existing idempotent offline replay, never a second card charge. Exactly-once backend delivery depends on deployed send RPC idempotency and must be verified physically. |
| Suspension | Entry checks billing/station access; checkout checks before creation and again before charging. Network failure fails closed. Approval already in flight must still be recorded if suspension occurs afterward. |
| Release | Valor factory ignores both persisted mock enablement and EXPO_PUBLIC_VALOR_MOCK outside development. Existing release no-terminal simulation guard preserved. |

## Shared Contracts / Deployment

**Billing contract follow-up implemented in POS:**
`fetchMerchantBillingAccess` now consumes the shared location-aware
`get_subscription_access_state` RPC. Explicit allow/deny is authoritative, so
`billing_exempt` and `past_due_grace` remain accessible without inferring a
denial from nested subscription rows. The website-owned migration must be
deployed and POS Supabase types regenerated before E2E verification. See
`docs/features/billing/billing-pos-suspended-access.md`.

Deployment checks (read-only, authorized environment):

- [ ] Confirm `get_location_stations_with_status` returns active assigned Valor
  terminal ID, `epi`, `ip_address`, `port`, `cancel_port`, `connection_type`.
  Canonical SQL: `utils/supabase/migrations/stations_and_devices/get_location_stations_with_status.sql`.
- [ ] Confirm deployed subscription RPC returns exemption, grace, suspension,
  cancellation, and location-isolated entitlement states as documented.
- [ ] Confirm `orders.card_total` is readable by kiosk session and equals the
  authoritative payable total after item synchronization.
- [ ] Confirm deployed payment RPC accepts/persists Valor JSONB, terminal ID,
  tip, and the journal idempotency key; one payment per approval.
- [ ] Confirm deployed kitchen RPC/offline replay preserves idempotency.

## Staff Recovery

An uncertain payment must be checked against Valor and Supabase by staff. Do not
charge again, blindly void, or reset application storage. Record/reconcile any
captured payment using the existing staff recovery process, and check KDS before
dispatching a paid order. In PIN-protected kiosk diagnostics, the overview shows
the held order ID. `Resolve kiosk payment hold` requires explicit confirmation
that reconciliation is finished. It only unlocks checkout; it does not change
financial records and refuses while a sale is still executing. Resolve any
associated payment journal through the existing staff recovery tools as well.
Close settings and return to a new session afterward.

## Verification

Initial required test run: 4 suites, 56 tests passed (2026-09-08).
Final expanded run: **12 suites, 131 tests passed** (2026-09-08, 32.575 seconds).
This includes the four requested suites plus kiosk-through-real-adapter/resolver,
release mock exclusion, USB selection, station access, terminal identity and
existing kitchen regressions. Targeted ESLint across all changed TS/TSX files:
**0 errors, 43 warnings** in existing portions of Valor tests, diagnostics, USB
transport and the order store. No dependency changes or unrelated lint cleanup.
`git diff --check` passed. Full app build/typecheck and physical QA were not run.

Reproduce the expanded test run from the repository root (PowerShell):

```powershell
npx jest __tests__/kioskChargeOutcome.test.ts __tests__/valorService.test.ts __tests__/valorFraming.test.ts __tests__/chargeActiveTerminalSimGuard.test.ts __tests__/kioskValorCheckout.test.tsx __tests__/valorTransportRelease.test.ts __tests__/valorUsbSelection.test.ts __tests__/posAccessControl.test.ts __tests__/posAccessService.test.ts __tests__/terminalIdentity.test.ts __tests__/sendToKitchenTruthfulOutcome.test.ts __tests__/sendToKitchenBatchScoping.test.ts --runInBand --silent --verbose=false
```

Mock tests prove client call ordering and recovery decisions, not physical
acquirer acceptance, deployed SQL behavior, or real-world exactly-once delivery.

## Physical Sandbox QA

Use sandbox merchant and processor credentials. Run TCP and USB separately with
one assigned reader. Keep credentials and full card data out of commits/video.
Test all templates for shared checkout reachability; transaction sequence can be
recorded with one template, then smoke-test the other two.

Minimum setup: install this branch's development build with the existing native
Valor USB/TCP modules; select a sandbox kiosk/self-service station with an active
subscription and a linked kiosk profile. In the existing portal/device settings,
assign one active Valor terminal to that same station with EPI and either TCP
host/sale/cancel ports or USB mode. Confirm the physical serial matches the stored
identity, grant USB permission if applicable, and disable ATOM preference. Enable
kiosk tips and configure a receipt printer for the tip/receipt scenarios. This
uses existing website configuration, not a new website feature or migration.

| Configuration record | Value used |
| --- | --- |
| Environment / app commit / build variant | Not run; fill during QA |
| Merchant / location / kiosk station IDs | Not run |
| Terminal DB ID / model / firmware | Not run |
| Connection mode | TCP and USB pending |
| EPI / hardware serial | Record masked suffixes only in evidence |
| TCP host / sale and cancel ports | Record redacted host, actual ports |
| USB VID/PID, product, permission, listening mode | Not run |
| Operator / verifier / date / evidence URL | Not run; Abubeckr verifies DoD |

- [ ] Sale without tip: terminal amount = order card total; one order/payment,
  correct receipt and one KDS ticket, only after payment persistence.
- [ ] Sale with tip: terminal total = card total + tip; persisted tip and receipt
  agree. KDS items/order identity agree (KDS need not display tip).
- [ ] Declined card: unpaid draft voided; no payment or KDS ticket.
- [ ] Back before card: cancel command reaches reader, settled no-charge outcome,
  no paid order, cart retained. Capture TCP and USB cancellation behavior.
- [ ] Back immediately after approval: approval wins; one payment and dispatch,
  no void. Failed abort must not manufacture a cancelled result.
- [ ] Disconnect after STAN: status mode 90 recovers the original sale; never
  another SALE. If recovery unavailable, staff screen and hold persist.
- [ ] USB disconnect/timeout without STAN: staff verification, no blind retry.
- [ ] Partial approval: no fully-paid record, no kitchen dispatch, staff hold.
- [ ] Double-tap Pay and reopen/remount: one backend order and one charge/payment.
- [ ] Fail payment persistence after approval: keep order and journal/hold,
  no KDS send, no second charge, including after app restart.
- [ ] Fail kitchen send after persisted payment: paid order retained, staff
  confirmation; queued replay produces one logical dispatch without recharging.
- [ ] Inspect transaction ID, TRAN_NO/reference, STAN, CODE, RRN, last four,
  brand, terminal ID and tip in persisted payment/processor response.
- [ ] Suspend before entry and before charge: ordering/payment blocked. Restore
  and retry after refresh. Past-due grace test blocked on contract review.
- [ ] Release build with no terminal: no simulation/approval. With Valor mock
  flags previously enabled: real transport or connection error, never mock sale.
- [ ] Record evidence and obtain verifier sign-off before Done.

## Files

- `app/(main)/kiosk.tsx`: access check before entry.
- `components/kiosk/shared/useKioskCheckout.ts`: execution/amount/access gates,
  journal key reuse, persistence and dispatch outcomes.
- `components/kiosk/shared/checkoutGuard.ts`: persistent hold and station lock.
- `components/kiosk/shared/useKioskIdleTimer.ts`: pause during payment/review.
- `components/kiosk/shared/KioskDiagnosticsScreen.tsx`: staff hold resolution.
- `components/kiosk/template-a/KioskCheckoutView.tsx`: shared assistance UI.
- `services/posAccessService.ts`: active station validation/profile preservation.
- `services/terminals/chargeActiveTerminal.ts`: Valor configuration validation and
  approval journal update.
- `services/terminals/valor-service.ts`: endpoint reuse, STAN preservation and
  uncertain USB/recovery classification.
- `services/terminals/valor-transport-factory.ts`: release mock exclusion.
- `services/terminals/valor-transport-usb.ts`: reject ambiguous USB selection.
- `stores/useOrderStore.ts`: return kitchen dispatch outcome to callers.
- `__tests__/kioskValorCheckout.test.tsx`: hook plus shared adapter scenarios.
- `__tests__/posAccessService.test.ts`: actual station refresh, suspension,
  active assignment/profile preservation, and grace-conflict characterization.
- `__tests__/valorService.test.ts`: endpoint/recovery/STAN regressions.
- `__tests__/valorTransportRelease.test.ts`: release flags cannot simulate.
- `__tests__/valorUsbSelection.test.ts`: one reader vs ambiguous USB selection.
- `docs/features/kiosk/valor-validation.md`: plan, audit, results and physical QA.
- `docs/tickets/ALL-TICKETS-REFERENCE.md`: tracking entry.

## Open QA

Physical tests and deployment checks above remain unexecuted. No actual terminal
configuration, live Supabase payment result, screen recording, or sign-off is
claimed by this document. Draft PR must stay unmerged until owners review these.

Rollback: no schema or native dependency change is introduced here. Revert this
branch's changes and deploy the previously approved build if necessary. Before
rollback, staff must reconcile every pending Valor transaction, payment journal,
and kiosk hold; do not clear app storage to bypass a hold. The previous build
does not enforce this new kiosk hold and must not be used to retry uncertain sales.
