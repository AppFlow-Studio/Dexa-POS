# Cash tips: allow `$0` confirm, collapse to one control

Ticket: the Confirm button on the cash-tip numpad screen was gated until a
value was keyed, so the default `$0` couldn't be submitted as-is. `$0.00` is a
valid declaration — the backend only rejects negatives.

## Change

`components/timeclock/CashTipDeclarationModal.tsx`, input step only:

- [x] Dropped `disabled={declaredAmount <= 0}` and the muted-teal disabled fill.
      Confirm is live on the default value and carries `$0.00` through the
      confirm step to `onComplete(0)`.
- [x] Removed the `Declare $0` button and `handleDeclareZero`; `Confirm $X` is
      now the single, full-width control.
- [x] No change to the summary or confirm steps, the numpad, the >$1000
      large-amount guard, or any submit path.

Negative amounts remain impossible from this screen — the numpad has no minus
key and the input regex is `^\d*\.?\d{0,2}$`.

## Why one control (recorded per the ticket)

`Declare $0` and `Confirm $0` were two routes to a byte-identical outcome.
`handleDeclareZero` was `setRawInput("0"); setStep("confirm")` — exactly what
`handleNext` does when the input is already `0`, minus the large-amount guard
that can't fire at zero. There was no distinct behavior to preserve:

- Not a skip: both landed on the same confirm step, requiring the same
  "Clock Out & Submit" press.
- Not a reset: with Confirm live at `$0`, a user who mistyped clears with `⌫`,
  which they already had to use for any other correction.
- Not a different record: both call `onComplete(0)` → the same
  `declare_cash_tips_for_shift` RPC with `p_amount: 0`.

Kept `Confirm $X` rather than `Declare $0` because it's the one control that
covers every amount, and its label reflects the live value. The red
destructive-ish treatment on `Declare $0` was also misleading — declaring zero
is a normal outcome, not a destructive one. The helper text above the buttons
("Declaring $0 is fine if you received no cash tips") now describes something
the primary button actually does.

## Verification status — blocked, but not risk-bearing

The ticket flags that this can't be verified until the cash-tip RPC ticket
lands, and warns that enabling the button turns a blocked failure into a silent
one. Tracing the path, that concern does not apply to this change:

**`$0` was already submittable before this change, via `Declare $0`.** That
button set the input to `0` and ran the identical submit path. So any
silent-failure-at-`$0` behavior already existed in production; this change adds
no new failure mode, it only removes a redundant second door to the same room.
The ticket's premise ("the default `$0` cannot be submitted as-is") was true of
the Confirm *button*, not of the modal.

For the record, the silent part is real and lives outside this component:

- `hooks/useTimeclock.ts` `declareCashTips` — a network-ish error queues the
  declaration for retry and reports `{ success: true, queued: true }`; any other
  error (i.e. an RPC rejection) is rethrown.
- `components/SessionDock.tsx` `handleDeclarationComplete` — wraps that call in
  `try/catch`, `console.warn`s, and **proceeds to clock out regardless**. The
  employee sees nothing.

So an RPC failure loses the declaration while the shift still ends. That is the
RPC ticket's territory, plus arguably a follow-up for surfacing the failure —
neither is touched here.

**Not verified:** that the RPC succeeds at `$0` end-to-end. The RPC body isn't
in this repo (no migration defines `declare_cash_tips_for_shift`; it's only
referenced through `supabase.rpc(...)` and typed in `database.types.ts`), and
the "only rejects negatives" contract comes from the ticket, not from anything
readable here. A prior audit
(`docs/engineering/database/purchase-order-numbering.md`) confirms the function
is PRESENT in both staging and prod. Re-test once the RPC ticket lands:

1. Clock out with the numpad untouched → Confirm `$0` → Clock Out & Submit.
2. Assert `staff_shifts.declared_cash_tips = 0` and `tips_declared_at` set for
   that shift.
3. Repeat offline → assert the action lands in the timeclock offline queue and
   drains to the same result.
