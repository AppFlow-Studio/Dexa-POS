# Split check + card tips: terminal pacing and per-guest tip capture

**Status:** Waves 1–2 implemented on branch `fix/split-tip-terminal-pacing` (cut from
`feat/split-receipts` with `feat/codepay-uiux` merged in). `tsc`, lint and the existing Jest suite pass.
No device check has been run yet. Wave 3 not yet implemented.
**Owner doc for:** spacing between payment-terminal commands, the post-capture tip step on the
customer display, and the wait between guests on a split check.

## Report — 2026-09-26, Charcoal Gardenia (S1 C20Pro, Castles)

On a split check paid by card, when every guest tips, the POS crashes. It happens while the payments
are being taken. What the crash looks like (app closes, app freezes, terminal locks up) is not known,
and no crash event was in hand when this was written.

Production, last 120 days, card payments at that location:

| Order type | Card payments | Tip recorded within 90s (customer display) |
|---|---|---|
| 1 card payment | 2,481 | 310 (12.5%) |
| 2+ card payments (split) | 239 | 4 (1.7%) |

Split portions are typically charged 9 to 30 seconds apart, so the next sale starts while the previous
guest's tip is still being chosen or applied.

## Causes found in the code

1. `CardPaymentView` unmounts as soon as `handlePaymentCompletion` switches the sheet view, but its
   async sale function keeps running and armed a tip timeout that nothing could cancel. The timer fired
   during the next guest's turn, wiped the shared tip slot and flipped the display to "Approved".
2. `useTipAdjustStore` held one slot. Any `clear()` or `finishInFlight()` erased whichever guest was
   captured at that moment.
3. Nothing spaced terminal transactions. The only wait was 1.5s before a tip adjust from the display.
   Tip adjust → next sale and tip → tip (Adjust Tips screen) went out back-to-back.
4. `useTerminalStatus` opened a second connection to Castles on every mount of the card screen, even
   while the shared service was connected. `terminalHealthCheck` already refused to do that.
5. Nothing made the cashier wait. Moving to the next guest cleared the tip screen.

**Not proven:** that these collisions are the crash. Two audits found hangs, rejected commands and tips
on the wrong payment, but no line of JS that must crash. The S1-0002 incident (two refunds sent
back-to-back over USB) took down the app and the terminal with the same shape.

**What would prove the diagnosis wrong:** the crash recurs and the `terminal.castles` breadcrumbs show
every command at least 1.5s after the previous transaction, with no second connection.

## Wave 1 — Castles is never hit back-to-back or by a second connection

- [x] `CASTLES_POST_TXN_SETTLE_MS = 1_500` in `types/castles.ts`
- [x] Settle gap in `services/terminals/castles-service.ts`: `_runTxnExclusive` waits then marks
      (`getTerminalData` waits but does not mark); `connect()`, `resetTerminalState()` and
      `escalatedReset()` wait; `_deferReturn2Idle` marks after the sale's close-out; the watchdog skips
      its ping inside the gap. The close-out `return2Idle` is not delayed.
- [x] `hooks/useTerminalStatus.ts`: no Castles probe while the shared service is connected. Retry and
      USB auto-reconnect disconnect the service first, so they still probe.
- [x] One `terminal.castles` Sentry breadcrumb per wire command (`sinceTxnMs`, `settleWaitedMs`);
      idle `getData` pings are left out

**Device checks** (Castles terminal, staging; USB and network if both are available):

- [ ] 3-way split, all card, charged as fast as possible: no freeze; at least 1500ms between a
      transaction and the next command in the log
- [ ] Adjust Tips screen, tips on 2 payments of a split, one submit: both succeed on the terminal and
      both staging rows get `tip_adjusted_at`
- [ ] Normal single card sale: time from Charge to terminal prompt unchanged
- [ ] Refund one item and void one payment: both complete
- [ ] Open the card screen while a tip adjust is running: no second connection in the log
- [ ] Unplug the terminal mid-split, replug: banner appears, then the next charge works

## Wave 2 — the tip step belongs to the app; the cashier waits, with Skip Tip

- [x] `stores/useTipAdjustStore.ts`: `expiresAt` on the capture; `clear(referenceId?)` and
      `finishInFlight(referenceId?)` only erase a matching capture; `clear` no longer releases the
      in-flight slot; `lastCompletedAt` removed (its one reader now watches `captured`)
- [x] `contexts/CFDProvider.tsx`: one effect owns the tip timeout; the runner releases the slot in a
      `finally` that covers everything after `startInFlight()`; `hasCustomerDisplay` on the context
- [x] `CardPaymentView`: the three `setTimeout` blocks and `tipAdjustTimeoutRef` removed; a view that
      is still mounted leaves `tip_adjusting` when its capture is gone from the store
- [x] `SplitPaymentSuccessView`: "Pay for next guest" waits while that guest's tip is pending, only
      when a customer display exists and the capture belongs to the open order; "Skip Tip" releases it

**Device checks** (customer display, staging):

- [ ] 3-way split, every guest tips: each payment row has its own tip and `tip_adjusted_at`
- [ ] Guest 1 tips, guest 2 skipped with Skip Tip, guest 3 tips: rows match
- [ ] Guest ignores the display: the button releases after the configured timeout
- [ ] Wait 30s+ after guest 1, then charge guest 2: display does not flip to "Approved" mid-sale
- [ ] App to background while a tip is applying, then back: the button releases
- [ ] Split with no customer display: cashier is never blocked
- [ ] Mixed split (card, then cash): the cash portion is never blocked
- [ ] Non-split card sale with tip on display: unchanged

## Wave 3 — same settle gap for Valor

- [ ] `VALOR_POST_TXN_SETTLE_MS = 1_500` in `types/valor.ts`
- [ ] `services/terminals/valor-service.ts`: `_runExclusive` waits; `processSale`, `processPreAuth`,
      `_runTxnCommand` (refund, void, tip adjust, completion) and `settleBatch` mark. Queries and
      `connect` do not. `cancelInFlight` is outside the mutex and is not delayed.

**Device checks:** the Wave 1 list on a VP550 or VP350. Last commit on the branch, so it can be
dropped on its own until that run is done.

## Not fixed here

- The final guest's tip: the cashier can still close the success screen before that guest tips. Same
  as non-split sales.
- Adjust Tips saves to the database only after every terminal adjust succeeds. A failure on payment 2
  leaves payment 1 adjusted on the terminal but not recorded.
- A Valor partial approval inside a split marks the whole portion paid
  (`CardPaymentView` partial branch with `usePaymentStore` split branch). Seen while reading, not tested.
- From the order-store audit, not verified: payment id stamped by array position after sync, and a
  pending split payment dropped when it matches another guest's amount.
