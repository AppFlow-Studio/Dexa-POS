# Feature Updates — June 16, 2026

A plain-language breakdown of what was built, what's in progress, and what's been
parked. Written for a non-technical audience (owners, managers, stakeholders).

Branch: `Table-And-Order-Syncing`. Covers work from June 15–16, 2026.

---

## ✅ Shipped (done & in the build)

### TO-GO item tagging
You can now mark an **individual item** on a check as "To-Go," even when the rest of
the order is dine-in. The tag travels with the item to the kitchen display so the
line cooks know that one item needs to be boxed rather than plated. This makes mixed
orders (e.g. a table that wants one entrée packed to take home) work cleanly.

### Reopen fix for split-payment orders
When an order had been **paid with more than one method** (e.g. part cash, part card)
and was later reopened, the totals could come back wrong. Reopening now recalculates
balances correctly so the remaining amount and item coverage are accurate. This
removes a source of register discrepancies at close.

### Card terminal auto-connect (Castles over USB)
The POS now **automatically finds and connects to the card terminal** when it's
plugged in over USB — no manual setup each shift. Includes Android device-detection
so the tablet recognizes the terminal on connect.
**Status note:** confirmed working, but currently slower than we want; speed-up is a
follow-up.

### Receipt setting — show payment method only
A new printer/receipt setting lets a location **print only the payment method**
(instead of fuller payment detail) on the customer receipt. Useful for businesses
that want a cleaner, more private receipt.

### Server-side ticket "stop time" (KDS timing)
Kitchen tickets now record their **completion/stop time on the server**, not just on
the device. This gives reliable, consistent prep-time and "time to ready" data across
stations, even if a single tablet is restarted or offline.

### Cross-station draft order filtering
In multi-station setups, **draft (unsent) orders started on one station no longer
clutter the other stations.** Each station sees the drafts relevant to it, which
keeps the order list clean when several servers are working at once.

### Quicker access to Settings from the KDS
Added an **easy path into Settings directly from the Kitchen Display**, so kitchen
staff/managers don't have to leave the KDS to make a quick adjustment.

### "You're already signed in" fix
Resolved the issue where the app would incorrectly block a user with an **"already
signed in"** message. Sign-in is now reliable.

---

## 🛠️ In progress

### Menu popup fix (Ali J) + Samir's notes
Working through a fix to the menu popup behavior, incorporating Samir's notes/feedback.

### QR-code ordering (Ali D — video review)
Reviewing the QR-code ordering flow (customers scan to order). Currently at the
video-review stage before implementation/sign-off.

### Order-out / delivery setup (with Mahmoud)
Standing up the **online ordering / delivery integration**. The **Grubhub account**
piece is intentionally being saved for last.

### Deeper performance pass
A larger performance/optimization effort. **The plan is already written — next step is
to apply it.** (See `docs/bad-wifi-deeper-optimizations.md` and `tasks/perf-handoff.md`.)

---

## ⏸️ Deferred (parked for later)

- **Reactivation failure + remove duplicate emails** — handle the case where customer/
  account reactivation fails, and de-duplicate email records.
- **Safe-delete terminals / cancel all operations** — let a terminal be removed safely
  and cancel any in-flight operations first.
- **Clear server-side stale drafts & empty orders (Ali J)** — clean up abandoned draft
  and empty orders left on the server.

---

## Notes
- All of the above is on the `Table-And-Order-Syncing` branch; no PR merges in this
  window — changes were committed directly.
- Two reference screenshots were attached to the original working notes (the
  "already signed in" issue and the ticket stop-time item) and are not reproduced here.
