# POS printed receipt - remove unused dual-pricing alt line

## Summary

- Ticket: remove the unused alternative dual-pricing line from finalized POS printed receipts.
- Merchant expectation: show only the pricing actually charged plus tender / amount paid.
- Scope: printed receipt render path only. No pricing math, database columns, RPCs, or dual-pricing calculations change.

## Scope

- In scope:
  - printed receipt render data
  - printed receipt templates for structured document printers and raw ESC/POS printers
  - targeted regression coverage
- Out of scope:
  - digital / SMS / email receipt renderer
  - CFD display
  - pricing calculation logic

## Plan

1. Find the printed receipt total composer and confirm whether the alt line is printer-specific or shared.
2. Change the printed receipt data builder to collapse to the actual charged pricing mode for finalized single-mode payments.
3. Update print templates so the primary total label reflects the charged mode and no alternate total line is emitted.
4. Add targeted regression coverage for both print builders.

## Progress

- Completed codebase search for receipt builders and dual-pricing paths.
- Confirmed printed receipt uses `services/printing/PrinterService.ts` +:
  - `services/printing/templates/ReceiptDocumentTemplate.ts`
  - `services/printing/templates/ReceiptTemplate.ts`
- Implemented print-path pricing collapse based on actual settled payment mode.
- Added regression tests for cash-paid and card-paid printed receipts.
- Targeted Jest verification passed on `2026-06-20`.

## Verification

- Targeted automated verification completed:
  - `npx jest __tests__/receipt-print-pricing-mode.test.ts`
- Manual / physical verification still required:
  - Star Micronics print
  - Landi built-in thermal print
  - historical receipt reprint

## Files

- `AGENTS.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/features/payments-terminals/receipt-print-remove-alt-total-line.md`
- `types/printer.ts`
- `services/printing/PrinterService.ts`
- `services/printing/templates/ReceiptDocumentTemplate.ts`
- `services/printing/templates/ReceiptTemplate.ts`
- `__tests__/receipt-print-pricing-mode.test.ts`

## Open QA

- Confirm printed output shows only the charged pricing label for:
  - cash-paid orders
  - card-paid orders
- Confirm split / mixed tender behavior is unchanged.
- Confirm no alt total line appears on historical reprints.
