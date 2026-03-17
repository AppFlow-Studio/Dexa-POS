ALTER TABLE receipt_templates
  ADD COLUMN IF NOT EXISTS modifier_style text NOT NULL DEFAULT 'inverted';
