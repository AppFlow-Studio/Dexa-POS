# Fix: Waitlist/Reservation Notify templates ignored by automated SMS

## Problem (confirmed — NOT previously fixed)
Editing a Notify message template had zero effect on the automated SMS. Root cause:
- Both send paths (`notify-waitlist-guest`, `notify-reservation-guest`) rendered the SMS body from a
  **hardcoded `renderTemplate()` switch**; they never read any merchant-editable store.
- Settings "SMS Template" (`WaitlistConfig.smsTemplate`) had **zero read sites** — a dead field.
- `autoSmsEnabled` was likewise dead.
- The ticket's `online_store_config.notification_prefs` is the online-order domain (status toggles, no
  bodies) — wrong store. Correct store: `locations.pos_config->'waitlist'`.

## Contract
- Store: `locations.pos_config.waitlist.messageTemplates` (jsonb map keyed by template_key). Blank/absent →
  code default. Legacy `smsTemplate` = `waitlist.tableReady` override.
- Tokens (whitelist; unknown left verbatim; trim + 500-cap): `{name}` `{store}` `{store_address}`
  + waitlist `{wait}` `{party_size}` + reservation `{party_size}` `{date}` `{time}` `{confirmation}`.
- Injection guarantee preserved: caller still only sends `template_key`; body assembled server-side.

## Decisions (locked)
Per-event templates (all 11 keys). Gate `autoSmsEnabled`.

---

## Review — Waves 1–3 implemented (2026-07-15)

- **Wave 1 ✅** `supabase/functions/_shared/notifyTemplates.ts` — pure, Deno+jest-safe resolver:
  defaults byte-identical to the legacy switch, whitelist `interpolate()`, blank→default fallback, legacy
  `smsTemplate`→`waitlist.tableReady`, custom passthrough, 500-cap.
  `__tests__/notifyTemplateResolve.test.ts` — **16/16 passing**.
- **Wave 2 ✅** Both edge functions import the shared resolver; `notify-waitlist-guest` select adds
  `party_size` + `pos_config`, `notify-reservation-guest` select adds `pos_config`; local hardcoded switches
  removed; merchant templates read from `location.pos_config.waitlist`.
  **Deploy = staging-first handoff (prod user-gated). No Deno locally → Deno typecheck at deploy.**
- **Wave 3 ✅** `WaitlistConfig.messageTemplates?: Record<string,string>` + default `{}`; `smsTemplate`
  marked `@deprecated`. Automated sends (`waitlist.added/cancelled`, `reservation.created/cancelled`) gated
  behind `autoSmsEnabled` in both stores via `isAutoSmsEnabled()`; manual composer sends untouched.
  `npx tsc --noEmit` → no new errors (3 remaining confirmed pre-existing via git-stash A/B).

## Remaining
- **Wave 4 (collab Haidar / Ali Awdi)** — replace the single "SMS Template" field in
  `app/(main)/settings/waitlist.tsx` with per-event fields (Waitlist + Reservation groups) writing
  `updateConfig('waitlist', { messageTemplates: { [key]: value } })`; defaults as placeholders + token
  legend. Until it ships, the existing single field already drives `waitlist.tableReady` via the legacy
  fallback, but the automated events have no editor surface yet.
- **Wave 5 ✅** — composer preview parity. `lib/notifyTemplates.ts` `renderTemplate(key, ctx, merchantTemplate?)`
  previews the merchant's saved template (client-fillable tokens `{name}/{store}/{date}/{time}` filled;
  others left literal — server fills them at send). `NotifyCustomerModal` reads
  `pos_config.waitlist.messageTemplates` (+ legacy `smsTemplate`→tableReady) and passes the override into
  the preview. Send behavior unchanged (preset sends still re-render server-side).

## Out of scope
Composer "edit-textarea-on-preset silently dropped" bug; `notification_prefs` online-order templates;
localization.

## Files touched
- `supabase/functions/_shared/notifyTemplates.ts` (new)
- `__tests__/notifyTemplateResolve.test.ts` (new)
- `supabase/functions/notify-waitlist-guest/index.ts`
- `supabase/functions/notify-reservation-guest/index.ts`
- `types/locationConfig.ts`
- `stores/useWaitlistStore.ts`
- `stores/useReservationStore.ts`

## Manual E2E (post-deploy)
1. Set `pos_config.waitlist.messageTemplates['waitlist.added']` (via editor or SQL) → add a waitlist guest
   with a phone → confirm received SMS matches the edited body + tokens.
2. Blank the template → confirm default body returns.
3. Toggle `autoSmsEnabled` off → add/cancel → confirm no SMS fires; manual Notify still works.
4. `custom` composer send still delivers the typed message.
