# Fix: Waitlist/Reservation Notify templates ignored by automated SMS

## Problem (confirmed — NOT previously fixed)
Editing a Notify message template has zero effect on the automated SMS. Root cause proven:
- Both send paths (`supabase/functions/notify-waitlist-guest`, `notify-reservation-guest`) render the
  SMS body from a **hardcoded `renderTemplate()` switch** keyed by `template_key`. They never read any
  merchant-editable store.
- The Settings "SMS Template" field (`WaitlistConfig.smsTemplate`) has **zero read sites** outside the
  editor — it's a dead field.
- `autoSmsEnabled` is likewise dead — automated sends fire regardless.
- The ticket's referenced store `online_store_config.notification_prefs` is the **online-order** domain
  (holds `sms_on_status` toggles, no bodies) — wrong store for waitlist/reservation. The correct store is
  `locations.pos_config->'waitlist'` (written via `update_location_pos_config`, broadcast to stations).

## Decisions (locked)
- **Per-event templates** (all 11 keys editable), not a single field.
- **Gate `autoSmsEnabled`** so automated sends honor the toggle.

## Canonical contract
- Store: `locations.pos_config->'waitlist'->'messageTemplates'` (jsonb map, keyed by template_key).
  Absent/blank value → fall back to code default (back-compat: existing merchants unchanged).
- Placeholder tokens (whitelist only; unknown `{...}` left verbatim; result trimmed + 500-char cap):
  - Shared: `{name}`, `{store}`, `{store_address}`
  - Waitlist: `{wait}`, `{party_size}`
  - Reservation: `{party_size}`, `{date}`, `{time}`, `{confirmation}`
- Injection guarantee preserved: caller still only sends `template_key`; body is assembled server-side
  from merchant-owned config + the RLS-read row. `custom` path unchanged.

---

## Wave 1 — Shared resolver (pure, Deno- + jest-safe)
- [ ] New `supabase/functions/_shared/notifyTemplates.ts` — no `serve`/`createClient`, pure strings:
  - `WAITLIST_DEFAULT_TEMPLATES` / `RESERVATION_DEFAULT_TEMPLATES` (token-ized versions of the current
    hardcoded strings — identical output when no merchant override).
  - `interpolate(template, tokens)` — whitelist substitution, trim, 500 cap.
  - `resolveMessage(templateKey, tokens, merchantTemplates, defaults, customMessage)` — custom passthrough;
    else merchant template (non-blank) → interpolate; else default → interpolate. Legacy `smsTemplate`
    honored as fallback for `waitlist.tableReady`.
- **Test:** `__tests__/notifyTemplateResolve.test.ts` — default parity, merchant override, blank→default,
  unknown-token verbatim, length cap, custom passthrough.

## Wave 2 — Send path (core, Temur)
- [ ] `notify-waitlist-guest/index.ts`: add `party_size` to waitlist select + `pos_config` to locations
  select; replace inline `renderTemplate` with `resolveMessage(...)` from `_shared`.
- [ ] `notify-reservation-guest/index.ts`: add `pos_config` to locations select; same swap.
- [ ] Deploy edge functions to **staging first**; prod deploy is user-gated (like migrations).
- **Test:** trigger each event with a merchant override set vs unset; confirm body + `record_*_sms_result`
  rows. Verify `custom` still works.

## Wave 3 — Config schema + autoSms gate (client)
- [ ] `types/locationConfig.ts`: add `messageTemplates?: Partial<Record<NotifyTemplateKey, string>>` to
  `WaitlistConfig`; keep `smsTemplate` (legacy alias for `waitlist.tableReady`). Default `messageTemplates: {}`.
- [ ] `stores/useWaitlistStore.ts` / `stores/useReservationStore.ts`: before automated sends
  (`waitlist.added`, `waitlist.cancelled`, `reservation.created`, `reservation.cancelled`) check
  `useLocationConfigStore.getState().config.waitlist.autoSmsEnabled`; skip when false. Manual composer
  sends stay unaffected.
- **Test:** structural/unit — autoSmsEnabled=false suppresses automated send; manual notify still fires.

## Wave 4 — Editor write-side (collab: Haidar / Ali Awdi)
- [ ] `app/(main)/settings/waitlist.tsx`: replace single "SMS Template" field with per-event editor
  (Waitlist group + Reservation group). Each writes
  `updateConfig('waitlist', { messageTemplates: { [key]: value } })`. Show code default as placeholder
  (blank = default), plus a token legend. `autoSmsEnabled` toggle stays.

## Wave 5 — Composer preview parity (follow-up, optional)
- [ ] `lib/notifyTemplates.ts` + `NotifyCustomerModal`: render preset previews from merchant templates so
  host sees what the guest will receive. Server remains source of truth.

---

## Out of scope / does NOT solve
- Composer "edit textarea while a preset chip is selected → edit silently dropped" (needs auto-switch to
  `custom`); separate bug.
- `online_store_config.notification_prefs` online-order templates (different domain).
- Localization / multi-language templates.

## Rollout notes
- No DB DDL needed (`pos_config` is freeform jsonb) → no SQL migration, no staging/prod SQL step.
- Order-independent: send path falls back to defaults, so editor and edge deploys can ship in any order.
- Edge reads DB at send time → no station-cache staleness.

## Review
_(to be filled in after implementation)_
