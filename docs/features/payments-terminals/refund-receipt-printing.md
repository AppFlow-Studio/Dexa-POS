# Refund Receipt Printing

## Summary

Refunds can complete at the payment terminal without producing customer proof
of credit. The terminal response is retained in JSONB, but processor approval
fields are not consistently copied into queryable reversal/payment columns and
the POS has no customer-facing refund receipt print path.

## Scope

- Normalize terminal approval data for full, amount, and item refunds.
- Pass normalized values through the existing `update_reversal_status_v2` and
  `apply_refund_to_payment_v4` RPC arguments without changing their signatures.
- Add refund receipt identity and delivery linkage schema.
- Seed a `refund` receipt template from each location's active sale receipt.
- Backfill completed refund approval data from existing terminal JSONB.
- Build a dedicated physical refund receipt document for Star, Landi, and
  document-capable ESC/POS printers.
- Auto-queue a refund receipt after an authoritative successful refund.
- Allow completed refunds to be reprinted from Previous Orders.

## Non-Scope

- The hosted public refund receipt page and public payload RPC.
- Email/SMS refund delivery and refund-specific `receipt_sends` writes.
- Website receipt-template editing UI.
- Changing refund, dual-pricing, or fee calculations.
- Resolving the separate dual-pricing fee/terminal-credit discrepancy.

The hosted page, email, and SMS work belongs in the website repository. The
shared migration in this ticket creates the reversal linkage that work needs.

## Plan

1. Centralize processor refund-response parsing and use it in every refund
   completion path.
2. Add reversal receipt tokens/numbers, `receipt_sends.reversal_id`, refund
   template seeding, and safe historical approval-data backfill.
3. Add a precomputed refund receipt payload loader and zero-arithmetic document
   renderer.
4. Auto-print completed online refunds and print queued offline cash refunds
   after successful reconciliation.
5. Add a Reprint action to completed reversal rows in Previous Orders.
6. Add focused parser, receipt-document, and refund-flow tests.

## Progress

- [x] Ticket contract reviewed and POS/website ownership separated.
- [x] Existing refund and print paths located.
- [x] Approval persistence normalized.
- [x] Shared migration implemented.
- [x] Physical refund receipt implemented.
- [x] Auto-print and reprint implemented.
- [x] Hybrid customer-facing layout applied (2026-08-19): `REFUND RECEIPT`
      title, Date/time, Receipt # / Original Receipt #, Cashier + POS, positive
      line amounts, Subtotal/Tax, thank-you + "3-5 business days" footer, and a
      barcode — while retaining processor proof (Refund RRN, Batch, Invoice) and
      moving deep audit (Terminal, Original RRN, Reason, balances, signature) to
      the merchant copy. A single document adapts across full / per-item /
      custom-amount refunds and card vs cash tender.
- [x] Targeted automated verification complete: 30 tests passed (3 suites).
- [x] Migration applied to staging (2026-08-19): identity trigger/function, XOR
      constraint, FK, both unique indexes present; all 74 completed refunds have
      `refund_number` + `receipt_token` (backfill 0 missing); 12 refund
      templates seeded. Canonical `.sql` mirrored into the dexapos-website repo.
- [ ] Physical printer QA complete.
- [ ] Migration applied to prod (user-run).

## Verification

### Automated

Completed on 2026-08-18:

```text
Test Suites: 3 passed, 3 total
Tests:       27 passed, 27 total
```

- Castles nested `castles_transaction` fields resolve to RRN, authorization,
  result, batch, invoice, card brand, and last four.
- Top-level Dejavoo/Valor response fields continue to resolve.
- Item-return and amount/full paths pass identical normalized approval values.
- Refund document suppresses absent optional rows and marks reprints.
- The renderer uses only precomputed monetary values.

### Supabase

1. Apply `supabase/migrations/20260818120000_refund_receipt_foundation.sql` to
   staging.
2. Confirm completed refund reversals have `receipt_token`, `refund_number`,
   `reversal_psp_reference`, and `result_code` when present in terminal JSONB.
3. Confirm linked payments have `return_rrn`, `return_auth_code`,
   `return_reference_id`, and `return_number` when present.
4. Confirm active locations with an active `receipt` template also have one
   active `refund` template.
5. Confirm an order receipt send can still be inserted and the new constraint
   requires exactly one of `order_id` or `reversal_id`.

### POS / Physical

1. Card full refund: approve on terminal; confirm one customer refund receipt
   auto-queues and prints.
2. Card custom partial refund: confirm amount validation blocks values above the
   remaining balance before terminal activity; approve a valid amount.
3. Item refund: confirm refunded items and negative line totals print.
4. Cash refund: confirm no card-only statement-credit or processor rows print.
5. Previous Orders > order > Refunds: tap Reprint and confirm `REPRINT` appears.
6. Repeat on Star Micronics and Landi built-in printers.
7. Verify the paper includes refund/original dates, refund and order numbers,
   total refunded, payment/card data when applicable, refund RRN, batch,
   invoice, original RRN, reason, and remaining refundable balance.
8. Confirm normal void and sale receipt paths are unchanged.

### Website Handoff

- Implement `get_public_refund_receipt(p_reversal_token text,
  p_send_token text default null)` as `SECURITY DEFINER` with a pinned
  `search_path` and a precomputed receipt payload.
- Extend the receipt sender to accept a reversal token/id, insert
  `receipt_sends.reversal_id`, and deliver email/SMS hosted refund receipts.
- Add refund template management/preview if the dashboard exposes receipt
  template types.
- Use `reversals.receipt_token` for hosted URLs and never expose the reversal
  UUID as the public credential.

## Files

- `services/refundService.ts`
- `lib/refundApproval.ts`
- `services/refundReceiptService.ts`
- `services/printing/PrinterService.ts`
- `services/printing/templates/RefundReceiptDocumentTemplate.ts`
- `hooks/orders/useRefundMutation.ts`
- `services/offlineSyncInit.ts`
- `components/previous-orders/detail/RefundsTab.tsx`
- `stores/useReceiptTemplateStore.ts`
- `types/printer.ts`
- `types/refunds.ts`
- `supabase/migrations/20260818120000_refund_receipt_foundation.sql`
- focused tests under `__tests__/`

## Open QA

- Apply and verify the shared migration in staging before tablet testing.
- Capture physical print evidence on both supported printer families.
- Website owner must complete hosted/email/SMS delivery before the cross-repo
  P0 ticket can be marked Done.
- Product must confirm the long-term refund-number format. This implementation
  uses `R{station-or-location-code}-{six-digit-sequence}` with an atomic
  location-scoped sequence.
- The installed Prettier command is blocked by the repository's existing ESM
  Tailwind plugin loading error. ESLint completed with zero errors, and
  `git diff --check` passed.
