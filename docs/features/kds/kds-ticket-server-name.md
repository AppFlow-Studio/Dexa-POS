# POS-KDS Show Server / Creator On KDS Tickets

## Summary

KDS tickets did not show which staff member placed the order. The source data already exists on `orders.created_by_staff_id` and `orders.assigned_server_id`, and the display setting already exists on `kds_displays.show_server_name`, but `get_kds_tickets_v2` did not return any server/creator fields for the KDS UI to render.

Expected behavior:

- POS-created orders show the staff member who rang in the order.
- The displayed staff identity is gated server-side by `kds_displays.show_server_name`.
- Online / third-party orders with no staff return `server_name = null`, so the existing source/platform badge remains the fallback.

## Scope

In scope:

- `get_kds_tickets_v2` RPC payload.
- KDS ticket TypeScript model.
- KDS ticket header rendering.
- Ticket merge/reference-reuse behavior so server-name changes trigger a UI update.

Out of scope:

- `get_kds_tickets` v1.
- KDS routing/status behavior.
- Void/refund notice behavior.
- Changing order creator/server assignment semantics beyond the agreed priority.

## Plan

1. Add a Supabase migration that fully replaces `get_kds_tickets_v2` from the current function body.
2. Resolve `v_show_server_name` once from `kds_displays.show_server_name`, defaulting to `true`.
3. Join `staff_profiles` on `COALESCE(o.created_by_staff_id, o.assigned_server_id)`.
4. Add top-level `server_id` and `server_name` to each ticket JSON object.
5. Add optional `server_id` / `server_name` to `KDSTicket`.
6. Render `Server: <name>` in the KDS ticket header only when `ticket.server_name` is non-empty.
7. Preserve server fields across broadcast-built tickets that omit server fields, while still allowing an RPC `server_name: null` to hide the field when the display setting is off.

## Progress

- Added migration:
  - `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- Added `server_id` and `server_name` to `types/kds.ts`.
- Updated KDS ticket normalization/equality in `stores/useKDSStore.ts` so newly returned server names are not ignored by ticket reference reuse.
- Updated active and done KDS card headers in `app/(main)/kds.tsx`.
- Updated `tasks/ticket-log.md`.
- Updated `tasks/pos-ticket-senior-summary-2026-06-27.md`.
- Targeted KDS Jest checks passed on 2026-06-29.

## Verification

Targeted automated checks passed:

```powershell
npx jest --runTestsByPath __tests__/kdsTimer.test.ts
npx jest --runTestsByPath __tests__/kdsAutomation.test.ts
```

Manual QA still required:

- Apply migration on staging.
- Create a POS order from a logged-in staff member and send it to KDS.
- Confirm the KDS ticket header shows `Server: <staff name>`.
- Toggle `show_server_name` off for the display and confirm the server line hides.
- Confirm an online / third-party order with no staff shows the existing source/platform fallback and no blank server line.
- Confirm void/refund notices, KDS statuses, and ready/done behavior still work.

## Files

- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- `types/kds.ts`
- `stores/useKDSStore.ts`
- `app/(main)/kds.tsx`
- `tasks/kds-ticket-server-name.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Open QA

- Migration must be run on staging, then prod according to normal Supabase flow.
- Staging screen recording needed:
  - POS-created order shows staff name.
  - Online/no-staff order shows source/platform fallback.
  - `show_server_name = false` hides the field.
