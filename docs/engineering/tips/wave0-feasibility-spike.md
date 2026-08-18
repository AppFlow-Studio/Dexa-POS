# Tip Management — Wave 0 feasibility + contract spike

This is the **hard gate** before building any tip-config **write** UI on the POS
(pool/rule create/edit/delete). Run it against **staging**
(`dfwqakoyittmrwbqvxgw`) and paste the results into the "Contract note" at the
bottom. The read-only Tip Management screen already ships and is unaffected.

Why this exists: the POS authenticates as a **Clerk-user JWT + anon key**, not a
service role. The website almost certainly writes these tables with a service
role that bypasses RLS. There is no evidence a POS-token write to the tip tables
has ever succeeded — only reads. If RLS forbids POS writes, the "full management
on the POS" scope needs a **website-team backend change** first.

> How to run the SQL: from the `dexapos-website` repo,
> `supabase db query --linked --file <path>` (CLI is linked to staging), or paste
> each block into the SQL editor. These are all read-only introspection queries.
> Replace `:loc` with a real staging `location_id`.

---

## 0a — RLS: can a POS token write these tables? (SCOPE-KILLER — do first)

Two parts. First, inspect the policies (service-role CLI is fine here):

```sql
-- Is RLS even enabled, and is it forced?
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('tip_pool_configs','tip_out_rules','tip_pool_role_shares');

-- What policies exist, for which commands/roles, and their predicates?
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE tablename IN ('tip_pool_configs','tip_out_rules','tip_pool_role_shares')
ORDER BY tablename, cmd, policyname;
```

Interpretation:
- If there are **no INSERT/UPDATE policies** for the authenticated role (only
  SELECT), POS writes are blocked → **write scope needs website-team policies**.
- Look for predicates like `can_manage_pos_config_for_location(location_id)` —
  if present, confirm a POS manager's context satisfies them.

Second, the **real** test — attempt a write with an actual POS Clerk token
(the CLI/service role will NOT surface an RLS denial the POS would hit). Grab a
POS Clerk JWT from a staging dev build (the token used by the app's supabase
client), then:

```bash
# Expect 201 = writes allowed; 401/403/42501 "insufficient privilege" = blocked.
curl -i -X POST "$STAGING_URL/rest/v1/tip_pool_configs" \
  -H "apikey: $STAGING_ANON_KEY" \
  -H "Authorization: Bearer $POS_CLERK_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"location_id":"<staging_loc>","merchant_id":"<staging_merchant>","name":"__rls_probe__","tip_source":"charged_tips","distribution_method":"equal_split","source_percentage":0,"contributing_role_codes":[]}'
# If it inserts, delete the probe row afterwards (or soft-delete is_active=false).
```

**Result → GO / NO-GO.** NO-GO ⇒ stop; open a website-repo ticket for POS-scoped
write policies before Waves 2–3.

---

## 0b — Role source + literal role codes

```sql
-- The global roles catalog (NOT scoped to merchant/location).
SELECT code, name, organization_type, level, is_system_role
FROM roles ORDER BY code;

-- Roles actually referenced by tip config at a location.
SELECT DISTINCT from_role_code AS role_code FROM tip_out_rules WHERE location_id = ':loc'
UNION SELECT DISTINCT to_role_code FROM tip_out_rules WHERE location_id = ':loc'
UNION SELECT DISTINCT s.role_code
  FROM tip_pool_role_shares s
  JOIN tip_pool_configs c ON c.id = s.tip_pool_config_id
  WHERE c.location_id = ':loc';

-- The selectable set for pickers: roles assigned at the location.
SELECT DISTINCT lm.role_code, r.name
FROM location_members lm
LEFT JOIN roles r ON r.code = lm.role_code
WHERE lm.location_id = ':loc' AND lm.is_active = true
ORDER BY 1;
```

Confirm: (1) `location_members.role_code` joined to `roles` is the right picker
source, and (2) the **literal** `roles.code` strings (bare `bartender` vs
prefixed `merchant.bartender`) — the editor's picker values must match these
exactly.

---

## 0c — Enum/value + unique-constraint confirmation

```sql
-- CHECK constraints (authoritative allowed values, if expressed as checks).
SELECT con.conrelid::regclass::text AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
WHERE con.conrelid::regclass::text IN
      ('tip_pool_configs','tip_out_rules','tip_pool_role_shares')
  AND con.contype = 'c'
ORDER BY 1,2;

-- Defaults + nullability for the enum-ish / required columns.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('tip_pool_configs','tip_out_rules','tip_pool_role_shares')
  AND column_name IN ('distribution_method','tip_source','policy_interval',
                      'priority','tip_out_type','effective_date','end_date')
ORDER BY table_name, column_name;

-- Values actually in use (corroboration when there are no CHECK constraints).
SELECT 'distribution_method' f, distribution_method v, count(*) FROM tip_pool_configs GROUP BY 2
UNION ALL SELECT 'tip_source', tip_source, count(*) FROM tip_pool_configs GROUP BY 2
UNION ALL SELECT 'policy_interval', policy_interval, count(*) FROM tip_pool_configs GROUP BY 2
UNION ALL SELECT 'priority', priority::text, count(*) FROM tip_pool_configs GROUP BY 2
UNION ALL SELECT 'tip_out_type', tip_out_type, count(*) FROM tip_out_rules GROUP BY 2
ORDER BY 1,2;

-- The unique constraint setRoleShare's upsert onConflict depends on.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'tip_pool_role_shares'::regclass AND contype IN ('u','p');
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'tip_pool_role_shares' AND indexdef ILIKE '%unique%';
```

Especially confirm the **uncorroborated** values (in-repo tests only prove
`equal_split`/`hours_weighted`, `charged_tips`, and the three `tip_out_type`s):
`distribution_method` = `percentage`/`points`? `tip_source` = `all_tips`/`cash_only`?
every `policy_interval` value? `priority` range/default? And that a unique index
on `(tip_pool_config_id, role_code)` exists.

---

## 0d — Distribution semantics (underpins the mid-day safety story)

```sql
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname IN ('calculate_tip_distribution_v2','validate_tip_pool_config',
                  'preview_tip_distribution');
```

From the source, answer:
- Does `calculate_tip_distribution_v2` **write `config_snapshot`**, or re-read live
  config each run? (This is the preview→approve hole: preview persists nothing, so
  an edit before approve silently changes the payout.)
- How are `effective_date`/`end_date` and `priority` resolved among overlapping
  active pools?
- What is `validate_tip_pool_config`'s return shape (so the editor can surface it)?

---

## Contract note (fill in, then unblock Waves 2–3)

| Item | Finding |
|---|---|
| **0a POS-token write** | GO / NO-GO — … |
| RLS policies present | … |
| **0b** picker source | `location_members`→`roles` confirmed? Y/N |
| literal role codes | e.g. `server`, `busser`, … (bare or prefixed?) |
| **0c** `distribution_method` allowed | … |
| `tip_source` allowed | … |
| `policy_interval` allowed + default | … |
| `priority` range + default | … |
| `tip_out_type` allowed | … |
| unique `(config_id, role_code)` | exists? Y/N (name: …) |
| **0d** snapshot vs live config | … |
| effective-date/priority resolution | … |
| `validate_tip_pool_config` returns | … |
| staging↔prod parity | confirmed? Y/N |

Once GO + the values are filled in, Wave 2 (service hardening) and Wave 3
(editors, behind `EXPO_PUBLIC_TIP_MANAGEMENT_WRITE`) can proceed against the
confirmed contract.
