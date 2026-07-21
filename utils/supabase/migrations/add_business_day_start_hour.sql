-- Add business day start hour to locations
-- Allows merchants to define when their business day rolls over (e.g., 4 = 4am)
-- Default 0 = midnight rollover
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint DEFAULT 0;

-- Add constraint separately (IF NOT EXISTS not supported for constraints, so use DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_business_day_start_hour_range'
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT chk_business_day_start_hour_range
      CHECK (business_day_start_hour BETWEEN 0 AND 23);
  END IF;
END $$;

-- Composite index for date-range queries on orders
-- Non-partial: covers both active and history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_location_created_at_desc
  ON orders (location_id, created_at DESC);
