-- Backfill existing pre-auth payments missing merchant_id/location_id
-- Run this once in the Supabase SQL editor after deploying the updated functions

UPDATE order_payments op
SET
  merchant_id = o.merchant_id,
  location_id = o.location_id
FROM orders o
WHERE op.order_id = o.id
  AND op.merchant_id IS NULL
  AND o.merchant_id IS NOT NULL;
