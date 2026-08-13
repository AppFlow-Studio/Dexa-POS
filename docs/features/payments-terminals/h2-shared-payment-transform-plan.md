# H2 — Unify the payment-row → OrderProfilePayment mappers

**Status:** planned (fast-follow to PR #150; sibling of M1 which shipped in PR #151)
**Base branch:** `Table-And-Order-Syncing` (post-#150), like #150/#151 — **not** `feat/pos-menu-surface`.
**Risk:** medium-high (money-handling; touches every order-detail render). Its own PR, staging E2E required.

---

## Problem

There are **three** functions that turn a raw `order_payments` row into an `OrderProfilePayment`, plus one that merges already-mapped arrays:

| # | Function | Location | Role |
|---|----------|----------|------|
| 1 | `syncOrderFromDatabase` inline mapper | `stores/useOrderStore.ts` (~15265–15380) | inline raw-mapper |
| 2 | `syncOrderFromBackendComplete` inline mapper | `stores/useOrderStore.ts` (~16755–16951) | inline raw-mapper (fullest of the inline two) |
| 3 | `normalizeFetchedPayment` → `transformBroadcastPaymentToProfile` | `utils/orderTransformers.ts` (1112, 388) | **already-built, most complete** raw→profile pipeline |
| — | `mergePayments` | `stores/useOrderStore.ts` (4317) | **merger**, not a mapper — leave as-is |

They have **drifted**. #150 had to independently re-fix `status='void'` handling and junction-table `itemsCovered` in mapper #1 — bugs that #3 never had. Left alone, the next payment-shape change has to be applied in three places and will drift again.

### Why #3 is the canonical target
`normalizeFetchedPayment(row)` already consumes a raw `order_payments` row (the exact `row_to_json(op.*)` shape `get_order_details` returns) and already handles everything the inline mappers do — and several things they *don't*:

- `status:'void' → 'voided'` (line 1126)
- settlement (`is_settled`, `settled_at`), full return/refund fields, `service_charge`/`service_charge_refunded`
- `amountTendered`/`changeGiven`, `cashSavings`, `splitInfo`
- comprehensive `transactionDetails` incl. dejavoo reconstruction + castles + `entryMode`

The eager-load path (`useOrdersQuery` → `orderTransformers`) **already** runs raw rows through `normalizeFetchedPayments → transformBroadcastPaymentsToProfile`. So this is a *proven* pipeline; the two inline mappers are the outliers.

### The one genuine hazard: refund-monotonicity double-merge
`syncOrderFromDatabase`'s inline mapper does an explicit `Math.max(dbRefunded, localRefunded)` merge (and conditional take of `isReturned`/`returnedAt`/… from local) **inside the map**. The shared pipeline does **not** merge against local — nor should it (a pure mapper has no local state). So:

- In **`syncOrderFromDatabase`** the local-refund merge must be re-applied as a **separate post-map step**, exactly once.
- In **`syncOrderFromBackendComplete`** the refund merge already lives *outside* the mapper (in its `mergedPayments` reconciliation, keyed on `localPaymentsByDbId`). So swapping its mapper is clean — but we must confirm the `mergedPayments` step still receives correctly-shaped `serverPmt` objects and that we don't accidentally merge twice.

> ⚠️ Not-blockers (the workflow flagged these off pre-#150 code): `status='void'` and junction `itemsCovered` are **already fixed** in mapper #1 by #150. Adding `transactionDetails`/`amountTendered`/`changeGiven`/`cashSavings`/`splitInfo`/settlement to the `syncOrderFromDatabase` output is an **improvement**, not a regression.

---

## Canonical entry point

```ts
// raw order_payments rows (from get_order_details data.payments) →
transformBroadcastPaymentsToProfile(
  normalizeFetchedPayments(rawRows),   // must export normalizeFetchedPayments
  paymentItems,                        // data.payment_items (junction) — confirm exact arg position
  orderCardTotal,                      // dbOrder.card_total ?? total_amount
  orderCashTotal,                      // dbOrder.cash_total
)
```

Then, at each call site, apply the local-preservation merges that are site-specific (refund monotonicity, pre-auth/committed-missing preservation) **around** this pure result.

---

## Waves

### Wave 0 — Compatibility audit (no code changes)
- Field-map `row_to_json(order_payments.*)` (from `get_order_details`) against `FetchedOrderPayment` (the input type of `normalizeFetchedPayment`). Confirm every field `normalizeFetchedPayment` reads exists on the RPC row (`reference_number`, `processor_response`, `terminal_response`, `is_settled`, `return_*`, `amount_tendered`, `change_given`, `split_count`, `original_amount`, `service_charge*`). Note any the RPC omits.
- Confirm the exact parameter order of `transformBroadcastPaymentsToProfile` (payments, paymentItems, cardTotal, cashTotal) and of the singular.
- Diff the **current** inline outputs vs the pipeline output for one captured-card, one cash-with-change, one pre-auth, one voided (`status='void'`), one refunded, one split payment — enumerate every field that changes. Classify each as *fix* / *neutral* / *regression*. Expect zero regressions after Wave 1's merge-extraction.
- **Exit test:** a written field-delta table checked into this doc; no regressions unexplained.

### Wave 1 — Export + lock canonical mapper with unit tests (mechanical, no call-site swap yet)
- Export `normalizeFetchedPayment` + `normalizeFetchedPayments` from `orderTransformers.ts`.
- (Optional) add a thin, well-named adapter `mapOrderPaymentRowsToProfile(rows, { paymentItems, cardTotal, cashTotal })` wrapping the two-call pipeline, so call sites read cleanly and the arg order is centralized.
- **Tests (new, `__tests__/sharedPaymentMapper.test.ts`):** feed representative RPC rows and assert output field-by-field:
  - captured card → `transactionDetails` populated, `last4`/`cardBrand` present
  - cash w/ change → `amountTendered`/`changeGiven`/`method='Cash'`/`cashSavings`
  - `status='void'` → `status='voided'` **and** `isVoided=true`
  - pre-auth `authorized` → pre-auth block (`preAuthRrn`/`preAuthStan`/`preAuthTerminalType`)
  - refunded row → `refundedAmount`, `isReturned`, return fields
  - split → `splitInfo`
  - junction coverage → real `itemsCovered` qty/unitPrice/subtotal
- This is the **safety net that lands before any call-site swap.**

### Wave 2 — Migrate `syncOrderFromBackendComplete` (lower risk first)
- Replace its inline `paymentsData.map(...)` with the canonical pipeline; keep the downstream `mergedPayments`/`localPendingPayments`/`preservedCoverageItemIds` reconciliation **unchanged**.
- Verify no double-merge: the refund-max already happens in `mergedPayments`, and the pipeline does not merge — so still exactly once.
- **Tests:** existing `demandDrivenDetailFetch` / `orderDetailStaleness` structural + behavioral suites; add a structural pin that this function calls the shared mapper. **Staging E2E:** pay → refund → reopen; pre-auth → capture; split-by-item.

### Wave 3 — Migrate `syncOrderFromDatabase` (has the inline refund merge)
- Replace its inline `dbPayments.map(...)` with the canonical pipeline, threading `paymentItemsByPaymentId`/`paymentItems` + `card_total`/`cash_total`.
- **Extract the refund-monotonicity merge** (currently inline) into a reusable helper `mergeLocalRefundEvidence(serverPmt, localPmt)` and apply it as a **post-map step** against `localPaymentsByDbId` — exactly once. Preserve the existing `keepLocalFinancials` guard and M1's discount/reversal/refund-item wiring (already shipped in #151 — must not be lost in the refactor).
- **Tests:** extend `__tests__/syncOrderFromDatabaseDiscountMetadata.test.ts` scope or add a payment-mapping structural pin; unit-test `mergeLocalRefundEvidence`. **Staging E2E:** refund that races a prefetch/refresh (verify chip doesn't regress); void on another station then refresh here; cash change; split coverage.

### Wave 4 — Consolidate refund-merge (optional, anti-drift)
- The `Math.max` refund-evidence merge now exists in `mergeLocalRefundEvidence` (Wave 3), `mergePayments` (broadcast), and `syncOrderFromBackendComplete`'s `mergedPayments`. Point all three at the one helper so this logic can never drift again.
- **Tests:** the helper's unit tests + all three call-site suites green.

---

## Risks & mitigations
- **Double-merge of refunds** → extract merge to one helper, apply exactly once per site; unit-test the helper; Wave-2/3 E2E on refund-races.
- **`transactionDetails` newly present on the DB-sync path** → any consumer doing unguarded `transactionDetails.X` could change behavior. Audit readers; they already null-check (the field is optional everywhere today). Low risk, but grep before Wave 3.
- **`itemsCovered` shape** already unified by #150 on mapper #1; pipeline matches. Confirm split-by-item coverage unchanged in Wave 0 delta.
- **Regression surface = every order-detail render** → land behind waves, each with staging E2E; keep PRs small and reviewable.

## Rollback
Each wave is an independent commit that swaps one call site. Revert the single wave commit to restore the inline mapper; Wave 1 (export + tests) is inert on its own.

## Verification matrix (run per Wave 2 & 3, on staging)
| Scenario | Assert |
|---|---|
| Captured card | last4/brand, transactionDetails, entryMode |
| Cash w/ change | amountTendered, changeGiven, cashSavings, method=Cash |
| Voided (`status='void'`) | status=voided, isVoided=true, does not resurrect |
| Refund (+ race a prefetch/refresh) | refundedAmount, isReturned, chip does not flash back to Paid |
| Pre-auth → capture | pre-auth block, then captured; no status regression |
| Split-by-item | itemsCovered real qty/price; paidQuantity correct |
| Settlement | is_settled/settled_at present in batch views |
| M1 (regression) | Refunds tab, discount badge, reversals timeline still populate |

## Reviewers
Per repo convention: run the finished plan/PR through senior-eng-manager + senior-backend personas before merge; cross-check bad-WiFi deadline wrap + dead-letter UX aren't disturbed (these paths are Category C reads, deadline-wrapped already).
