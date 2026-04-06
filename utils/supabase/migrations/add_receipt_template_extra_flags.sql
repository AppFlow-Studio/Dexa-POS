-- Add flags for the new receipt template types (no_sale, void_order, time_sheet).
-- These are opt-out: defaults preserve existing behavior.

ALTER TABLE receipt_templates
  ADD COLUMN IF NOT EXISTS show_void_reason boolean NOT NULL DEFAULT true;

ALTER TABLE receipt_templates
  ADD COLUMN IF NOT EXISTS show_approved_by boolean NOT NULL DEFAULT true;

ALTER TABLE receipt_templates
  ADD COLUMN IF NOT EXISTS show_break_details boolean NOT NULL DEFAULT true;
