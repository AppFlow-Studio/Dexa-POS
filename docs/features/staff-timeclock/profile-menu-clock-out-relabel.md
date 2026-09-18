# Profile menu: "Sign out" → "Clock out"

Ticket: relabel the destructive action in the SessionDock profile dropdown
(evidence: Samir Kadi, On Duty). Label only — behavior unchanged.

## Change

- [x] `components/SessionDock.tsx` — menu item label `Sign out` → `Clock out`
- [x] `components/SessionDock.tsx` — the PIN modal that same action opens was
      titled `Sign Out` while its own subtitle already read "Enter your PIN to
      clock out". Retitled `Clock Out` so the flow doesn't contradict itself
      mid-way. Still label-only.
- [x] Red destructive treatment kept as-is (`colors.danger` icon tile + text).
- [x] No behavior touched.

## What the action actually does (required confirmation)

Traced `handleLogout` in `components/SessionDock.tsx`:

1. `handleLogout` → opens the PIN modal (`isLogoutPinModalOpen`).
2. `handleLogoutPinConfirm` → stores the PIN, opens `CashTipDeclarationModal`.
3. `handleDeclarationComplete` →
   - `timeClock.declareCashTips(...)` (best-effort; queued if offline),
   - `timeClock.clockOut(pin, locationId, deviceId)` → `performAction("clock_out", …)`
     in `hooks/useTimeclock.ts`, which calls the Supabase timeclock RPC with
     `p_action_type: 'clock_out'`. **This ends the shift server-side.**
   - on success: `useTimeclockStore.clockOut(employeeId)`,
     `useEmployeeStore.clockOut(staff_id)`, and `store.clearState()` inside the
     hook clear the local shift/break state,
   - `replaceRoute("(auth)", "pin-login")`.

**Verdict: the new label is accurate.** The action ends the shift, and it does
NOT end the Clerk session — it returns to the PIN login screen, not the account
login screen. Clerk's `signOut()` is only called from
`components/auth/SignOutButton.tsx` (and the settings/session-logout path); the
SessionDock path never touches Clerk. `useEmployeeStore.signOut()`, which the
break-and-switch path calls, is a local staff-session reset (clears
`activeEmployeeId` / `loggedInEmployee`), not a Clerk sign-out — and this path
doesn't call it either.

**No follow-up ticket needed** for the label/behavior mismatch the ticket asked
us to check for. The failure mode it anticipated (ends the Clerk session without
ending the shift) is the opposite of what happens here.

Two notes that are out of scope but worth knowing:

- If the `clock_out` RPC fails with `END_BREAK_FIRST` / `ALREADY_ON_BREAK`, the
  handler calls `startBreak()` and returns — the user stays on the current
  screen, not clocked out. Any other RPC failure is only `console.warn`ed and
  the user is left where they are with no message.
- The cash-tip declaration modal sits between the PIN and the clock-out. If it
  is cancelled, no clock-out happens.
