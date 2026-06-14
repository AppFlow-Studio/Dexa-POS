-- Per-station receipt printer claim (DB-backed, soft sharing).
--
-- Each station gets one receipt printer. Multiple stations MAY point at the
-- same printer (N:1 allowed); UI surfaces the sharing via a "Used by N other
-- stations" chip. Routing remains permissive — collisions are absorbed by the
-- existing per-printer print queue + Star SDK InUseError retry path.
--
-- Replaces the previous MMKV-only model (useSettingsStore.defaultReceiptPrinterId)
-- as the source of truth. The legacy printers.is_default_receipt column +
-- enforce_single_receipt_printer.sql index stay in place as legacy; their
-- removal is a follow-up cleanup PR after we confirm nothing reads them.

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS current_receipt_printer_id uuid
  REFERENCES printers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stations_current_receipt_printer_id
  ON stations (current_receipt_printer_id)
  WHERE current_receipt_printer_id IS NOT NULL;

-- Backfill: for stations with a builtin/Dejavoo printer that already has
-- is_default_receipt = true (legacy path that only ever applied to printers
-- with a non-null station_id), mirror the binding into the new column so
-- existing claims survive the cutover.
UPDATE stations s
SET current_receipt_printer_id = p.id
FROM printers p
WHERE p.station_id = s.id
  AND p.is_default_receipt = true
  AND p.is_active = true
  AND s.current_receipt_printer_id IS NULL;
