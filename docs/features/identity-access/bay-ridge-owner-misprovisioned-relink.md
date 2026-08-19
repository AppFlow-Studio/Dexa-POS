# Bay Ridge Owner Mis-Provisioned Relink

## Summary

- Ticket: `[DATA] Owner mis-provisioned (pos_only, no Clerk link) - "Member not found" on reactivate - Bay Ridge House of Wings`.
- Merchant: Bay Ridge House of Wings, `a7af715f-586f-4229-bb34-fc9947e0a474`.
- Affected owner: Moe Money, `moekadi68@gmail.com`.
- Staff profile: `bf0234fb-3270-49d9-b1a4-2600a8973752`.
- Existing Clerk user: `user_3D36TxS8Ysfd4Qefg0kLOeXvAOi`.
- This is data/admin remediation, not POS app code.

## Scope

- In scope:
  - Confirm current prod/staging data shape.
  - Confirm the POS repo does not own the Staff Directory reactivate path.
  - Provide read-only SQL checks and post-fix verification.
  - Track required Clerk org membership + Supabase relink evidence.
- Out of scope:
  - Running production mutations from this POS repo.
  - Website Staff Directory hardening.
  - Re-inviting the owner as a new user.
  - Changing POS authentication code.

## Plan

1. Verify local POS repo scope.
2. Confirm POS PIN login reads `location_members` + `staff_profiles`, not the dashboard Staff Directory member toggle path.
3. Confirm dashboard/store selection depends on `users -> members -> organizations`, so a missing `members` row blocks dashboard identity.
4. Add a production-safe read-only SQL checklist.
5. Document preferred repair path: Clerk org membership first, then staff profile relink.
6. Document fallback only for senior/prod-authorized direct DB repair.

## Progress

- Checked POS repo references.
- POS PIN login uses `location_members` joined to `staff_profiles`.
- POS store selection reads `users.members.organizations`, so the missing `members` row affects authenticated dashboard/store access and any app path that depends on Clerk membership.
- Staff Directory reactivate/deactivate is not in this POS repo.
- No POS code or migration is required for this ticket.
- Added this data remediation runbook for QA/evidence tracking.

## Verification

Read-only account state check:

```sql
SELECT
  sp.id AS staff_profile_id,
  sp.email,
  sp.account_type,
  sp.user_id AS staff_user_id,
  sp.is_active AS staff_active,
  sp.merchant_id,
  m.id AS member_id,
  m.user_id AS member_user_id,
  m.organization_id,
  m.staff_profile_id AS member_staff_profile_id,
  lm.id AS location_member_id,
  lm.location_id,
  lm.role_code,
  lm.is_active AS location_member_active,
  lm.user_id AS location_member_user_id,
  lm.staff_profile_id AS location_member_staff_profile_id
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
LEFT JOIN public.location_members lm
  ON lm.staff_profile_id = sp.id
WHERE sp.id = 'bf0234fb-3270-49d9-b1a4-2600a8973752'::uuid;
```

Merchant Clerk org lookup:

```sql
SELECT id, name, clerk_org_id
FROM public.merchants
WHERE id = 'a7af715f-586f-4229-bb34-fc9947e0a474'::uuid;
```

Existing user lookup:

```sql
SELECT id, email, first_name, last_name
FROM public.users
WHERE id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'
   OR lower(email) = lower('moekadi68@gmail.com');
```

Platform owner audit:

```sql
SELECT
  sp.account_type,
  CASE WHEN m.id IS NULL THEN false ELSE true END AS has_members_row,
  count(*) AS owners
FROM public.staff_profiles sp
JOIN public.location_members lm
  ON lm.staff_profile_id = sp.id
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
WHERE lm.role_code = 'merchant.owner'
GROUP BY sp.account_type, CASE WHEN m.id IS NULL THEN false ELSE true END
ORDER BY sp.account_type, has_members_row;
```

Post-fix expected account state:

```sql
SELECT
  sp.id,
  sp.account_type,
  sp.user_id,
  sp.is_active,
  m.id AS member_id,
  m.user_id AS member_user_id,
  m.organization_id,
  m.staff_profile_id AS member_staff_profile_id,
  lm.role_code,
  lm.is_active AS location_member_active
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
LEFT JOIN public.location_members lm
  ON lm.staff_profile_id = sp.id
WHERE sp.id = 'bf0234fb-3270-49d9-b1a4-2600a8973752'::uuid;
```

Expected:

- `sp.account_type = 'clerk'`.
- `sp.user_id = 'user_3D36TxS8Ysfd4Qefg0kLOeXvAOi'`.
- `sp.is_active = true`.
- A `members` row exists for the Clerk user and Bay Ridge Clerk organization.
- `members.staff_profile_id = 'bf0234fb-3270-49d9-b1a4-2600a8973752'`.
- `location_members.role_code = 'merchant.owner'`.
- Staff Directory deactivate/reactivate no longer returns `Member not found`.
- Owner can authenticate to the dashboard.

Post-fix orphan audit:

```sql
SELECT sp.account_type, count(*)
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
WHERE m.id IS NULL
GROUP BY sp.account_type
ORDER BY sp.account_type;
```

## Files

- `app/(auth)/pin-login.tsx` inspected only.
- `app/(auth)/store-select.tsx` inspected only.
- `docs/features/identity-access/bay-ridge-owner-misprovisioned-relink.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/quality/qa-tracking/in-progress-ticket-testing-sweep-2026-07-02.md`

## Open QA

- Senior/prod-authorized operator must add existing Clerk user to the Bay Ridge Clerk org as owner or confirm existing org membership.
- Confirm membership webhook creates or updates the `members` row.
- If webhook path is unavailable, senior/prod-authorized operator must perform a direct DB relink matching webhook output.
- Verify Staff Directory deactivate/reactivate.
- Verify owner dashboard login.
- Verify POS access expectations separately if the merchant expects this owner to have a POS PIN.
- Attach SQL before/after evidence and short dashboard recording before marking Done.
