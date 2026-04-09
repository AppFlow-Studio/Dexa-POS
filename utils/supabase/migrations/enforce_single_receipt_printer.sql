-- Enforce single default receipt printer per station
-- Multiple default kitchen printers are allowed (no constraint)

-- Step 1: Cleanup — if multiple is_default_receipt = true exist per station, keep only the most recent
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY station_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM printers
  WHERE is_default_receipt = true
    AND station_id IS NOT NULL
)
UPDATE printers
SET is_default_receipt = false
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: Unique partial index — at most 1 default receipt per station
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_receipt_per_station
  ON printers (station_id)
  WHERE is_default_receipt = true AND station_id IS NOT NULL;

