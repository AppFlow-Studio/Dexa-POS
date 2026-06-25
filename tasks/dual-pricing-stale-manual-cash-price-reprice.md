# Re-price Stale Manual Cash Prices After Dual-Pricing Flip

## Summary

Store S2 / Charcoal Gardenia has a small set of menu items that were created while the store used manual pricing. After the store was flipped to 4% dual pricing, those rows kept stored manual `cash_price` values equal to `price`, so the automatic `card * 0.96` cash discount is bypassed.

This is a QA/data correction ticket, not a code defect. The website calculator and new-item auto-calculation are expected to be working.

Known stale items:

| Item | Current | Expected cash |
| --- | --- | --- |
| Coffee milkshake | `$7.99 / $7.99` | `$7.68` |
| Kitkat | `$7.99 / $7.99` | `$7.68` |
| Oreo Milkshake | `$7.99 / $7.99` | `$7.68` |
| pistachio milkshake | `$7.99 / $7.99` | `$7.68` |

## Scope

- Re-price stale Charcoal Gardenia items so cash resolves to the 4% discount.
- Verify the named Milk Shakes items on POS grid and web dashboard.
- Sweep all S2 categories: Drinks, Acai, Coffee, Combos, Food.
- Check stale stored prices in `menu_items`, `location_menu_item_overrides`, and `menu_item_menus`.
- Confirm a newly created item auto-calculates cash at `card * 0.96`, rounded up to the cent.

Out of scope:

- No calculator changes.
- No POS menu rendering changes.
- No changes to `calculate_order_dual_totals`, `calculate_order_totals_fast`, or pricing columns.
- No package or lockfile changes.

## Plan

1. Prefer website path: open each affected item in the web dashboard, clear/re-save pricing so the existing auto-calculator recomputes cash to `$7.68`.
2. If using DB correction instead, preview exact target rows first and only proceed if exactly the intended rows are returned.
3. Run merchant/location-scoped verification queries for base items and override layers.
4. Run unscoped spot-check queries to confirm the issue is not present elsewhere.
5. Create a temporary new item with card price and blank cash price, verify 4% cash auto-calc, then delete it.
6. Capture proof: POS Drinks -> Milk Shakes grid plus one web re-price flow.

## Progress

- Created this task record and added it to `tasks/ticket-log.md`.
- Added a guarded Supabase data migration for the 4 known stale Milk Shakes rows:
  - `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`
- Confirmed schema has the required tables and fields:
  - `menu_items.cash_price`
  - `location_menu_item_overrides.custom_cash_price`
  - `menu_item_menus.custom_cash_price`
- Found existing repo context identifying Charcoal Gardenia as merchant `98a05710-e778-4b1a-81ac-389d5f8fbd47` and location `5afc6641-e98f-4c81-8d9d-d9691b5c28dc`.
- Live execution is blocked in this workspace because no `.env*` file or loaded `EXPO_PUBLIC_SUPABASE_*` / `SUPABASE_*` environment variables are present, the linked pooler metadata has no password, and there is no authenticated web dashboard session available here.

## Verification

Targeted SQL preview before any DB-direct correction:

```sql
WITH target AS (
  SELECT id, merchant_id, location_id, name, price, cash_price
  FROM public.menu_items
  WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
    AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
    AND lower(name) IN (
      'coffee milkshake',
      'kitkat',
      'oreo milkshake',
      'pistachio milkshake'
    )
    AND price = 7.99
    AND cash_price = 7.99
)
SELECT
  id,
  name,
  price,
  cash_price,
  ceil(price * 0.96 * 100) / 100 AS expected_cash_price
FROM target
ORDER BY name;
```

DB-direct correction if the preview returns exactly the intended 4 rows is captured as a guarded migration:

- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`

Equivalent correction logic:

```sql
BEGIN;

DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT COUNT(*) INTO target_count
  FROM public.menu_items
  WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
    AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
    AND lower(name) IN (
      'coffee milkshake',
      'kitkat',
      'oreo milkshake',
      'pistachio milkshake'
    )
    AND price = 7.99
    AND cash_price = 7.99;

  IF target_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 stale Milk Shakes rows, found %. Aborting.', target_count;
  END IF;
END $$;

WITH target AS (
  SELECT id
  FROM public.menu_items
  WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
    AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
    AND lower(name) IN (
      'coffee milkshake',
      'kitkat',
      'oreo milkshake',
      'pistachio milkshake'
    )
    AND price = 7.99
    AND cash_price = 7.99
)
UPDATE public.menu_items mi
SET cash_price = NULL,
    updated_at = now(),
    version = version + 1
WHERE mi.id IN (SELECT id FROM target)
RETURNING id, name, price, cash_price;

COMMIT;
```

Merchant/location-scoped stale base-item check:

```sql
SELECT id, name, price, cash_price
FROM public.menu_items
WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
  AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
  AND cash_price IS NOT NULL
  AND cash_price >= price;
```

Merchant/location-scoped override checks:

```sql
SELECT *
FROM public.location_menu_item_overrides
WHERE location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'
  AND custom_cash_price IS NOT NULL
  AND custom_price IS NOT NULL
  AND custom_cash_price >= custom_price;

SELECT *
FROM public.menu_item_menus
WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
  AND custom_cash_price IS NOT NULL
  AND custom_price IS NOT NULL
  AND custom_cash_price >= custom_price;
```

Unscoped stale-price spot checks:

```sql
SELECT id, merchant_id, location_id, name, price, cash_price
FROM public.menu_items
WHERE cash_price IS NOT NULL
  AND cash_price >= price;

SELECT *
FROM public.location_menu_item_overrides
WHERE custom_cash_price IS NOT NULL
  AND custom_price IS NOT NULL
  AND custom_cash_price >= custom_price;

SELECT *
FROM public.menu_item_menus
WHERE custom_cash_price IS NOT NULL
  AND custom_price IS NOT NULL
  AND custom_cash_price >= custom_price;
```

Manual QA still required:

- POS: Drinks -> Milk Shakes shows the 4 named items as `$7.99 / $7.68`.
- Web dashboard: each affected item shows cash price `$7.68`.
- Full category sweep across Drinks, Acai, Coffee, Combos, Food has no cash price equal to or greater than card price.
- New test item auto-calculates cash at 4% off when cash is left blank, then test item is deleted.
- Screen recording attached before Done.
- Abubeckr or Temur signs off before Done.

## Files

- `tasks/dual-pricing-stale-manual-cash-price-reprice.md`
- `tasks/ticket-log.md`
- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`

## Open QA

- Migration not executed from this workspace due missing DB/web-dashboard credentials. Run it in Supabase, then run the verification queries in this file.
- Physical POS/web verification and screen recording still need to be completed after the data correction.
