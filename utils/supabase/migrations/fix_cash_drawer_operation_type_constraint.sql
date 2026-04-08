-- Fix valid_operation_type constraint to include all operation types
-- The original constraint was missing: no_sale, cash_drop, tip_out, opening_count, closing_count
ALTER TABLE cash_drawer_operations DROP CONSTRAINT IF EXISTS valid_operation_type;

ALTER TABLE cash_drawer_operations ADD CONSTRAINT valid_operation_type CHECK (
  operation_type IN (
    'cash_sale', 'cash_refund', 'pay_in', 'pay_out',
    'no_sale', 'cash_drop', 'tip_out',
    'opening_count', 'closing_count'
  )
);

-- Drop view that depends on cash_drawer_operations.amount before altering column types
DROP VIEW IF EXISTS v_eod_cash_summary;

-- Fix integer columns to NUMERIC for monetary values (decimal amounts like $14.43)
ALTER TABLE cash_drawer_operations
  ALTER COLUMN amount TYPE NUMERIC(12,2),
  ALTER COLUMN balance_after TYPE NUMERIC(12,2);

ALTER TABLE cash_drawer_sessions
  ALTER COLUMN opening_amount TYPE NUMERIC(12,2),
  ALTER COLUMN closing_amount TYPE NUMERIC(12,2),
  ALTER COLUMN expected_cash TYPE NUMERIC(12,2),
  ALTER COLUMN variance TYPE NUMERIC(12,2);

-- Recreate the v_eod_cash_summary view
CREATE OR REPLACE VIEW v_eod_cash_summary AS
SELECT
  s.cash_drawer_id,
  d.name AS drawer_name,
  d.location_id,
  s.opened_by,
  s.closed_by,
  s.opening_amount,
  s.closing_amount,
  s.expected_cash,
  s.variance,
  CASE
    WHEN s.variance IS NULL THEN 'pending'
    WHEN s.variance = 0 THEN 'balanced'
    WHEN ABS(s.variance) <= 1.00 THEN 'acceptable'
    ELSE 'discrepancy'
  END AS variance_status,
  (s.opened_at AT TIME ZONE 'UTC')::date AS business_date,
  COALESCE(SUM(CASE WHEN o.operation_type = 'cash_sale' THEN o.amount ELSE 0 END), 0) AS total_cash_sales,
  COALESCE(SUM(CASE WHEN o.operation_type = 'cash_refund' THEN o.amount ELSE 0 END), 0) AS total_cash_refunds,
  COALESCE(SUM(CASE WHEN o.operation_type = 'pay_in' THEN o.amount ELSE 0 END), 0) AS total_pay_ins,
  COALESCE(SUM(CASE WHEN o.operation_type = 'pay_out' THEN o.amount ELSE 0 END), 0) AS total_pay_outs,
  COALESCE(SUM(CASE WHEN o.operation_type = 'cash_drop' THEN o.amount ELSE 0 END), 0) AS total_cash_drops,
  COALESCE(COUNT(CASE WHEN o.operation_type = 'no_sale' THEN 1 END), 0) AS no_sale_count
FROM cash_drawer_sessions s
JOIN cash_drawers d ON d.id = s.cash_drawer_id
LEFT JOIN cash_drawer_operations o ON o.session_id = s.id
GROUP BY s.id, s.cash_drawer_id, d.name, d.location_id,
         s.opened_by, s.closed_by, s.opening_amount,
         s.closing_amount, s.expected_cash, s.variance, s.opened_at;
