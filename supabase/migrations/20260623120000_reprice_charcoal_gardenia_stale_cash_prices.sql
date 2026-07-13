-- Re-price stale manual cash prices after Charcoal Gardenia was flipped to
-- 4% dual pricing.
--
-- Ticket: tasks/dual-pricing-stale-manual-cash-price-reprice.md
-- Scope: data-only correction for 4 known stale Milk Shakes rows.
-- Merchant: Charcoal Gardenia
--   merchant_id = 98a05710-e778-4b1a-81ac-389d5f8fbd47
--   location_id = 5afc6641-e98f-4c81-8d9d-d9691b5c28dc
--
-- Why NULL: cash price resolves as COALESCE(stored_cash_price, card price
-- * dual-pricing discount). Clearing the stale manual cash value lets the
-- existing 4% read-path calculation produce 7.68 for 7.99 card-priced items.

DO $$
DECLARE
  v_target_count integer;
  v_updated_count integer;
  v_remaining_known_stale_count integer;
BEGIN
  SELECT COUNT(*)
    INTO v_target_count
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

  IF v_target_count <> 4 THEN
    IF v_target_count = 0 THEN
      RAISE NOTICE
        'No matching Charcoal Gardenia stale Milk Shakes rows found. Skipping data correction in this environment.';
      RETURN;
    END IF;

    RAISE EXCEPTION
      'Expected 4 stale Charcoal Gardenia Milk Shakes rows, found %. Aborting.',
      v_target_count;
  END IF;

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
  UPDATE public.menu_items AS mi
     SET cash_price = NULL,
         updated_at = now(),
         version = COALESCE(mi.version, 0) + 1
    FROM target
   WHERE mi.id = target.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 4 THEN
    RAISE EXCEPTION
      'Expected to update 4 Charcoal Gardenia Milk Shakes rows, updated %. Aborting.',
      v_updated_count;
  END IF;

  SELECT COUNT(*)
    INTO v_remaining_known_stale_count
    FROM public.menu_items
   WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
     AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
     AND lower(name) IN (
       'coffee milkshake',
       'kitkat',
       'oreo milkshake',
       'pistachio milkshake'
     )
     AND cash_price IS NOT NULL
     AND cash_price >= price;

  IF v_remaining_known_stale_count <> 0 THEN
    RAISE EXCEPTION
      'Known stale Charcoal Gardenia Milk Shakes rows remain after correction: %.',
      v_remaining_known_stale_count;
  END IF;

  RAISE NOTICE
    'Corrected 4 stale Charcoal Gardenia Milk Shakes cash prices by clearing stored cash_price.';
END $$;

-- Post-run verification queries for Supabase SQL editor:
--
-- SELECT id, name, price, cash_price
-- FROM public.menu_items
-- WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
--   AND (location_id IS NULL OR location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc')
--   AND cash_price IS NOT NULL
--   AND cash_price >= price;
--
-- SELECT *
-- FROM public.location_menu_item_overrides
-- WHERE location_id = '5afc6641-e98f-4c81-8d9d-d9691b5c28dc'
--   AND custom_cash_price IS NOT NULL
--   AND custom_price IS NOT NULL
--   AND custom_cash_price >= custom_price;
--
-- SELECT *
-- FROM public.menu_item_menus
-- WHERE merchant_id = '98a05710-e778-4b1a-81ac-389d5f8fbd47'
--   AND custom_cash_price IS NOT NULL
--   AND custom_price IS NOT NULL
--   AND custom_cash_price >= custom_price;
