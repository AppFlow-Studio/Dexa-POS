-- Add show_customer_phone toggle to receipt_templates.
--
-- Default true so existing rows surface the customer phone when the order
-- carries one — opt-out matches the rest of the `show_*` family (tax
-- breakdown, server name, order type, etc. all default true).
--
-- Used by the printed-receipt renderers (Landi + Star + ESC/POS) and the
-- in-app preview to gate the customer phone row.

ALTER TABLE receipt_templates
  ADD COLUMN IF NOT EXISTS show_customer_phone boolean DEFAULT true NOT NULL;
