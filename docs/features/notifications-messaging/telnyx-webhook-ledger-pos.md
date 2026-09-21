# Telnyx Webhook Ledger Go-Live - POS

## Summary

This is the POS-owned portion of the Notion ticket:

- Ticket: `[Backend - Messaging] Telnyx webhook go-live - connect the built receiver, close the ledger gaps, confirm what we send`
- Notion page: `3de8280c-1b1d-81b3-8ced-fc8d9efe92a3`
- POS branch: `fix/telnyx-webhook-ledger-pos`
- Website source branch: `fix/telnyx-webhook-ledger-go-live` at `bc7a0932`

The POS repository owns three Telnyx Edge Function send paths. They now use the
same shared sender as the Website branch and write every provider outcome to the
shared `message_log` ledger through `log_outbound_message`.

The Website repository owns the database migration, webhook receiver, order
notifications, quick messages, campaigns, and other Website senders. No Website
file or POS migration was changed by this work.

## Scope

- Synchronize the shared Telnyx sender into POS.
- Enable messaging-profile webhooks on every POS-owned SMS send.
- Pass primary and failover per-message webhook URLs when configured.
- Record merchant, destination, Telnyx ID, sender number, messaging profile,
  send status, and error code for each POS-owned send attempt.
- Preserve Telnyx IDs and metadata for immediate `sending_failed` and
  `delivery_failed` responses.
- Preserve POS-only kiosk receipt confirmation behavior.
- Add focused tests and document deployment and staging QA.

## Non-Scope

- Do not copy or recreate
  `supabase/migrations/20260918120000_telnyx_message_ledger_go_live.sql`.
- Do not modify or deploy `telnyx-webhook` from the POS repository.
- Do not change Website-owned order, quick-message, campaign, storefront, or
  invoice send paths.
- Do not configure Telnyx Mission Control or Supabase secrets from this branch.
- Do not deploy Edge Functions from this branch as part of local verification.

## POS SMS Send Inventory

| POS workflow | Client caller | Edge Function | Merchant source | Ledger state |
| --- | --- | --- | --- | --- |
| Waitlist notify/re-notify | `useWaitlistStore` through `FloorPlanService.sendWaitlistSms` | `notify-waitlist-guest` | `waitlist.merchant_id` | Shared sender plus complete outbound ledger metadata |
| Reservation notification | `useReservationStore` through `FloorPlanService.sendReservationSms` | `notify-reservation-guest` | `reservation.merchant_id` | Shared sender plus complete outbound ledger metadata |
| Receipt SMS, including kiosk confirmation | `sendReceiptService` from receipt and kiosk surfaces | `send-receipt` | `orders.merchant_id` | Shared sender plus order customer attribution and complete outbound ledger metadata |

Repository-wide search found no other POS-owned direct call to
`https://api.telnyx.com/v2/messages`. Client components invoke one of the three
Edge Functions above and do not send directly to Telnyx.

## Shared Website Synchronization

The following Website files were inspected read-only on
`fix/telnyx-webhook-ledger-go-live` and their Telnyx behavior was synchronized:

| Website source | POS equivalent | Result |
| --- | --- | --- |
| `supabase/functions/_shared/telnyx.ts` | Same path | Added shared sender, webhook fields, response metadata, and immediate failure preservation |
| `supabase/functions/notify-waitlist-guest/index.ts` | Same path | Replaced direct REST call and added ledger RPC |
| `supabase/functions/notify-reservation-guest/index.ts` | Same path | Replaced direct REST call and added ledger RPC |
| `supabase/functions/send-receipt/index.ts` | Same path | Replaced only the Telnyx block and added ledger RPC |

### Intentional POS Differences

- POS keeps its embedded receipt renderer, `confirmation` request flag, and
  `RECEIPT_BASE_URL` kiosk confirmation link. The Website branch has a separate
  hosted-receipt/send-token implementation that is not safe to overwrite here.
- POS records the normalized E.164 receipt destination in `message_log`; the
  Website implementation currently passes the raw receipt recipient string.
- POS adds a local Deno environment declaration so its Jest/TypeScript contract
  test can import the shared sender. Runtime behavior is unchanged.
- POS preserves provider metadata even when a non-2xx Telnyx response includes
  a message ID/status. The Website helper currently drops that metadata in its
  early HTTP-error branch and should adopt the same hardening for full parity.
- POS uses Jest coverage tailored to this repository instead of copying the
  Website Vitest suite or its migration/webhook assertions.

## Send Contract

Each POS sender now performs this sequence:

1. Resolve the authenticated merchant-owned waitlist, reservation, or order.
2. Render the SMS body server-side.
3. Send through `_shared/telnyx.ts` with `use_profile_webhooks: true`.
4. Include `webhook_url` and `webhook_failover_url` when configured.
5. Preserve the provider message ID, status, sender, profile, and error code.
6. Call `log_outbound_message` with the merchant and send metadata.
7. Update the workflow-specific result record and return a safe client result.

No function writes the phone number, SMS body, OTP, API key, or bearer token to
application logs. Ledger RPC errors log only the database error code.

## Shared Database Dependency

The Website-owned migration must be deployed before these POS Edge Functions:

`DexaPOS-Website/supabase/migrations/20260918120000_telnyx_message_ledger_go_live.sql`

That migration adds `p_messaging_profile_id` to `log_outbound_message` and keeps
the function service-role-only. Deploying the POS functions first would cause
the new ledger RPC calls to fail against the old signature.

After the shared migration is deployed, regenerate the POS Supabase types so
`database.types.ts` includes `p_messaging_profile_id`. The Edge Functions use an
untyped service-role client, so generated type changes are not duplicated here.

## Environment And Deployment

Required by the POS sender functions:

- `TELNYX_API_KEY`
- One of `TELNYX_FROM_NUMBER` or `TELNYX_MESSAGING_PROFILE_ID`
- `TELNYX_WEBHOOK_URL`
- `TELNYX_WEBHOOK_FAILOVER_URL`

Required by the Website-owned webhook receiver:

- `TELNYX_PUBLIC_KEY`

Recommended deployment order:

1. Deploy the Website-owned migration to staging.
2. Configure the staging Telnyx profile, public key, primary URL, and failover.
3. Set all sender secrets on the staging Supabase project.
4. Deploy the three POS Edge Functions. Their shared Telnyx module is bundled.
5. Complete the staging QA matrix and ledger queries.
6. Repeat with a separate production messaging profile and production URLs.

Staging and production should not share one messaging profile because a profile
has one webhook destination. If they must share, the per-message webhook URLs
configured here are mandatory and require explicit staging verification.

## Verification

### Automated

- `npx jest __tests__/telnyxLedgerGoLive.test.ts --runInBand`
  - Passed: 1 suite, 12 tests.
- Targeted ESLint over the new test and four Edge Function files:
  - Passed with `import/no-unresolved` disabled only for Deno URL imports.
  - The normal resolver cannot resolve `https:`, `npm:`, or Deno imports.
- Standalone TypeScript check for the shared sender and focused Jest suite:
  - Passed with the Node/Jest and DOM libraries supplied explicitly.
- `npx tsc --noEmit --pretty false`
  - Repository-wide check still fails on pre-existing offline DB test typing and
    missing `expo-sqlite`/`react-native-compressor` declarations.
  - No reported error references a Telnyx ticket file.
- Local Deno check was not run because Deno is not installed in this workspace.

The focused tests cover:

- Profile webhooks plus primary and failover callback fields.
- E.164 normalization and messaging-profile configuration.
- Immediate provider failure ID, error, sender, and profile preservation.
- Fail-closed behavior when Telnyx credentials are missing.
- Shared-sender and complete-ledger wiring in all three POS send functions.
- POS kiosk receipt confirmation preservation.
- No duplicate Website-owned migration in POS.
- No direct SMS payload fields passed to application logging calls.

## Manual Staging QA

- [ ] Deploy the Website migration before the POS functions.
- [ ] Confirm all required staging secrets without printing their values.
- [ ] Send one waitlist notification and verify exactly one `message_log` row
  with the correct merchant, normalized destination, Telnyx ID, sender/profile,
  and `sent` status.
- [ ] Send one reservation notification and perform the same ledger check.
- [ ] Send one normal POS receipt SMS and verify the receipt and ledger rows.
- [ ] Send one kiosk confirmation receipt SMS and verify its short receipt link
  and ledger row.
- [ ] Use an invalid number and verify a `failed` row with the Telnyx error code.
- [ ] Force an immediate `sending_failed` or `delivery_failed` response and
  verify the provider ID is retained on the failed ledger row.
- [ ] Verify successful rows advance from `sent` to `delivered` through the
  Website-owned webhook and gain raw/cost metadata.
- [ ] Confirm a second merchant cannot read the first merchant's rows.
- [ ] Confirm logs contain no phone number, body, OTP, API key, or credential.
- [ ] Repeat the ticket's reply, STOP/START, forged signature, idempotency, and
  DLQ checks against the Website-owned webhook.
- [ ] Attach screen recording and obtain Abubeckr sign-off.

## Remaining Blockers

- Telnyx Mission Control access or Temur configuration is required for the
  public key, messaging profile URLs, and real-phone tests.
- The Website migration and webhook function must be reviewed and deployed.
- POS Edge Functions require staging deployment before end-to-end QA.
- Production verification requires separate production secrets and profile.
- Physical staging QA and verifier sign-off remain open.

## Files

- `supabase/functions/_shared/telnyx.ts`
- `supabase/functions/notify-waitlist-guest/index.ts`
- `supabase/functions/notify-reservation-guest/index.ts`
- `supabase/functions/send-receipt/index.ts`
- `__tests__/telnyxLedgerGoLive.test.ts`
- `docs/features/notifications-messaging/telnyx-webhook-ledger-pos.md`
- `docs/features/notifications-messaging/README.md`
- `docs/features/waitlist-host/DM-010-05_IMPLEMENTATION_SUMMARY.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- [ ] Shared migration deployed to staging.
- [ ] Sender and webhook secrets configured.
- [ ] Three POS workflows verified with a real phone.
- [ ] Delivery callbacks verified in `message_log`.
- [ ] Production rollout verified.
- [ ] Abubeckr sign-off received.
