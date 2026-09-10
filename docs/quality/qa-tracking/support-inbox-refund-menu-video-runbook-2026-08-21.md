# POS Support, Refund, and Menu QA Video Runbook

## Purpose

This runbook covers the POS work that should be tested in one tablet recording:

- Support inbox `DEXA-00017` items 1 through 5.
- Refund receipt entry, successful refund, automatic print, and reprint.
- Per-channel menu visibility for POS, kiosk, and online ordering.

It also records which support-inbox requests are not complete in this repo so
they are not incorrectly marked Done during the video.

## Status Matrix

| Item | Owner | Current status | Migration |
| --- | --- | --- | --- |
| Auto Create Order survives app updates | POS + shared config | Implemented; update-over-install tablet QA pending | `utils/supabase/migrations/add_pos_config_ordering_security.sql` backfills JSONB defaults |
| Required modifier inline red error | POS | Implemented; 6 focused tests pass; tablet QA pending | None |
| Always Require PIN | POS + shared config | Implemented; repeat-access tablet QA pending | Same ordering/security backfill |
| Rename Sign out to Clock out | POS | Implemented; tablet QA pending | None |
| Confirm default cash tips at `$0.00` | POS | Implemented; RPC/tablet QA pending | None in this repo |
| CFD text-size/display options | Product + POS/CFD + website | Not implemented; exact option and storage contract is not defined | Not yet defined |
| Tip Pooling Active Tip Rules authoring | Website | Not implemented on website; POS is intentionally read-only and already consumes/distributes active rules | Depends on website implementation; existing rule tables are consumed |
| Refund physical receipt | POS + shared DB | POS code complete; cold-open feedback added; physical printer QA and website delivery remain | `supabase/migrations/20260818120000_refund_receipt_foundation.sql` |
| Menu channel visibility | POS/kiosk + website + shared DB | POS/kiosk and migration implemented; website controls and online enforcement remain | `utils/supabase/migrations/20260821120000_menu_channel_visibility.sql` |

## Environment Setup

1. Use a non-production merchant/location with editable menus, at least one
   required modifier group, an active staff shift, and a refundable test order.
2. Verify the tablet build points to the same Supabase environment as the web
   dashboard used during the recording.
3. Apply the required migrations before testing their dependent features.
4. Use a staff account that can open locked menus and process refunds.
5. Connect the target physical printer. Run the final refund segment once on a
   Star Micronics printer and once on a Landi built-in thermal printer.
6. Use a disposable low-value test transaction. Do not refund a live merchant
   transaction merely for evidence.
7. On POS, use `Refresh Data` after every dashboard menu-setting change.

## Supabase Prerequisites

Confirm these migrations exist in the environment:

```text
utils/supabase/migrations/add_pos_config_ordering_security.sql
supabase/migrations/20260818120000_refund_receipt_foundation.sql
utils/supabase/migrations/20260821120000_menu_channel_visibility.sql
```

The menu migration must be deployed before the website writes channel flags or
the POS can receive `channel_visibility` from `get_pos_bootstrap_v2`.

## Video Sequence

Record continuously if practical. Before each segment, briefly show the setting
or data used, then show the POS result.

### 1. Auto Create Order

1. In POS Settings > Order Line, enable Auto Create Order.
2. Return to order entry with no active draft order.
3. Tap a menu item and confirm a new order is created automatically and the item
   is added.
4. Close/relaunch the app and repeat; the setting must remain enabled.
5. For the ticket's strict update-survival proof, install the test build over the
   existing app without clearing data, reopen it, and repeat the item tap.
6. Disable Auto Create Order, refresh/relaunch, and confirm tapping the item no
   longer silently loses the intended setting behavior.

Expected: `locations.pos_config.ordering.autoCreateOrder` is the source of truth;
an app update does not reset it to a device-local default.

### 2. Required Modifier Highlight

1. Open an item with a required modifier group.
2. Do not choose a required option and attempt to add/confirm the item.
3. Record the required group title/badge/border/helper text turning red inline.
4. Select a valid option and record the red state clearing immediately.
5. Reopen the item and confirm no stale error is carried over.

Expected: the missing section itself is obvious; validation is not communicated
only by a top-right toast.

### 3. Always Require PIN

1. In POS Settings > Order Line, set Manager Override Timeout to Always Require
   PIN.
2. Open a locked menu or category, enter a valid manager PIN, and confirm access.
3. Navigate to an unlocked menu/category so the temporary selection grant ends.
4. Return to the same locked resource immediately.
5. Record that the manager PIN prompt appears again.
6. Optionally set a five-minute timeout, unlock once, revisit within five
   minutes, and confirm the configured timed session is honored.

Expected: Always Require PIN does not leave a permanent menu/category grant.

### 4. Clock Out Label

1. Open the active employee profile menu.
2. Record that the destructive action says `Clock out`, not `Sign out`.
3. Tap it and record that the PIN dialog title also says `Clock Out`.
4. Cancel unless continuing directly into the cash-tip segment.

Expected: this flow ends the staff shift and returns to PIN login; it is not the
full Clerk account logout action.

### 5. Default `$0.00` Cash-Tip Confirmation

1. From the Clock Out flow, enter the employee PIN.
2. Leave the cash-tip numpad untouched at `$0.00`.
3. Record that the primary Confirm control is enabled.
4. Confirm `$0.00`, then press the final Clock Out & Submit action.
5. Confirm the user returns to PIN login and the shift is completed.

Supabase verification for that shift:

```sql
select id, status, clock_out_time, declared_cash_tips, tips_declared_at
from public.staff_shifts
where staff_profile_id = '<tested_staff_profile_id>'
order by clock_in_time desc
limit 1;
```

Expected: completed shift, `declared_cash_tips = 0`, and a non-null
`tips_declared_at`. If the declaration RPC fails, do not mark this item Done.

### 6. Refund Flow and Receipt

1. Open Previous Orders and choose a paid test order.
2. Open the overflow menu and tap Process Refund.
3. On the first cold open, confirm the UI immediately shows `Opening payment
   details...` until the refund sheet is ready; it must not appear unresponsive.
4. Process a valid full or partial refund through the configured test terminal.
5. Confirm exactly one refund receipt auto-queues and prints after the
   authoritative success response.
6. Reopen the order, open its refund history, and use Reprint.
7. Confirm the reprint is labeled `REPRINT` and has refund/original receipt
   identity, refunded amount, tender/processor proof when applicable, and no
   recalculated monetary values.
8. Repeat physical output on Star Micronics and Landi built-in thermal.

Expected: approval data is persisted, print happens only after successful
refund completion, and historical completed refunds can be reprinted.

Website work still required before the cross-repo refund ticket is fully Done:
hosted public refund receipt, email/SMS delivery, and refund-template dashboard
support if exposed.

### 7. Menu Channel Visibility

Use an ordinary test menu. `Whole Menu` is not generated by POS; if the merchant
has one, it is an ordinary dashboard-created menu with categories assigned to
it.

1. In the website menu editor for the selected location, leave the menu Active
   but turn off only `POS` visibility.
2. On POS press Refresh Data, reopen Order Line, and confirm the menu is absent
   from tabs, the menu popup, defaults, and search.
3. Confirm the menu remains visible on kiosk and online when their switches stay
   enabled.
4. Turn POS back on and kiosk off. Refresh POS and kiosk data.
5. Confirm the menu returns to POS but disappears from every kiosk template.
6. Turn kiosk back on and online off.
7. Confirm the first-party online storefront/OrderOut path does not publish or
   serve the menu, while POS and kiosk still show it.
8. Restore all switches and confirm the menu returns on all intended surfaces.

Expected: Active/schedule/location assignment still controls eligibility; the
three channel switches independently hide an otherwise eligible menu.

## Not Ready for the Video

### CFD Display Settings

The repo already supports pairing, right-panel layout, images, and price display
mode. It does not have a persisted text-size option shared across built-in and
external CFD clients. The request says "text sizes and similar settings" but
does not define:

- Which screens and text roles scale.
- Allowed values or min/max bounds.
- Whether controls apply per location or per station.
- Whether built-in WebView and external CFD must match exactly.
- Whether this is typography-only or whole-layout scaling.

Do not mark this item Done or include it as completed evidence until product and
the website owner agree on that contract.

### Tip Pooling Active Tip Rules

POS Settings > Tips Management is intentionally read-only. The POS loads active
tip rules and executes End of Day distribution, but rule creation, activation,
deactivation, and role percentages belong to the website dashboard. After the
website implementation lands, verify that POS refreshes and applies the active
configuration without exposing write controls on the tablet.

## Website Handoff

The website owner must complete:

1. Menu controls: location-scoped `POS`, `Kiosk`, and `Online Ordering` switches
   backed by `location_menus.is_visible_on_pos`,
   `location_menus.is_visible_on_kiosk`, and
   `location_menus.is_visible_online`; enforce the online flag in hosted and
   OrderOut read/publish paths.
2. Tip pooling: manager UI to create/edit rules, toggle active state, and assign
   role percentages using the existing tip-rule/config/share tables, with
   validation, permissions, query invalidation, and audit logging.
3. Refund delivery: hosted public refund receipt plus email/SMS delivery using
   `reversals.receipt_token` and `receipt_sends.reversal_id`.
4. CFD: first obtain the missing product contract. Do not invent a broad text
   scale that can clip payment, loyalty, receipt, or signature screens.

## Completion Gate

The POS portions can be signed off when segments 1 through 7 pass, excluding the
two explicitly incomplete support items. The combined support ticket itself
must remain open for CFD settings and website tip-rule authoring unless those
requests are split into separate tickets.
