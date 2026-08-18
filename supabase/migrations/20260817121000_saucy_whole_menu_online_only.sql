-- Saucy's Whole Menu is the primary online aggregate. Keep it online while
-- removing it from POS and kiosk menu navigation.

UPDATE public.menus
   SET available_channels = '["online"]'::jsonb,
       updated_at = now()
 WHERE id = 'd98830ee-bf56-4200-82e2-7ad221dc2048'::uuid
   AND merchant_id = '33b2baaf-ae79-4e02-a489-52163a447b57'::uuid;
