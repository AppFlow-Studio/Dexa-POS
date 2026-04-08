-- Backfill terminal_id for existing Castles payments
-- The terminal ID is already stored in terminal_response JSONB but was never written to the terminal_id column
UPDATE order_payments
SET terminal_id = (terminal_response->'castles_transaction'->>'terminalId')::uuid
WHERE terminal_type = 'castles'
  AND terminal_id IS NULL
  AND terminal_response->'castles_transaction'->>'terminalId' IS NOT NULL;

-- Backfill terminal_id for existing Dejavoo payments
UPDATE order_payments
SET terminal_id = (terminal_response->'dejavoo_transaction'->>'terminalId')::uuid
WHERE terminal_type = 'dejavoo'
  AND terminal_id IS NULL
  AND terminal_response->'dejavoo_transaction'->>'terminalId' IS NOT NULL;

-- Fallback: check top-level terminal_id in terminal_response
UPDATE order_payments
SET terminal_id = (terminal_response->>'terminal_id')::uuid
WHERE terminal_id IS NULL
  AND terminal_response->>'terminal_id' IS NOT NULL;
