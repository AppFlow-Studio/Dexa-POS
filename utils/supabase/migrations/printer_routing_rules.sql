-- ============================================================================
-- Migration: printer_routing_rules.sql
-- Per-printer routing rules for kitchen/bar printers
-- Mirrors kds_routing_rules pattern
-- ============================================================================

-- Add routing columns to printers table
ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS routing_mode TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS print_modifiers BOOLEAN NOT NULL DEFAULT true;

-- Create printer_routing_rules table
CREATE TABLE IF NOT EXISTS printer_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (printer_id, rule_type, rule_value)
);

CREATE INDEX IF NOT EXISTS idx_printer_routing_rules_printer
  ON printer_routing_rules (printer_id);

COMMENT ON TABLE printer_routing_rules IS
'Per-printer routing rules for kitchen/bar printers. rule_type: category, menu_item, order_type. Mirrors kds_routing_rules pattern.';
