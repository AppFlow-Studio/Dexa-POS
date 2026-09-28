# Cardholder signature block on the merchant copy

Ticket: Notion "[POS · Receipts] Cardholder signature block on merchant copy — card payments only, per-location toggle" (P2, requested by Charcoal Gardenia).
Plan + mockup: https://claude.ai/artifact/5ooS8zJjSePANQTjocUJFG

## What it does

A per-location toggle on the Sale Receipt template. When on, the **merchant copy** of any receipt carrying a **card** payment prints, directly under the tender lines:

```
(3 blank lines)
X
________________________________   <- full-width divider (Star / Landi / Dejavoo)
      Cardholder Signature

 I agree to pay the above total
  according to my card issuer
           agreement.
```

- The rule is a `divider` node on the IR path so it spans the real paper width; a hyphen string built at the template's fixed w=32 only covered about half the paper on 80mm. ESC/POS keeps the `X ----` text rule (it builds at the printer's real `maxCharsPerLine`).
- Customer copies and cash-only receipts never print it. A split card+cash receipt prints it once.
- Per-payment split receipts: only the card payer's slip prints it.
- While the toggle is on, card sales always print a merchant copy, even with "Print Merchant Copy" off (`resolveSaleReceiptCopies` in `PrinterService.ts`). Cash sales keep the configured copies.
- Blank disclaimer falls back to `DEFAULT_SIGNATURE_DISCLAIMER` (`types/receipt-template.ts`).
- Offline and reprints: the setting lives on the cached receipt template (MMKV), read at print time.

Not a chargeback artifact. Terminal-side signature capture (Valor/Castles) is a separate spike.

## Decisions (2026-09-26)

1. Stored on `receipt_templates` (`print_signature_line`, `signature_line_disclaimer`), not `printers`.
2. One Sale Receipt row: the Website wrote `template_type = 'sale'`, the POS reads `'receipt'`, so Website settings never reached the tablet. Migration renames lone `sale` rows to `receipt`; where both exist, `receipt` is kept and `sale` is retired (`sale_retired`, inactive). The Website must map its "sale" tab to `'receipt'`.
3. Merchant copy is printed automatically for card sales while the toggle is on.
4. Footer text restored on the IR renderer (Star / Landi / Dejavoo). It was commented out, so a configured footer never printed there.

## Changes

- **DB** (website repo): `supabase/migrations/20260927130000_receipt_signature_line_and_sale_template_unify.sql` + rollback. Applied to **staging** 2026-09-26 (4 rows renamed, 1 retired). Prod pending.
- `types/receipt-template.ts`: `printSignatureLine`, `signatureLineDisclaimer`, mapper both ways. `database.types.ts`: the two columns (hand-added; file is UTF-16).
- `types/printer.ts`: `ReceiptTemplateData.copyType`, `ReceiptPaymentData.isCard`.
- `services/printing/templates/signatureBlock.ts`: shared gate + lines + `wrapPrintText`.
- `ReceiptDocumentTemplate.ts`: signature block after payments; header/footer honor line breaks and are pre-wrapped.
- `ReceiptTemplate.ts` (ESC/POS): signature block; copy label now uses `copyLabel` (merchant copies used to say "Customer Copy"); keeps its "Thank you for your purchase!" default footer.
- `PrinterService.ts`: `resolveSaleReceiptCopies`, `isCardTender`; the builder passes only a merchant-configured footer.
- POS Settings → Receipt Templates → Receipt: new "Card Payments" section (toggle + disclaimer) and preview.

## Verification

- `npx tsc --noEmit`: clean.
- Renderer check (throwaway script, real templates): card/merchant prints; card/customer, cash, toggle off and missing `copyType` don't; split card+cash prints once. Both IR and ESC/POS.
- Regression vs `HEAD` renderers, toggle off: IR output identical for both copies. ESC/POS identical for the customer copy; the merchant copy differs only by its label ("Merchant Copy").

## Remaining

- [ ] Print QA on device at 58mm and 80mm (Star + Landi): signing space usable, no wrap/truncation.
- [ ] QA matrix from the ticket, including reprint and offline.
- [ ] Website: sale → `receipt` mapping, `initializeDefaultTemplates` insert-only, form toggle + disclaimer, drop logo/barcode/QR/tax-breakdown toggles on Sale Receipt, preview reorder, `ReceiptModal` + `lib/receipts/header.ts` read `receipt`.
- [ ] Prod migration (user), shipped with the Website mapping.
- [ ] Screen recording to Abubeckr; reviewer sign-off.
