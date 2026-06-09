-- Rollback for station_receipt_printer_claim.sql.
-- Drops the new column + index. Backfill is not reversed because it only
-- mirrored existing is_default_receipt rows — those still exist on the
-- printers table.

DROP INDEX IF EXISTS idx_stations_current_receipt_printer_id;

ALTER TABLE stations
  DROP COLUMN IF EXISTS current_receipt_printer_id;
